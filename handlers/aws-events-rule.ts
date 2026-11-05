import { DescribeRuleCommand, EventBridgeClient, ListTagsForResourceCommand, ListTargetsByRuleCommand } from '@aws-sdk/client-eventbridge';
import { check, handler } from '../lib/handler';

/** Physical id is the rule name, or `bus|name` for a rule on a custom event bus */
function ids(ctx: { physicalId: string }) {
  const [bus, name] = ctx.physicalId.includes('|') ? ctx.physicalId.split('|') : [undefined, ctx.physicalId];
  return { Name: name, EventBusName: bus };
}
const describe = (ctx: { physicalId: string }) => new DescribeRuleCommand(ids(ctx));
const field = (pick: (r: any) => unknown, compare?: 'json') => check({ call: describe, actual: (res) => pick(res), compare });

/** A CloudFormation target in the API's shape (ECS parameters are renamed) */
function target(t: any) {
  if (!t.EcsParameters) return t;
  const { TagList, PlacementStrategies, ...ecs } = t.EcsParameters;
  return { ...t, EcsParameters: { ...ecs, Tags: TagList, PlacementStrategy: PlacementStrategies } };
}
const byId = (a: any, b: any) => String(a.Id).localeCompare(String(b.Id));

export default handler({
  type: 'AWS::Events::Rule',
  client: EventBridgeClient,
  exists: (ctx) => describe(ctx),
  properties: {
    Name: field((r) => r.Name),
    EventBusName: field((r) => r.EventBusName),
    Description: field((r) => r.Description),
    State: field((r) => r.State),
    ScheduleExpression: field((r) => r.ScheduleExpression),
    EventPattern: field((r) => r.EventPattern, 'json'),
    RoleArn: field((r) => r.RoleArn),
    Targets: check({
      call: (ctx) => new ListTargetsByRuleCommand({ Rule: ids(ctx).Name, EventBusName: ids(ctx).EventBusName }),
      expected: (ts: any[]) => ts.map(target).sort(byId),
      actual: (res) => [...(res.Targets ?? [])].sort(byId),
      note: 'targets are unordered; sorted by Id',
    }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ ResourceARN: `arn:aws:events:${ctx.region}:${ctx.account}:rule/${ctx.physicalId.replace('|', '/')}` }),
      actual: (res) => res.Tags,
      compare: 'subset',
      note: 'CloudFormation may add aws:cloudformation:* tags',
    }),
  },
});
