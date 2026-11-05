import { CloudWatchClient, GetDashboardCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudwatch';
import { check, handler } from '../lib/handler';

const get = (ctx: { physicalId: string }) => new GetDashboardCommand({ DashboardName: ctx.physicalId });

export default handler({
  type: 'AWS::CloudWatch::Dashboard',
  client: CloudWatchClient,
  exists: (ctx) => get(ctx),
  properties: {
    DashboardName: check({ call: get, actual: (res) => res.DashboardName }),
    DashboardBody: check({ call: get, actual: (res) => res.DashboardBody, compare: 'json' }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ ResourceARN: `arn:aws:cloudwatch::${ctx.account}:dashboard/${ctx.physicalId}` }),
      actual: (res) => res.Tags,
      compare: 'subset',
      note: 'CloudFormation may add aws:cloudformation:* tags',
    }),
  },
});
