import { CloudWatchClient, DescribeAlarmsCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudwatch';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) => new DescribeAlarmsCommand({ AlarmNames: [ctx.physicalId], AlarmTypes: ['CompositeAlarm'] });
/** A check reading one field of the composite alarm from DescribeAlarms */
const field = (pick: (a: any) => unknown) =>
  check({ call: describe, actual: (res) => { const a = res.CompositeAlarms?.[0]; return a && pick(a); } });

export default handler({
  type: 'AWS::CloudWatch::CompositeAlarm',
  client: CloudWatchClient,
  exists: (ctx) => describe(ctx),
  properties: {
    AlarmName: field((a) => a.AlarmName),
    AlarmRule: field((a) => a.AlarmRule),
    AlarmDescription: field((a) => a.AlarmDescription),
    ActionsEnabled: field((a) => a.ActionsEnabled),
    AlarmActions: field((a) => a.AlarmActions),
    OKActions: field((a) => a.OKActions),
    InsufficientDataActions: field((a) => a.InsufficientDataActions),
    ActionsSuppressor: field((a) => a.ActionsSuppressor),
    ActionsSuppressorWaitPeriod: field((a) => a.ActionsSuppressorWaitPeriod),
    ActionsSuppressorExtensionPeriod: field((a) => a.ActionsSuppressorExtensionPeriod),
    ActionConfiguration: field((a) => a.ActionConfiguration),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ ResourceARN: `arn:aws:cloudwatch:${ctx.region}:${ctx.account}:alarm:${ctx.physicalId}` }),
      actual: (res) => res.Tags,
      compare: 'subset',
      note: 'CloudFormation may add aws:cloudformation:* tags',
    }),
  },
});
