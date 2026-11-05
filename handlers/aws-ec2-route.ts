import { DescribeRouteTablesCommand, DescribeRouteTablesCommandOutput, EC2Client, Route } from '@aws-sdk/client-ec2';
import { check, handler, Context } from '../lib/handler';

// Physical id is "<RouteTableId>|<destination>"
const table = (ctx: Context) => new DescribeRouteTablesCommand({ RouteTableIds: [ctx.physicalId.split('|')[0]] });
const route = (r: DescribeRouteTablesCommandOutput, ctx: Context): Route | undefined => {
  const dest = ctx.physicalId.split('|').slice(1).join('|');
  return r.RouteTables?.[0]?.Routes?.find(
    (x) => x.DestinationCidrBlock === dest || x.DestinationIpv6CidrBlock === dest || x.DestinationPrefixListId === dest,
  );
};
const field = (f: keyof Route) => check({ call: table, actual: (r, ctx) => route(r, ctx)?.[f] });

export default handler({
  type: 'AWS::EC2::Route',
  client: EC2Client,
  exists: table,
  properties: {
    RouteTableId: check({ call: table, actual: (r, ctx) => (route(r, ctx) ? r.RouteTables?.[0]?.RouteTableId : undefined) }),
    DestinationCidrBlock: field('DestinationCidrBlock'),
    DestinationIpv6CidrBlock: field('DestinationIpv6CidrBlock'),
    DestinationPrefixListId: field('DestinationPrefixListId'),
    CarrierGatewayId: field('CarrierGatewayId'),
    CoreNetworkArn: field('CoreNetworkArn'),
    EgressOnlyInternetGatewayId: field('EgressOnlyInternetGatewayId'),
    GatewayId: field('GatewayId'),
    InstanceId: field('InstanceId'),
    LocalGatewayId: field('LocalGatewayId'),
    NatGatewayId: field('NatGatewayId'),
    NetworkInterfaceId: field('NetworkInterfaceId'),
    TransitGatewayId: field('TransitGatewayId'),
    VpcPeeringConnectionId: field('VpcPeeringConnectionId'),
    OdbNetworkArn: field('OdbNetworkArn'),
    VpcEndpointId: check({
      call: table,
      actual: (r, ctx) => route(r, ctx)?.GatewayId,
      note: 'routes to (Gateway Load Balancer) VPC endpoints are reported in GatewayId',
    }),
  },
});
