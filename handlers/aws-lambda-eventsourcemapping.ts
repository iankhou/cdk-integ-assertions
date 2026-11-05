import { GetEventSourceMappingCommand, GetEventSourceMappingCommandOutput, LambdaClient, ListTagsCommand } from '@aws-sdk/client-lambda';
import { check, Context, handler } from '../lib/handler';

// Physical id is the mapping's UUID.
const get = (ctx: Context) => new GetEventSourceMappingCommand({ UUID: ctx.physicalId });
const esm = (pick: (r: GetEventSourceMappingCommandOutput) => unknown) => check<GetEventSourceMappingCommandOutput>({ call: get, actual: pick });
const functionArn = (v: string, ctx: Context) => (v.startsWith('arn:') ? v : `arn:aws:lambda:${ctx.region}:${ctx.account}:function:${v}`);

export default handler({
  type: 'AWS::Lambda::EventSourceMapping',
  client: LambdaClient,
  exists: get,
  properties: {
    // Template may give a name, partial or full ARN; API returns the function ARN
    FunctionName: { ...esm((r) => r.FunctionArn), expected: functionArn },
    EventSourceArn: esm((r) => r.EventSourceArn),
    BatchSize: esm((r) => r.BatchSize),
    // API reports State (Enabled/Disabled, or a transitional Enabling/Disabling)
    Enabled: {
      ...esm((r) => r.State?.replace(/^Enabling$/, 'Enabled').replace(/^Disabling$/, 'Disabled')),
      expected: (v: boolean | string) => (String(v) === 'true' ? 'Enabled' : 'Disabled'),
    },
    FunctionResponseTypes: esm((r) => r.FunctionResponseTypes),
    ScalingConfig: esm((r) => r.ScalingConfig),
    MaximumBatchingWindowInSeconds: esm((r) => r.MaximumBatchingWindowInSeconds),
    StartingPosition: esm((r) => r.StartingPosition),
    StartingPositionTimestamp: esm((r) => (r.StartingPositionTimestamp ? r.StartingPositionTimestamp.getTime() / 1000 : undefined)),
    ParallelizationFactor: esm((r) => r.ParallelizationFactor),
    MaximumRetryAttempts: esm((r) => r.MaximumRetryAttempts),
    MaximumRecordAgeInSeconds: esm((r) => r.MaximumRecordAgeInSeconds),
    BisectBatchOnFunctionError: esm((r) => r.BisectBatchOnFunctionError),
    TumblingWindowInSeconds: esm((r) => r.TumblingWindowInSeconds),
    FilterCriteria: esm((r) => r.FilterCriteria),
    DestinationConfig: esm((r) => r.DestinationConfig),
    KmsKeyArn: esm((r) => r.KMSKeyArn),
    Queues: esm((r) => r.Queues),
    Topics: esm((r) => r.Topics),
    SourceAccessConfigurations: esm((r) => r.SourceAccessConfigurations),
    SelfManagedEventSource: esm((r) => r.SelfManagedEventSource),
    MetricsConfig: esm((r) => r.MetricsConfig),
    LoggingConfig: esm((r) => r.LoggingConfig),
    ProvisionedPollerConfig: { ...esm((r) => r.ProvisionedPollerConfig), compare: 'subset' },
    DocumentDBEventSourceConfig: esm((r) => r.DocumentDBEventSourceConfig),
    AmazonManagedKafkaEventSourceConfig: { ...esm((r) => r.AmazonManagedKafkaEventSourceConfig), compare: 'subset' },
    SelfManagedKafkaEventSourceConfig: { ...esm((r) => r.SelfManagedKafkaEventSourceConfig), compare: 'subset' },
    Tags: check({
      call: (ctx) => new ListTagsCommand({ Resource: `arn:aws:lambda:${ctx.region}:${ctx.account}:event-source-mapping:${ctx.physicalId}` }),
      expected: (v: { Key: string; Value: string }[]) => Object.fromEntries(v.map((t) => [t.Key, t.Value])),
      actual: (r) => r.Tags,
      compare: 'subset',
    }),
  },
});
