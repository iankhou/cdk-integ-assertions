import { DescribeAddressesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

// Physical id is the public IP
const addrs = (ctx: { physicalId: string }) => new DescribeAddressesCommand({ PublicIps: [ctx.physicalId] });
const addr = (f: string) => check({ call: addrs, actual: (r) => (r.Addresses?.[0] as any)?.[f] });

export default handler({
  type: 'AWS::EC2::EIP',
  client: EC2Client,
  exists: addrs,
  properties: {
    Domain: addr('Domain'),
    NetworkBorderGroup: addr('NetworkBorderGroup'),
    InstanceId: addr('InstanceId'),
    PublicIpv4Pool: addr('PublicIpv4Pool'),
    Tags: check({ call: addrs, actual: (r) => r.Addresses?.[0]?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
  skip: {
    TransferAddress: 'write-only',
    IpamPoolId: 'write-only',
    Address: 'write-only',
  },
});
