import { CloudWatchLogsClient, DescribeMetricFiltersCommand, DescribeMetricFiltersCommandOutput, MetricFilter } from '@aws-sdk/client-cloudwatch-logs';
import { check, Context, handler } from '../lib/handler';

// Physical id is the filter name; DescribeMetricFilters filters by prefix, so pick the exact name.
const describe = (ctx: Context) => new DescribeMetricFiltersCommand({ logGroupName: ctx.properties.LogGroupName, filterNamePrefix: ctx.physicalId });
const filter = (pick: (f: MetricFilter | undefined) => unknown, expected?: (v: any) => unknown) =>
  check<DescribeMetricFiltersCommandOutput>({
    call: describe,
    actual: (r, ctx) => pick(r.metricFilters?.find((f) => f.filterName === ctx.physicalId)),
    expected,
  });

export default handler({
  type: 'AWS::Logs::MetricFilter',
  client: CloudWatchLogsClient,
  exists: describe,
  properties: {
    FilterName: filter((f) => f?.filterName),
    LogGroupName: filter((f) => f?.logGroupName),
    FilterPattern: filter((f) => f?.filterPattern),
    MetricTransformations: filter(
      (f) => f?.metricTransformations,
      (ts: any[]) => ts.map((t) => ({
        metricName: t.MetricName,
        metricNamespace: t.MetricNamespace,
        metricValue: t.MetricValue,
        defaultValue: t.DefaultValue === undefined ? undefined : Number(t.DefaultValue),
        dimensions: t.Dimensions && Object.fromEntries(t.Dimensions.map((d: any) => [d.Key, d.Value])),
        unit: t.Unit,
      })),
    ),
    ApplyOnTransformedLogs: filter((f) => f?.applyOnTransformedLogs),
    FieldSelectionCriteria: filter((f) => f?.fieldSelectionCriteria),
    EmitSystemFieldDimensions: filter((f) => f?.emitSystemFieldDimensions),
  },
});
