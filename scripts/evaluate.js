#!/usr/bin/env node
/**
 * Resolve deployed stacks' templates with the toolkit-lib evaluate action.
 *
 * Usage: node scripts/evaluate.js <cloud-assembly-dir> <out.json> [stack ...]
 *   stacks are selected like `cdk deploy` selects them (by hierarchical id, patterns allowed); default: all
 *   Credentials, region and endpoint come from the standard AWS environment (AWS_ENDPOINT_URL for an emulator).
 *   TOOLKIT_LIB: path to a built @aws-cdk/toolkit-lib with the evaluate action (default: .toolkit-lib, see scripts/build-aws-cdk-cli.sh)
 */
const fs = require('fs');
const path = require('path');

const [asmDir, out, ...stackPatterns] = process.argv.slice(2);
if (!asmDir || !out) {
  console.error('usage: node scripts/evaluate.js <cloud-assembly-dir> <out.json> [stack ...]');
  process.exit(2);
}
process.env.TOOLKIT_LIB ??= path.join(__dirname, '..', '.toolkit-lib', 'packages', '@aws-cdk', 'toolkit-lib');
const { Toolkit, StackSelectionStrategy, NonInteractiveIoHost } = require(process.env.TOOLKIT_LIB);

async function main() {
  const toolkit = new Toolkit({ unstableFeatures: ['evaluate'], ioHost: new NonInteractiveIoHost({ logLevel: 'error' }) });
  const cx = await toolkit.fromAssemblyDirectory(asmDir);
  const started = Date.now();
  const result = await toolkit.evaluate(cx, {
    stacks: stackPatterns.length > 0
      ? { strategy: StackSelectionStrategy.PATTERN_MUST_MATCH, patterns: stackPatterns }
      : { strategy: StackSelectionStrategy.ALL_STACKS },
  });
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  const report = (s, indent) => {
    const byFn = {};
    for (const u of s.unresolved) byFn[u.intrinsic] = (byFn[u.intrinsic] ?? 0) + 1;
    console.log(`${indent}${s.stackName}: ${Object.keys(s.template.Resources ?? {}).length} resources, ${s.unresolved.length} unresolved ${JSON.stringify(byFn)}`);
    for (const nested of Object.values(s.nestedStacks ?? {})) report(nested, indent + '  ');
  };
  result.stacks.forEach((s) => report(s, ''));
  if (result.notDeployed.length > 0) console.log(`not deployed: ${result.notDeployed.join(', ')}`);
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
