import { DescribeRouteTablesCommand, DescribeRouteTablesCommandOutput, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

// The physical id is the association id; look up the route table holding it.
const byAssoc = (ctx: { physicalId: string }) =>
  new DescribeRouteTablesCommand({ Filters: [{ Name: 'association.route-table-association-id', Values: [ctx.physicalId] }] });
const assoc = (r: DescribeRouteTablesCommandOutput, id: string) =>
  r.RouteTables?.flatMap((t) => t.Associations ?? []).find((a) => a.RouteTableAssociationId === id);

export default handler({
  type: 'AWS::EC2::SubnetRouteTableAssociation',
  client: EC2Client,
  // DescribeRouteTables returns an empty list rather than failing for an unknown association id, so this checks the
  // route table exists; a missing association shows up as failing checks below.
  exists: (ctx) => new DescribeRouteTablesCommand({ RouteTableIds: [ctx.properties.RouteTableId] }),
  properties: {
    RouteTableId: check({ call: byAssoc, actual: (r, ctx) => assoc(r, ctx.physicalId)?.RouteTableId }),
    SubnetId: check({ call: byAssoc, actual: (r, ctx) => assoc(r, ctx.physicalId)?.SubnetId }),
  },
});
