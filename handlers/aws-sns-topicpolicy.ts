import { GetTopicAttributesCommand, SNSClient } from '@aws-sdk/client-sns';
import { check, handler } from '../lib/handler';

// Physical id is the (first) topic ARN; the policy is the topic's Policy attribute.
const policyOf = (ctx: any, arn: string) => ctx.send(SNSClient, new GetTopicAttributesCommand({ TopicArn: arn })).then((r: any) => r.Attributes?.Policy);
const same = (a: string | undefined, b: unknown) => a !== undefined && JSON.stringify(sortKeys(JSON.parse(a))) === JSON.stringify(sortKeys(b));
const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

export default handler({
  type: 'AWS::SNS::TopicPolicy',
  client: SNSClient,
  exists: (ctx) => new GetTopicAttributesCommand({ TopicArn: ctx.physicalId }),
  properties: {
    PolicyDocument: check({
      call: (ctx) => new GetTopicAttributesCommand({ TopicArn: ctx.physicalId }),
      actual: (r) => r.Attributes?.Policy,
      compare: 'json',
    }),
    Topics: check({
      call: (ctx) => new GetTopicAttributesCommand({ TopicArn: ctx.physicalId }),
      // the topics (of those in the template) whose Policy attribute is the template's policy document
      actual: async (_r, ctx) => {
        const topics: string[] = ctx.properties.Topics;
        const policies = await Promise.all(topics.map((t) => policyOf(ctx, t).catch(() => undefined)));
        return topics.filter((_t, i) => same(policies[i], ctx.properties.PolicyDocument));
      },
    }),
  },
});
