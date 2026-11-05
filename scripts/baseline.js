#!/usr/bin/env node
/**
 * Baseline integ test snapshots on a real AWS account: for each snapshot, deploy its stacks, resolve each test stack's
 * template with the evaluate action, check its resources, then destroy. Writes `<stackName>.resolved.json` and
 * `<stackName>.checks.json` into the snapshot directory, the same files `integ-runner --resource-checks` writes.
 *
 * Usage: node scripts/baseline.js --snapshots <dir> --out <dir> [options]
 *   --snapshots DIR      directory searched for *.js.snapshot directories (e.g. aws-cdk's framework-integ/test)
 *   --out DIR            logs and status per test, and summary.json; a test with a status here is skipped (resumable)
 *   --regions R1,R2      regions to spread tests across (default: AWS_REGION, or us-east-1); each must be bootstrapped
 *   --per-region N       tests deployed at the same time in each region (default 2)
 *   --tests FILE         only these snapshots (one path per line, relative to --snapshots; # comments)
 *   --match REGEX        only snapshots whose path matches
 *   --last REGEX         run snapshots whose path matches after all the others (e.g. slow or expensive modules)
 *   --cleanup-retained   after destroying, delete resources the test's stacks retained (DeletionPolicy Retain),
 *                        through Cloud Control; resources it can't delete (e.g. deletion protection) are reported
 *   --retry-failed       run tests whose previous status is a failure again
 *   --cdk PATH           CDK CLI to deploy and destroy with (default: cdk on PATH)
 *
 * Credentials come from the standard AWS environment (AWS_PROFILE, an instance role, ...).
 * TOOLKIT_LIB / INTEG_RUNNER: built @aws-cdk/toolkit-lib and @aws-cdk/integ-runner with the evaluate action and
 * resource checks (default: .toolkit-lib, see scripts/build-aws-cdk-cli.sh).
 */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(`--${name}`);
const SNAPSHOTS = path.resolve(arg('snapshots') ?? usage());
const OUT = path.resolve(arg('out') ?? usage());
const REGIONS = (arg('regions') ?? process.env.AWS_REGION ?? 'us-east-1').split(',');
const PER_REGION = Number(arg('per-region', '2'));
const CDK = arg('cdk', 'cdk');
const CHECKER = path.resolve(__dirname, '..');
const CLI_REPO = path.join(CHECKER, '.toolkit-lib', 'packages', '@aws-cdk');
const INTEG_RUNNER = process.env.INTEG_RUNNER ?? path.join(CLI_REPO, 'integ-runner');
process.env.TOOLKIT_LIB ??= path.join(CLI_REPO, 'toolkit-lib');

const { resolvedSnapshot, writeResolvedSnapshots } = require(path.join(INTEG_RUNNER, 'lib/runner/resolved-snapshot'));
const { runResourceChecks, writeResourceCheckReports, formatResourceCheckSummary } = require(path.join(INTEG_RUNNER, 'lib/runner/resource-checks'));

function usage() {
  console.error('usage: node scripts/baseline.js --snapshots <dir> --out <dir> [options] (see the comment at the top of this file)');
  process.exit(2);
}

/** Every *.js.snapshot directory under `root`, as paths relative to it */
function findSnapshots(root) {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      // cdk-integ.out.* are integ-runner's working copies, not snapshots
      if (e.name.endsWith('.js.snapshot') && !e.name.startsWith('cdk-integ.out.')) found.push(path.relative(root, p));
      else walk(p);
    }
  };
  walk(root);
  return found.sort();
}

/** The stacks to deploy (test stacks and assertion stacks), and the test stacks to resolve and check, by hierarchical id */
function stacksOf(snapshot) {
  const integFile = path.join(snapshot, 'integ.json');
  if (!fs.existsSync(integFile)) {
    // a legacy test: every stack is a test stack
    const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, 'manifest.json'), 'utf-8'));
    const all = Object.entries(manifest.artifacts ?? {}).filter(([, a]) => a.type === 'aws:cloudformation:stack').map(([id, a]) => a.displayName ?? id);
    return { deploy: all, test: all };
  }
  const deploy = [];
  const test = [];
  for (const testCase of Object.values(JSON.parse(fs.readFileSync(integFile, 'utf-8')).testCases ?? {})) {
    deploy.push(...testCase.stacks);
    test.push(...testCase.stacks);
    if (testCase.assertionStack) deploy.push(testCase.assertionStack);
  }
  return { deploy: [...new Set(deploy)], test: [...new Set(test)] };
}

function run(command, commandArgs, { env, log, cwd }) {
  return new Promise((resolve) => {
    const out = fs.openSync(log, 'a');
    const proc = childProcess.spawn(command, commandArgs, { cwd: cwd ?? '/tmp', env: { ...process.env, ...env }, stdio: ['ignore', out, out] });
    proc.on('close', (code) => { fs.closeSync(out); resolve(code); });
    proc.on('error', (e) => { fs.appendFileSync(log, `${e}\n`); fs.closeSync(out); resolve(-1); });
  });
}

/** The last lines of a log that say why a command failed */
function failureOf(log) {
  const lines = fs.readFileSync(log, 'utf-8').split('\n').filter((l) => /FAILED|Error|error|❌/.test(l));
  return lines.slice(-3).join('\n').slice(0, 1000);
}

/** Resources a stack retained, that still exist; with `cleanup`, deleted through Cloud Control */
async function retainedResources(stacks, region, cleanup, log) {
  const left = [];
  for (const stack of stacks) {
    for (const [logicalId, r] of Object.entries(stack.template.Resources ?? {})) {
      const physicalId = stack.physicalResourceIds[logicalId];
      if (!physicalId || !['Retain', 'RetainExceptOnCreate'].includes(r.DeletionPolicy)) continue;
      const stackRegion = stack.stackId.split(':')[3] ?? region;
      const exists = childProcess.spawnSync('aws', ['cloudcontrol', 'get-resource', '--region', stackRegion, '--type-name', r.Type, '--identifier', physicalId], { encoding: 'utf-8' });
      if (exists.status !== 0) {
        if (!/ResourceNotFound/.test(exists.stderr)) left.push({ stack: stack.stackName, type: r.Type, physicalId, region: stackRegion, note: `could not check: ${exists.stderr.trim().slice(0, 200)}` });
        continue;
      }
      if (!cleanup) {
        left.push({ stack: stack.stackName, type: r.Type, physicalId, region: stackRegion });
        continue;
      }
      const code = await run('aws', ['cloudcontrol', 'delete-resource', '--region', stackRegion, '--type-name', r.Type, '--identifier', physicalId,
        '--query', 'ProgressEvent.RequestToken', '--output', 'text'], { log });
      left.push({ stack: stack.stackName, type: r.Type, physicalId, region: stackRegion, note: code === 0 ? 'deletion requested' : 'could not delete (see cleanup.log)' });
    }
  }
  return left;
}

async function baseline(test, region) {
  const snapshot = path.join(SNAPSHOTS, test);
  const dir = path.join(OUT, test.replace(/\//g, '__'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const env = { AWS_REGION: region, AWS_DEFAULT_REGION: region };
  const log = (name) => path.join(dir, name);
  const status = { test, region, started: new Date().toISOString() };
  const { deploy, test: testStacks } = stacksOf(snapshot);

  status.deploy = await run(CDK, ['deploy', '--app', snapshot, ...deploy, '--require-approval', 'never', '--concurrency', '4'], { env, log: log('deploy.log') });
  try {
    if (status.deploy !== 0) {
      status.result = 'deploy failed';
      status.reason = failureOf(log('deploy.log'));
      return status;
    }
    const evaluated = path.join(dir, 'evaluate.json');
    status.evaluate = await run('node', [path.join(CHECKER, 'scripts/evaluate.js'), snapshot, evaluated, ...testStacks], { env, log: log('evaluate.log') });
    if (status.evaluate !== 0) {
      status.result = 'evaluate failed';
      status.reason = failureOf(log('evaluate.log'));
      return status;
    }
    const stacks = JSON.parse(fs.readFileSync(evaluated, 'utf-8')).stacks;
    await writeResolvedSnapshots(snapshot, stacks.map(resolvedSnapshot));
    const { reports, errors } = runResourceChecks(stacks, { checkerDirectory: CHECKER, region, env: { AWS_DEFAULT_REGION: region } });
    await writeResourceCheckReports(snapshot, reports);
    status.checks = Object.fromEntries(reports.map((r) => [r.stackName, r.summary]));
    if (errors.length > 0) status.checkErrors = errors;
    status.result = 'baselined';
    fs.writeFileSync(log('checks.txt'), reports.map(formatResourceCheckSummary).join('\n') + '\n');
    status.stacks = stacks;
    return status;
  } finally {
    status.destroy = await run(CDK, ['destroy', '--app', snapshot, ...deploy, '--force'], { env, log: log('destroy.log') });
    if (status.destroy !== 0) status.destroyReason = failureOf(log('destroy.log'));
    if (status.stacks) {
      status.retained = await retainedResources(status.stacks, region, flag('cleanup-retained'), log('cleanup.log'));
      delete status.stacks;
    }
    status.finished = new Date().toISOString();
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status, null, 1));
    const checks = status.checks ? ` ${Object.values(status.checks).map((s) => Object.entries(s).map(([k, n]) => `${n} ${k}`).join(', ')).join(' | ')}` : '';
    console.log(`${new Date().toISOString()} ${region} ${status.result}${status.destroy !== 0 ? ' (DESTROY FAILED)' : ''} ${test}${checks}`);
  }
}

function previousStatus(test) {
  const f = path.join(OUT, test.replace(/\//g, '__'), 'status.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : undefined;
}

function summarize(all) {
  const statuses = all.map(previousStatus).filter(Boolean);
  const byResult = {};
  const checks = {};
  for (const s of statuses) {
    byResult[s.result] = (byResult[s.result] ?? 0) + 1;
    for (const summary of Object.values(s.checks ?? {})) {
      for (const [k, n] of Object.entries(summary)) checks[k] = (checks[k] ?? 0) + n;
    }
  }
  const summary = {
    tests: all.length,
    run: statuses.length,
    byResult,
    checks,
    destroyFailed: statuses.filter((s) => s.destroy !== 0).map((s) => s.test),
    retained: statuses.flatMap((s) => (s.retained ?? []).map((r) => ({ test: s.test, ...r }))),
    notBaselined: statuses.filter((s) => s.result !== 'baselined').map((s) => ({ test: s.test, result: s.result, reason: s.reason })),
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  return summary;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let tests = findSnapshots(SNAPSHOTS);
  if (arg('tests')) {
    const wanted = new Set(fs.readFileSync(arg('tests'), 'utf-8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
    tests = tests.filter((t) => wanted.has(t));
  }
  if (arg('match')) tests = tests.filter((t) => new RegExp(arg('match')).test(t));
  if (arg('last')) {
    const last = new RegExp(arg('last'));
    tests = [...tests.filter((t) => !last.test(t)), ...tests.filter((t) => last.test(t))];
  }
  const todo = tests.filter((t) => {
    const s = previousStatus(t);
    return !s || (flag('retry-failed') && s.result !== 'baselined');
  });
  console.log(`${tests.length} snapshots, ${todo.length} to run, ${PER_REGION} at a time in each of ${REGIONS.join(', ')}`);

  // one queue, a fixed number of workers per region
  let next = 0;
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.log('stopping after the running tests (Ctrl-C again to abort)'); process.once('SIGINT', () => process.exit(130)); });
  const worker = async (region) => {
    while (!stopping && next < todo.length) {
      const test = todo[next++];
      try {
        await baseline(test, region);
      } catch (e) {
        console.log(`${new Date().toISOString()} ${region} error ${test}: ${e.stack ?? e}`);
      }
    }
  };
  await Promise.all(REGIONS.flatMap((region) => Array.from({ length: PER_REGION }, () => worker(region))));
  const summary = summarize(tests);
  console.log(JSON.stringify({ run: summary.run, byResult: summary.byResult, checks: summary.checks, destroyFailed: summary.destroyFailed.length, retained: summary.retained.length }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
