import { CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeLogGroupsCommandOutput, GetDataProtectionPolicyCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudwatch-logs';
import { check, Context, handler } from '../lib/handler';

// Physical id is the log group name. DescribeLogGroups filters by prefix, so pick the exact name.
const arn = (ctx: Context) => `arn:aws:logs:${ctx.region}:${ctx.account}:log-group:${ctx.physicalId}`;
const describe = (ctx: Context) => new DescribeLogGroupsCommand({ logGroupNamePrefix: ctx.physicalId });
type LogGroup = NonNullable<DescribeLogGroupsCommandOutput['logGroups']>[number];
const group = (pick: (g: LogGroup | undefined) => unknown) =>
  check<DescribeLogGroupsCommandOutput>({ call: describe, actual: (r, ctx) => pick(r.logGroups?.find((g) => g.logGroupName === ctx.physicalId)) });

export default handler({
  type: 'AWS::Logs::LogGroup',
  client: CloudWatchLogsClient,
  // DescribeLogGroups succeeds with an empty list for a missing group; ListTagsForResource fails instead
  exists: (ctx) => new ListTagsForResourceCommand({ resourceArn: arn(ctx) }),
  properties: {
    LogGroupName: group((g) => g?.logGroupName),
    RetentionInDays: group((g) => g?.retentionInDays),
    KmsKeyId: group((g) => g?.kmsKeyId),
    LogGroupClass: group((g) => g?.logGroupClass),
    DataProtectionPolicy: check({
      call: (ctx) => new GetDataProtectionPolicyCommand({ logGroupIdentifier: ctx.physicalId }),
      actual: (r) => r.policyDocument,
      compare: 'json',
    }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ resourceArn: arn(ctx) }),
      expected: (v: { Key: string; Value: string }[]) => Object.fromEntries(v.map((t) => [t.Key, t.Value])),
      actual: (r) => r.tags,
      compare: 'subset',
    }),
  },
});
