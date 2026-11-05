/**
 * Run resource handlers against a deployed stack.
 *
 * Usage: ts-node lib/check.ts --resolved <evaluate.json> [--stack name] [--resources stack-resources.json] [--types T1,T2] [--out report.json] [--all]
 *   --resolved   output of scripts/evaluate.js (the toolkit-lib evaluate action)
 *   --stack      which evaluated stack to check (default: the first)
 *   --resources  ListStackResources output, for evaluate output without physicalResourceIds
 *   Credentials, region and endpoint come from the standard AWS environment. Only read calls are made.
 *   Prints failures, errors and gaps (--all: every check), and a summary.
 */
import * as fs from 'fs';
import * as path from 'path';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { Check, Client, Context, Handler } from './handler';

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const RESOLVED = arg('resolved')!;
const RESOURCES = arg('resources');
const STACK = arg('stack');
const TYPES = arg('types')?.split(',');
const OUT = arg('out');
const ALL = args.includes('--all');
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const READ_ONLY = /^(Get|Describe|List|Head|BatchGet)[A-Za-z0-9]*Command$/;
const SKIPPED_TYPES = (t: string) => t.startsWith('Custom::') || t === 'AWS::CDK::Metadata' || t === 'AWS::CloudFormation::CustomResource';

export const handlerFile = (type: string) => path.join(__dirname, '..', 'handlers', `${type.toLowerCase().replace(/::/g, '-')}.ts`);

interface Row { logicalId: string; type: string; property: string; status: string; detail?: string; expected?: unknown; actual?: unknown; mutationCaught?: boolean }

async function main() {
  const stacks: any[] = JSON.parse(fs.readFileSync(RESOLVED, 'utf-8')).stacks;
  const evaluated = STACK ? stacks.find((s) => s.stackName === STACK) : stacks[0];
  if (!evaluated) throw new Error(`no evaluated stack ${STACK ?? ''} in ${RESOLVED}`);
  const physical = new Map<string, string>(RESOURCES
    ? JSON.parse(fs.readFileSync(RESOURCES, 'utf-8')).map((r: any) => [r.LogicalResourceId, r.PhysicalResourceId])
    : Object.entries(evaluated.physicalResourceIds ?? {}));
  const account = (await new STSClient({ region: REGION }).send(new GetCallerIdentityCommand({}))).Account!;
  const clients = new Map<any, Client>();
  const calls = new Map<string, Promise<any>>();
  const send = (ClientClass: new (c: { region: string }) => Client, command: any): Promise<any> => {
    const name = command.constructor.name;
    if (!READ_ONLY.test(name)) {
      throw new Error(`${name} is not a read call`);
    }
    // with an endpoint override (the emulator), SQS must not send calls to the host in the queue URL
    const config = process.env.AWS_ENDPOINT_URL ? { region: REGION, useQueueUrlAsEndpoint: false } : { region: REGION };
    if (!clients.has(ClientClass)) clients.set(ClientClass, new ClientClass(config));
    const key = `${ClientClass.name}/${name}/${JSON.stringify(command.input)}`;
    if (!calls.has(key)) calls.set(key, clients.get(ClientClass)!.send(command));
    return calls.get(key)!;
  };

  const rows: Row[] = [];
  for (const [logicalId, resource] of Object.entries<any>(evaluated.template.Resources ?? {})) {
    const type: string = resource.Type;
    if (SKIPPED_TYPES(type) || (TYPES && !TYPES.includes(type))) continue;
    const physicalId = physical.get(logicalId);
    if (!physicalId) { rows.push({ logicalId, type, property: '(exists)', status: 'not deployed' }); continue; }
    if (!fs.existsSync(handlerFile(type))) { rows.push({ logicalId, type, property: '(exists)', status: 'no handler' }); continue; }
    const h: Handler = require(handlerFile(type)).default;
    const properties = resource.Properties ?? {};
    const ctx: Context = {
      logicalId, physicalId, properties, region: REGION, account, stackName: evaluated.stackName,
      physicalIdOf: (id: string) => { const p = physical.get(id); if (!p) throw new Error(`no physical id for ${id}`); return p; },
      send: (client, command) => send(client, command),
    };

    try {
      await send(h.client, h.exists(ctx));
      rows.push({ logicalId, type, property: '(exists)', status: 'pass' });
    } catch (e: any) {
      rows.push({ logicalId, type, property: '(exists)', status: 'missing', detail: `${e.name}: ${e.message}`.slice(0, 300) });
      continue;
    }

    for (const [key, c] of Object.entries<Check<any>>(h.properties)) {
      const value = valueAt(properties, key);
      if (value === undefined) continue; // not set in this template
      if (unresolved(value)) { rows.push({ logicalId, type, property: key, status: 'unresolved' }); continue; }
      try {
        const expected = c.expected ? await c.expected(value, ctx) : value;
        const response = await send(c.client ?? h.client, c.call(ctx));
        const actual = await c.actual(response, ctx);
        const comparison = c.compare ?? 'equals';
        if (compare(comparison, expected, actual)) {
          rows.push({ logicalId, type, property: key, status: 'pass', mutationCaught: !compare(comparison, mutate(expected), actual), expected, actual });
        } else {
          rows.push({ logicalId, type, property: key, status: 'fail', expected, actual });
        }
      } catch (e: any) {
        rows.push({ logicalId, type, property: key, status: 'error', detail: `${e.name}: ${e.message}`.slice(0, 300) });
      }
    }
    const covered = new Set([...Object.keys(h.properties).map((k) => k.split('.')[0]), ...Object.keys(h.skip ?? {})]);
    for (const p of Object.keys(properties)) {
      if (!covered.has(p)) rows.push({ logicalId, type, property: p, status: 'gap' });
    }
  }

  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v), 1));
  for (const r of rows) {
    if (ALL || r.status !== 'pass' || r.mutationCaught === false) {
      const extra = r.status === 'fail' ? ` expected=${short(r.expected)} actual=${short(r.actual)}` : r.detail ? ` ${r.detail}` : '';
      console.log(`${r.status.padEnd(12)} ${r.type} ${r.logicalId} ${r.property}${r.mutationCaught === false ? ' (ALTERED VALUE NOT CAUGHT)' : ''}${extra}`);
    }
  }
  const byStatus: { [s: string]: number } = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const notCaught = rows.filter((r) => r.mutationCaught === false).length;
  console.log(`summary: ${JSON.stringify(byStatus)}${notCaught ? `, altered value not caught: ${notCaught}` : ''}, ${calls.size} distinct calls`);
}

function valueAt(obj: any, key: string): any {
  return key.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

function unresolved(v: any): boolean {
  if (typeof v === 'string') return v.includes('{{resolve:');
  if (Array.isArray(v)) return v.some(unresolved);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && (keys[0] === 'Ref' || keys[0].startsWith('Fn::'))) return true;
    return Object.values(v).some(unresolved);
  }
  return false;
}

const scalar = (v: any) => (v === null || v === undefined ? v : typeof v === 'object' ? v : String(v));

function equals(a: any, b: any): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
    const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    return equals(ka, kb) && ka.every((k) => equals(a[k], b[k]));
  }
  return scalar(a) === scalar(b);
}

function subset(want: any, got: any): boolean {
  if (Array.isArray(want)) return Array.isArray(got) && want.every((w) => got.some((g) => subset(w, g)));
  if (want && typeof want === 'object') {
    return !!got && typeof got === 'object' && Object.entries(want).every(([k, v]) => v === undefined || subset(v, got[k]));
  }
  return scalar(want) === scalar(got);
}

function parseJson(v: any): any {
  if (typeof v !== 'string') return v;
  for (const candidate of [() => v, () => decodeURIComponent(v), () => JSON.parse(`"${v}"`)]) {
    try { return JSON.parse(candidate()); } catch { /* next */ }
  }
  return v;
}

/** JSON with object keys sorted, so equal values serialize the same whatever their key order */
const canonical = (v: any): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

/** Policy documents: a one-element list equals its element, list order doesn't matter */
function normalizePolicy(v: any): any {
  if (Array.isArray(v)) {
    const items = v.map(normalizePolicy).sort((x, y) => canonical(x).localeCompare(canonical(y)));
    return items.length === 1 ? items[0] : items;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizePolicy(x)]));
  return v;
}

function compare(how: string, expected: any, actual: any): boolean {
  if (how === 'subset') return subset(expected, actual);
  if (how === 'json') return equals(normalizePolicy(parseJson(expected)), normalizePolicy(parseJson(actual)));
  return equals(expected, actual);
}

function mutate(v: any): any {
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'number') return v + 7;
  if (typeof v === 'string') { const j = parseJson(v); return j !== v ? JSON.stringify(mutate(j)) : `${v}-altered`; }
  if (Array.isArray(v)) return v.length ? [mutate(v[0]), ...v.slice(1)] : ['altered'];
  if (v && typeof v === 'object') { const k = Object.keys(v).sort()[0]; return k === undefined ? { altered: 'x' } : { ...v, [k]: mutate(v[k]) }; }
  return 'altered';
}

const short = (v: unknown) => JSON.stringify(v)?.slice(0, 200);

main().catch((e) => { console.error(e); process.exit(1); });
