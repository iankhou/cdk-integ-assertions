import {
  ApplicationAutoScalingClient,
  DescribeScalingPoliciesCommand,
  ServiceNamespace,
} from '@aws-sdk/client-application-auto-scaling';
import { check, handler } from '../lib/handler';

/** Physical id: arn:aws:autoscaling:<region>:<account>:scalingPolicy:<uuid>:resource/<namespace>/<resourceId>:policyName/<name> */
const describe = (ctx: { physicalId: string }) => {
  const m = /:resource\/([^/]+)\/(.+):policyName\/(.+)$/.exec(ctx.physicalId)!;
  return new DescribeScalingPoliciesCommand({ ServiceNamespace: m[1] as ServiceNamespace, ResourceId: m[2], PolicyNames: [m[3]] });
};
const policy = (res: any) => res.ScalingPolicies?.[0];
const num = (v: any) => (v === undefined ? undefined : Number(v));

const byBound = (l?: any[]) => l && [...l].sort((x, y) => (x.MetricIntervalLowerBound ?? -Infinity) - (y.MetricIntervalLowerBound ?? -Infinity));
const stepConfig = (c: any) => ({
  AdjustmentType: c.AdjustmentType,
  Cooldown: num(c.Cooldown),
  MetricAggregationType: c.MetricAggregationType,
  MinAdjustmentMagnitude: num(c.MinAdjustmentMagnitude),
  StepAdjustments: byBound(c.StepAdjustments?.map((s: any) => ({
    MetricIntervalLowerBound: num(s.MetricIntervalLowerBound),
    MetricIntervalUpperBound: num(s.MetricIntervalUpperBound),
    ScalingAdjustment: num(s.ScalingAdjustment),
  }))),
});

export default handler({
  type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
  client: ApplicationAutoScalingClient,
  // no read call fails for a missing policy (DescribeScalingPolicies returns an empty list); the checks then fail
  exists: describe,
  properties: {
    PolicyName: check({ call: describe, actual: (res) => policy(res)?.PolicyName }),
    PolicyType: check({ call: describe, actual: (res) => policy(res)?.PolicyType }),
    ResourceId: check({ call: describe, actual: (res) => policy(res)?.ResourceId }),
    ScalableDimension: check({ call: describe, actual: (res) => policy(res)?.ScalableDimension }),
    ServiceNamespace: check({ call: describe, actual: (res) => policy(res)?.ServiceNamespace }),
    ScalingTargetId: check({
      call: describe,
      actual: (res) => { const p = policy(res); return p && `${p.ResourceId}|${p.ScalableDimension}|${p.ServiceNamespace}`; },
      note: 'write-only; it is the target id ResourceId|ScalableDimension|ServiceNamespace',
    }),
    StepScalingPolicyConfiguration: check({
      call: describe,
      expected: stepConfig,
      // the API returns step adjustments in its own order
      actual: (res) => { const c = policy(res)?.StepScalingPolicyConfiguration; return c && { ...c, StepAdjustments: byBound(c.StepAdjustments) }; },
    }),
    TargetTrackingScalingPolicyConfiguration: check({
      call: describe,
      expected: (c: any) => ({
        TargetValue: num(c.TargetValue),
        DisableScaleIn: c.DisableScaleIn === undefined ? undefined : String(c.DisableScaleIn) === 'true',
        ScaleInCooldown: num(c.ScaleInCooldown),
        ScaleOutCooldown: num(c.ScaleOutCooldown),
        PredefinedMetricSpecification: c.PredefinedMetricSpecification,
        CustomizedMetricSpecification: c.CustomizedMetricSpecification,
      }),
      actual: (res) => policy(res)?.TargetTrackingScalingPolicyConfiguration,
      compare: 'subset',
      note: 'subset: ResourceLabel is write-only, API adds defaults',
    }),
    PredictiveScalingPolicyConfiguration: check({
      call: describe,
      actual: (res) => policy(res)?.PredictiveScalingPolicyConfiguration,
      compare: 'subset',
    }),
  },
});
