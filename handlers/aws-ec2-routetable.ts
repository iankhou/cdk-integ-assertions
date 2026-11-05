import { DescribeRouteTablesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

const tables = (ctx: { physicalId: string }) => new DescribeRouteTablesCommand({ RouteTableIds: [ctx.physicalId] });

export default handler({
  type: 'AWS::EC2::RouteTable',
  client: EC2Client,
  exists: tables,
  properties: {
    VpcId: check({ call: tables, actual: (r) => r.RouteTables?.[0]?.VpcId }),
    Tags: check({ call: tables, actual: (r) => r.RouteTables?.[0]?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
});
