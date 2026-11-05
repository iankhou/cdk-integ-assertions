import { DescribeNatGatewaysCommand, DescribeNatGatewaysCommandOutput, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

const nats = (ctx: { physicalId: string }) => new DescribeNatGatewaysCommand({ NatGatewayIds: [ctx.physicalId] });
const nat = (r: DescribeNatGatewaysCommandOutput) => r.NatGateways?.[0];
const addrs = (r: DescribeNatGatewaysCommandOutput, primary: boolean) =>
  nat(r)?.NatGatewayAddresses?.filter((a) => !!a.IsPrimary === primary) ?? [];
const sorted = (v: any[]) => [...v].sort();

export default handler({
  type: 'AWS::EC2::NatGateway',
  client: EC2Client,
  exists: nats,
  properties: {
    SubnetId: check({ call: nats, actual: (r) => nat(r)?.SubnetId }),
    VpcId: check({ call: nats, actual: (r) => nat(r)?.VpcId }),
    ConnectivityType: check({ call: nats, actual: (r) => nat(r)?.ConnectivityType }),
    AvailabilityMode: check({ call: nats, actual: (r) => nat(r)?.AvailabilityMode }),
    AllocationId: check({ call: nats, actual: (r) => addrs(r, true)[0]?.AllocationId }),
    PrivateIpAddress: check({ call: nats, actual: (r) => addrs(r, true)[0]?.PrivateIp }),
    SecondaryAllocationIds: check({
      call: nats,
      expected: sorted,
      actual: (r) => sorted(addrs(r, false).map((a) => a.AllocationId).filter((x) => x)),
    }),
    SecondaryPrivateIpAddresses: check({
      call: nats,
      expected: sorted,
      actual: (r) => sorted(addrs(r, false).map((a) => a.PrivateIp)),
    }),
    SecondaryPrivateIpAddressCount: check({ call: nats, actual: (r) => addrs(r, false).length }),
    AvailabilityZoneAddresses: check({
      call: nats,
      // Regional NAT gateways report one address per AZ/EIP; regroup them by AZ to match the template.
      expected: (v: any[]) => sorted(v.flatMap((z) => z.AllocationIds.map((id: string) => `${z.AvailabilityZone ?? z.AvailabilityZoneId}/${id}`))),
      actual: (r, ctx) => {
        const byId = (ctx.properties.AvailabilityZoneAddresses as any[]).some((z) => !z.AvailabilityZone);
        return sorted((nat(r)?.NatGatewayAddresses ?? []).filter((a) => a.AllocationId)
          .map((a) => `${byId ? a.AvailabilityZoneId : a.AvailabilityZone}/${a.AllocationId}`));
      },
    }),
    Tags: check({ call: nats, actual: (r) => nat(r)?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
  skip: {
    MaxDrainDurationSeconds: 'write-only',
  },
});
