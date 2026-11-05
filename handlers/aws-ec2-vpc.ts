import { DescribeVpcAttributeCommand, DescribeVpcEncryptionControlsCommand, DescribeVpcsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

const vpcs = (ctx: { physicalId: string }) => new DescribeVpcsCommand({ VpcIds: [ctx.physicalId] });

export default handler({
  type: 'AWS::EC2::VPC',
  client: EC2Client,
  exists: vpcs,
  properties: {
    CidrBlock: check({ call: vpcs, actual: (r) => r.Vpcs?.[0]?.CidrBlock }),
    InstanceTenancy: check({ call: vpcs, actual: (r) => r.Vpcs?.[0]?.InstanceTenancy }),
    EnableDnsSupport: check({
      call: (ctx) => new DescribeVpcAttributeCommand({ VpcId: ctx.physicalId, Attribute: 'enableDnsSupport' }),
      actual: (r) => r.EnableDnsSupport?.Value,
    }),
    EnableDnsHostnames: check({
      call: (ctx) => new DescribeVpcAttributeCommand({ VpcId: ctx.physicalId, Attribute: 'enableDnsHostnames' }),
      actual: (r) => r.EnableDnsHostnames?.Value,
    }),
    'VpcEncryptionControl.Mode': check({
      call: (ctx) => new DescribeVpcEncryptionControlsCommand({ VpcIds: [ctx.physicalId] }),
      actual: (r) => r.VpcEncryptionControls?.[0]?.Mode,
    }),
    Tags: check({ call: vpcs, actual: (r) => r.Vpcs?.[0]?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
  skip: {
    Ipv4IpamPoolId: 'write-only',
    Ipv4NetmaskLength: 'write-only',
  },
});
