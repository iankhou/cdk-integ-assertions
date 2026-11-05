import {
  DescribeContinuousBackupsCommand,
  DescribeContributorInsightsCommand,
  DescribeKinesisStreamingDestinationCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  GetResourcePolicyCommand,
  ListTagsOfResourceCommand,
} from '@aws-sdk/client-dynamodb';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) => new DescribeTableCommand({ TableName: ctx.physicalId });
const arn = (ctx: { physicalId: string; region: string; account: string }) => `arn:aws:dynamodb:${ctx.region}:${ctx.account}:table/${ctx.physicalId}`;
const byName = (a: any[]) => [...a].sort((x, y) => x.AttributeName.localeCompare(y.AttributeName));
const num = (v: any) => (v === undefined ? undefined : Number(v));
const bool = (v: any) => (v === undefined ? undefined : String(v) === 'true');
const throughput = (t: any) => t && { ReadCapacityUnits: num(t.ReadCapacityUnits), WriteCapacityUnits: num(t.WriteCapacityUnits) };
const onDemand = (t: any) => t && { MaxReadRequestUnits: num(t.MaxReadRequestUnits), MaxWriteRequestUnits: num(t.MaxWriteRequestUnits) };
const apiThroughput = (t: any) => t && { ReadCapacityUnits: t.ReadCapacityUnits, WriteCapacityUnits: t.WriteCapacityUnits };
const projection = (p: any) => p && { ProjectionType: p.ProjectionType, NonKeyAttributes: p.NonKeyAttributes };
const index = (i: any) => ({
  IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: projection(i.Projection),
  ProvisionedThroughput: throughput(i.ProvisionedThroughput), OnDemandThroughput: onDemand(i.OnDemandThroughput),
});
const apiIndex = (i: any) => ({
  IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: i.Projection,
  // on-demand tables report 0/0 throughput on indexes
  ProvisionedThroughput: i.ProvisionedThroughput?.ReadCapacityUnits ? apiThroughput(i.ProvisionedThroughput) : undefined,
  OnDemandThroughput: i.OnDemandThroughput?.MaxReadRequestUnits !== undefined && i.OnDemandThroughput.MaxReadRequestUnits !== -1 ? i.OnDemandThroughput : undefined,
});

export default handler({
  type: 'AWS::DynamoDB::Table',
  client: DynamoDBClient,
  exists: describe,
  properties: {
    TableName: check({ call: describe, actual: (res) => res.Table?.TableName }),
    AttributeDefinitions: check({
      call: describe,
      expected: (a: any[]) => byName(a),
      actual: (res) => byName(res.Table?.AttributeDefinitions ?? []),
      note: 'order-insensitive',
    }),
    KeySchema: check({ call: describe, actual: (res) => res.Table?.KeySchema }),
    BillingMode: check({
      call: describe,
      actual: (res) => res.Table?.BillingModeSummary?.BillingMode ?? 'PROVISIONED',
      note: 'tables created as PROVISIONED may have no BillingModeSummary',
    }),
    ProvisionedThroughput: check({ call: describe, expected: throughput, actual: (res) => apiThroughput(res.Table?.ProvisionedThroughput) }),
    OnDemandThroughput: check({ call: describe, expected: onDemand, actual: (res) => res.Table?.OnDemandThroughput }),
    WarmThroughput: check({
      call: describe,
      expected: (w: any) => ({ ReadUnitsPerSecond: num(w.ReadUnitsPerSecond), WriteUnitsPerSecond: num(w.WriteUnitsPerSecond) }),
      actual: (res) => res.Table?.WarmThroughput,
      compare: 'subset',
    }),
    GlobalSecondaryIndexes: check({
      call: describe,
      expected: (l: any[]) => l.map(index),
      actual: (res) => res.Table?.GlobalSecondaryIndexes?.map(apiIndex),
      compare: 'subset',
    }),
    LocalSecondaryIndexes: check({
      call: describe,
      expected: (l: any[]) => l.map((i) => ({ IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: projection(i.Projection) })),
      actual: (res) => res.Table?.LocalSecondaryIndexes?.map((i) => ({ IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: i.Projection })),
      compare: 'subset',
    }),
    StreamSpecification: check({
      call: describe,
      expected: (s: any) => ({ StreamEnabled: true, StreamViewType: s.StreamViewType }),
      actual: (res) => res.Table?.StreamSpecification,
    }),
    SSESpecification: check({
      call: describe,
      expected: (s: any) => (bool(s.SSEEnabled)
        ? { Status: 'ENABLED', SSEType: s.SSEType ?? 'KMS', ...(s.KMSMasterKeyId === undefined ? {} : { KMSMasterKeyArn: s.KMSMasterKeyId }) }
        : undefined),
      actual: (res) => res.Table?.SSEDescription && {
        Status: res.Table.SSEDescription.Status, SSEType: res.Table.SSEDescription.SSEType, KMSMasterKeyArn: res.Table.SSEDescription.KMSMasterKeyArn,
      },
      compare: 'subset',
      note: 'SSEEnabled false means the AWS-owned key: no SSEDescription. subset: the API reports the aws/dynamodb key ARN when no key is given',
    }),
    TableClass: check({ call: describe, actual: (res) => res.Table?.TableClassSummary?.TableClass ?? 'STANDARD' }),
    DeletionProtectionEnabled: check({ call: describe, expected: bool, actual: (res) => res.Table?.DeletionProtectionEnabled }),
    PointInTimeRecoverySpecification: check({
      call: (ctx) => new DescribeContinuousBackupsCommand({ TableName: ctx.physicalId }),
      expected: (p: any) => ({
        PointInTimeRecoveryStatus: bool(p.PointInTimeRecoveryEnabled) ? 'ENABLED' : 'DISABLED',
        RecoveryPeriodInDays: bool(p.PointInTimeRecoveryEnabled) ? num(p.RecoveryPeriodInDays) ?? 35 : undefined,
      }),
      actual: (res) => {
        const d = res.ContinuousBackupsDescription?.PointInTimeRecoveryDescription;
        return { PointInTimeRecoveryStatus: d?.PointInTimeRecoveryStatus, RecoveryPeriodInDays: d?.RecoveryPeriodInDays };
      },
      note: 'RecoveryPeriodInDays defaults to 35',
    }),
    TimeToLiveSpecification: check({
      call: (ctx) => new DescribeTimeToLiveCommand({ TableName: ctx.physicalId }),
      expected: (t: any) => ({ AttributeName: bool(t.Enabled) ? t.AttributeName : undefined, TimeToLiveStatus: bool(t.Enabled) ? 'ENABLED' : 'DISABLED' }),
      actual: (res) => ({ AttributeName: res.TimeToLiveDescription?.AttributeName, TimeToLiveStatus: res.TimeToLiveDescription?.TimeToLiveStatus }),
    }),
    ContributorInsightsSpecification: check({
      call: (ctx) => new DescribeContributorInsightsCommand({ TableName: ctx.physicalId }),
      expected: (c: any) => (bool(c.Enabled) ? 'ENABLED' : 'DISABLED'),
      actual: (res) => res.ContributorInsightsStatus,
    }),
    KinesisStreamSpecification: check({
      call: (ctx) => new DescribeKinesisStreamingDestinationCommand({ TableName: ctx.physicalId }),
      expected: (k: any) => [{ StreamArn: k.StreamArn, DestinationStatus: 'ACTIVE' }],
      actual: (res) => res.KinesisDataStreamDestinations,
      compare: 'subset',
    }),
    ResourcePolicy: check({
      call: (ctx) => new GetResourcePolicyCommand({ ResourceArn: arn(ctx) }),
      expected: (p: any) => p.PolicyDocument,
      actual: (res) => res.Policy,
      compare: 'json',
    }),
    Tags: check({
      call: (ctx) => new ListTagsOfResourceCommand({ ResourceArn: arn(ctx) }),
      actual: (res) => res.Tags,
      compare: 'subset',
    }),
  },
  skip: {
    ImportSourceSpecification: 'write-only (import at creation)',
    VectorIndexes: 'not in the DynamoDB SDK types available here',
  },
});
