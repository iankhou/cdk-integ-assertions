import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { check, handler } from '../lib/handler';

// The physical id is a generated id with no read API; the policy lives on each queue in Queues
const policyOf = (url: string) => new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['Policy'] });
/** Keys sorted recursively: the 'json' comparison orders statements by their serialization, which depends on key order */
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
  : v;
const first = (ctx: { properties: any }) => policyOf(ctx.properties.Queues[0]);

export default handler({
  type: 'AWS::SQS::QueuePolicy',
  client: SQSClient,
  exists: first,
  properties: {
    PolicyDocument: check({
      call: first,
      // every queue must carry the document; report the first queue's policy, or a differing one
      actual: async (res, ctx) => {
        for (const url of ctx.properties.Queues.slice(1)) {
          const p = (await ctx.send(SQSClient, policyOf(url))).Attributes?.Policy;
          if (p !== res.Attributes?.Policy) return p ?? null;
        }
        return res.Attributes?.Policy && canonical(JSON.parse(res.Attributes.Policy));
      },
      expected: canonical,
      compare: 'json',
    }),
    Queues: check({
      call: first,
      // a queue is covered if it exists and carries a policy
      actual: async (_res, ctx) => {
        const out: string[] = [];
        for (const url of ctx.properties.Queues) {
          const p = await ctx.send(SQSClient, policyOf(url)).catch(() => undefined);
          if (p?.Attributes?.Policy) out.push(url);
        }
        return out;
      },
    }),
  },
});
