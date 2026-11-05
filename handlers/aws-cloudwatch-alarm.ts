import { CloudWatchClient, DescribeAlarmsCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudwatch';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) => new DescribeAlarmsCommand({ AlarmNames: [ctx.physicalId], AlarmTypes: ['MetricAlarm'] });
/** A check reading one field of the alarm from DescribeAlarms */
const field = (pick: (a: any) => unknown, expected?: (v: any) => unknown) =>
  check({ call: describe, actual: (res) => { const a = res.MetricAlarms?.[0]; return a && pick(a); }, expected });

/** CloudWatch reports a metric without dimensions as `Dimensions: []` */
const query = (q: any) => (q.MetricStat
  ? { ...q, MetricStat: { ...q.MetricStat, Metric: { Dimensions: [], ...q.MetricStat.Metric } } }
  : q);

export default handler({
  type: 'AWS::CloudWatch::Alarm',
  client: CloudWatchClient,
  exists: (ctx) => describe(ctx),
  properties: {
    AlarmName: field((a) => a.AlarmName),
    AlarmDescription: field((a) => a.AlarmDescription),
    ActionsEnabled: field((a) => a.ActionsEnabled),
    AlarmActions: field((a) => a.AlarmActions),
    OKActions: field((a) => a.OKActions),
    InsufficientDataActions: field((a) => a.InsufficientDataActions),
    ComparisonOperator: field((a) => a.ComparisonOperator),
    EvaluationPeriods: field((a) => a.EvaluationPeriods),
    DatapointsToAlarm: field((a) => a.DatapointsToAlarm),
    Threshold: field((a) => a.Threshold),
    ThresholdMetricId: field((a) => a.ThresholdMetricId),
    TreatMissingData: field((a) => a.TreatMissingData),
    EvaluateLowSampleCountPercentile: field((a) => a.EvaluateLowSampleCountPercentile),
    MetricName: field((a) => a.MetricName),
    Namespace: field((a) => a.Namespace),
    Dimensions: field((a) => a.Dimensions),
    Period: field((a) => a.Period),
    Statistic: field((a) => a.Statistic),
    ExtendedStatistic: field((a) => a.ExtendedStatistic),
    Unit: field((a) => a.Unit),
    Metrics: field((a) => a.Metrics, (qs: any[]) => qs.map(query)),
    EvaluationWindow: field((a) => a.EvaluationWindow),
    EvaluationCriteria: field((a) => a.EvaluationCriteria),
    EvaluationInterval: field((a) => a.EvaluationInterval),
    WarmUpConfiguration: field((a) => a.WarmUpConfiguration),
    ActionConfiguration: field((a) => a.ActionConfiguration),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ ResourceARN: `arn:aws:cloudwatch:${ctx.region}:${ctx.account}:alarm:${ctx.physicalId}` }),
      actual: (res) => res.Tags,
      compare: 'subset',
      note: 'CloudFormation may add aws:cloudformation:* tags',
    }),
  },
});
