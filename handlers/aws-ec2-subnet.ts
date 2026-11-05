import { DescribeSubnetsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

const subnets = (ctx: { physicalId: string }) => new DescribeSubnetsCommand({ SubnetIds: [ctx.physicalId] });
const sub = (field: string) => check({ call: subnets, actual: (r) => (r.Subnets?.[0] as any)?.[field] });

export default handler({
  type: 'AWS::EC2::Subnet',
  client: EC2Client,
  exists: subnets,
  properties: {
    VpcId: sub('VpcId'),
    AvailabilityZone: sub('AvailabilityZone'),
    AvailabilityZoneId: sub('AvailabilityZoneId'),
    CidrBlock: sub('CidrBlock'),
    MapPublicIpOnLaunch: sub('MapPublicIpOnLaunch'),
    AssignIpv6AddressOnCreation: sub('AssignIpv6AddressOnCreation'),
    OutpostArn: sub('OutpostArn'),
    Ipv6Native: sub('Ipv6Native'),
    EnableDns64: sub('EnableDns64'),
    EnableLniAtDeviceIndex: sub('EnableLniAtDeviceIndex'),
    Ipv6CidrBlock: check({
      call: subnets,
      actual: (r) => r.Subnets?.[0]?.Ipv6CidrBlockAssociationSet?.map((a) => a.Ipv6CidrBlock),
      expected: (v) => [v],
      compare: 'subset',
    }),
    PrivateDnsNameOptionsOnLaunch: check({
      call: subnets,
      actual: (r) => r.Subnets?.[0]?.PrivateDnsNameOptionsOnLaunch,
      compare: 'subset',
    }),
    Tags: check({ call: subnets, actual: (r) => r.Subnets?.[0]?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
  skip: {
    Ipv4IpamPoolId: 'write-only',
    Ipv4NetmaskLength: 'write-only',
    Ipv6IpamPoolId: 'write-only',
    Ipv6NetmaskLength: 'write-only',
  },
});
