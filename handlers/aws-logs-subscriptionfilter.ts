import { CloudWatchLogsClient, DescribeSubscriptionFiltersCommand, DescribeSubscriptionFiltersCommandOutput, SubscriptionFilter } from '@aws-sdk/client-cloudwatch-logs';
import { check, Context, handler } from '../lib/handler';

// Physical id is the filter name; DescribeSubscriptionFilters filters by prefix, so pick the exact name.
const describe = (ctx: Context) => new DescribeSubscriptionFiltersCommand({ logGroupName: ctx.properties.LogGroupName, filterNamePrefix: ctx.physicalId });
const filter = (pick: (f: SubscriptionFilter | undefined) => unknown) =>
  check<DescribeSubscriptionFiltersCommandOutput>({ call: describe, actual: (r, ctx) => pick(r.subscriptionFilters?.find((f) => f.filterName === ctx.physicalId)) });

export default handler({
  type: 'AWS::Logs::SubscriptionFilter',
  client: CloudWatchLogsClient,
  exists: describe,
  properties: {
    FilterName: filter((f) => f?.filterName),
    LogGroupName: filter((f) => f?.logGroupName),
    DestinationArn: filter((f) => f?.destinationArn),
    FilterPattern: filter((f) => f?.filterPattern),
    RoleArn: filter((f) => f?.roleArn),
    Distribution: filter((f) => f?.distribution),
    ApplyOnTransformedLogs: filter((f) => f?.applyOnTransformedLogs),
    FieldSelectionCriteria: filter((f) => f?.fieldSelectionCriteria),
    EmitSystemFields: filter((f) => f?.emitSystemFields),
  },
});
