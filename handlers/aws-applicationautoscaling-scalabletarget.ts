import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  DescribeScheduledActionsCommand,
  ListTagsForResourceCommand,
  ServiceNamespace,
} from '@aws-sdk/client-application-auto-scaling';
import { check, handler } from '../lib/handler';

/** Physical id is `ResourceId|ScalableDimension|ServiceNamespace` */
const ids = (ctx: { physicalId: string }) => {
  const [resourceId, dimension, namespace] = ctx.physicalId.split('|');
  return { ResourceId: resourceId, ScalableDimension: dimension as any, ServiceNamespace: namespace as ServiceNamespace };
};
const describe = (ctx: { physicalId: string }) => {
  const i = ids(ctx);
  return new DescribeScalableTargetsCommand({ ServiceNamespace: i.ServiceNamespace, ResourceIds: [i.ResourceId], ScalableDimension: i.ScalableDimension });
};
const target = (res: any) => res.ScalableTargets?.[0];
const bool = (v: any) => (v === undefined ? undefined : String(v) === 'true');
const date = (d: any) => (d === undefined ? undefined : new Date(d).toISOString());

export default handler({
  type: 'AWS::ApplicationAutoScaling::ScalableTarget',
  client: ApplicationAutoScalingClient,
  // no read call fails for a missing target (DescribeScalableTargets returns an empty list); the checks then fail
  exists: describe,
  properties: {
    ResourceId: check({ call: describe, actual: (res) => target(res)?.ResourceId }),
    ScalableDimension: check({ call: describe, actual: (res) => target(res)?.ScalableDimension }),
    ServiceNamespace: check({ call: describe, actual: (res) => target(res)?.ServiceNamespace }),
    MinCapacity: check({ call: describe, actual: (res) => target(res)?.MinCapacity }),
    MaxCapacity: check({ call: describe, actual: (res) => target(res)?.MaxCapacity }),
    RoleARN: check({
      call: describe,
      actual: (res) => target(res)?.RoleARN,
      note: 'write-only in the schema, but DescribeScalableTargets returns it',
    }),
    SuspendedState: check({
      call: describe,
      expected: (s: any) => ({
        DynamicScalingInSuspended: bool(s.DynamicScalingInSuspended) ?? false,
        DynamicScalingOutSuspended: bool(s.DynamicScalingOutSuspended) ?? false,
        ScheduledScalingSuspended: bool(s.ScheduledScalingSuspended) ?? false,
      }),
      actual: (res) => target(res)?.SuspendedState,
    }),
    ScheduledActions: check({
      call: (ctx) => {
        const i = ids(ctx);
        return new DescribeScheduledActionsCommand({ ServiceNamespace: i.ServiceNamespace, ResourceId: i.ResourceId, ScalableDimension: i.ScalableDimension });
      },
      expected: (a: any[]) => a.map((x) => ({
        ScheduledActionName: x.ScheduledActionName,
        Schedule: x.Schedule,
        Timezone: x.Timezone,
        StartTime: date(x.StartTime),
        EndTime: date(x.EndTime),
        ScalableTargetAction: x.ScalableTargetAction && {
          MinCapacity: x.ScalableTargetAction.MinCapacity, MaxCapacity: x.ScalableTargetAction.MaxCapacity,
        },
      })),
      actual: (res) => res.ScheduledActions?.map((x) => ({
        ScheduledActionName: x.ScheduledActionName,
        Schedule: x.Schedule,
        Timezone: x.Timezone === 'UTC' ? undefined : x.Timezone,
        StartTime: x.StartTime?.toISOString(),
        EndTime: x.EndTime?.toISOString(),
        ScalableTargetAction: x.ScalableTargetAction,
      })),
      note: 'UTC is the API default timezone',
    }),
    Tags: check({
      call: describe,
      expected: (tags: any[]) => Object.fromEntries(tags.map((t) => [t.Key, t.Value])),
      actual: async (res, ctx) => (await ctx.send(ApplicationAutoScalingClient,
        new ListTagsForResourceCommand({ ResourceARN: target(res)!.ScalableTargetARN! }))).Tags,
      compare: 'subset',
    }),
  },
});
