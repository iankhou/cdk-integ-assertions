import { DescribeContinuousBackupsCommand, DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { check, handler } from '../lib/handler';

// The physical id is the table name
const describe = (ctx: { physicalId: string }) => new DescribeTableCommand({ TableName: ctx.physicalId });

export default handler({
  type: 'AWS::DynamoDB::GlobalTable',
  client: DynamoDBClient,
  exists: describe,
  properties: {
    TableName: check({ call: describe, actual: (res) => res.Table?.TableName }),
    AttributeDefinitions: check({
      call: describe,
      expected: (a: any[]) => [...a].sort((x, y) => x.AttributeName.localeCompare(y.AttributeName)),
      actual: (res) => [...(res.Table?.AttributeDefinitions ?? [])].sort((x, y) => x.AttributeName!.localeCompare(y.AttributeName!)),
      note: 'order is not significant',
    }),
    KeySchema: check({ call: describe, actual: (res) => res.Table?.KeySchema }),
    BillingMode: check({
      call: describe,
      // BillingModeSummary is absent for tables that have only ever been provisioned
      actual: (res) => res.Table?.BillingModeSummary?.BillingMode ?? 'PROVISIONED',
    }),
    'SSESpecification.SSEEnabled': check({
      call: describe,
      // with SSE disabled (AWS owned key) SSEDescription is absent
      actual: (res) => res.Table?.SSEDescription?.Status === 'ENABLED' || res.Table?.SSEDescription?.Status === 'ENABLING',
    }),
    'SSESpecification.SSEType': check({ call: describe, actual: (res) => res.Table?.SSEDescription?.SSEType }),
    StreamSpecification: check({
      call: describe,
      expected: (s: any) => ({ StreamEnabled: true, StreamViewType: s.StreamViewType }),
      actual: (res) => res.Table?.StreamSpecification,
    }),
    GlobalSecondaryIndexes: check({
      call: describe,
      expected: (g: any[]) => g.map((i) => ({ IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: i.Projection })),
      actual: (res) => res.Table?.GlobalSecondaryIndexes,
      compare: 'subset',
    }),
    LocalSecondaryIndexes: check({
      call: describe,
      expected: (g: any[]) => g.map((i) => ({ IndexName: i.IndexName, KeySchema: i.KeySchema, Projection: i.Projection })),
      actual: (res) => res.Table?.LocalSecondaryIndexes,
      compare: 'subset',
    }),
    TimeToLiveSpecification: check({
      call: (ctx) => new DescribeTimeToLiveCommand({ TableName: ctx.physicalId }),
      expected: (t: any) => ({
        AttributeName: t.AttributeName,
        TimeToLiveStatus: String(t.Enabled) === 'true' ? 'ENABLED' : 'DISABLED',
      }),
      actual: (res) => res.TimeToLiveDescription,
    }),
    Replicas: check({
      call: describe,
      expected: (r: any[]) => r.map((x) => x.Region).sort(),
      // a global table with a single replica reports no Replicas; the table itself is that replica
      actual: (res, ctx) => (res.Table?.Replicas?.length ? res.Table.Replicas.map((x) => x.RegionName) : [ctx.region]).sort(),
    }),
    'Replicas.0.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled': check({
      call: (ctx) => new DescribeContinuousBackupsCommand({ TableName: ctx.physicalId }),
      // only the replica in the stack's region can be read with this client
      expected: (v: any, ctx) => {
        if (ctx.properties.Replicas[0].Region !== ctx.region) throw new Error('replica 0 is not in the stack region');
        return v;
      },
      actual: (res) => res.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === 'ENABLED',
    }),
  },
  skip: {
    GlobalTableSourceArn: 'write-only',
  },
});
