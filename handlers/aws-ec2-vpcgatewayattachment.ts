import { DescribeInternetGatewaysCommand, DescribeVpnGatewaysCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler, Context } from '../lib/handler';

// Physical id is "<IGW|VGW>|<VpcId>". Gateways are looked up by the attached VPC, so the gateway ids are read back
// rather than used as input.
const vpcId = (ctx: Context) => ctx.physicalId.split('|')[1];
const igwsOfVpc = (ctx: Context) =>
  new DescribeInternetGatewaysCommand({ Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId(ctx)] }] });
const vgwsOfVpc = (ctx: Context) =>
  new DescribeVpnGatewaysCommand({ Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId(ctx)] }] });

export default handler({
  type: 'AWS::EC2::VPCGatewayAttachment',
  client: EC2Client,
  // Filtered Describe* calls don't fail on no match; this verifies the gateway exists, the checks verify the attachment.
  exists: (ctx) =>
    ctx.properties.InternetGatewayId
      ? new DescribeInternetGatewaysCommand({ InternetGatewayIds: [ctx.properties.InternetGatewayId] })
      : new DescribeVpnGatewaysCommand({ VpnGatewayIds: [ctx.properties.VpnGatewayId] }),
  properties: {
    InternetGatewayId: check({
      call: igwsOfVpc,
      actual: (r) => r.InternetGateways?.filter((g) => g.Attachments?.some((a) => ['available', 'attached'].includes(String(a.State)))).map((g) => g.InternetGatewayId),
      expected: (v) => [v],
    }),
    VpnGatewayId: check({
      call: vgwsOfVpc,
      actual: (r) => r.VpnGateways?.filter((g) => g.VpcAttachments?.some((a) => a.State === 'attached')).map((g) => g.VpnGatewayId),
      expected: (v) => [v],
    }),
    VpcId: check({
      call: (ctx) =>
        ctx.properties.InternetGatewayId
          ? new DescribeInternetGatewaysCommand({ InternetGatewayIds: [ctx.properties.InternetGatewayId] })
          : new DescribeVpnGatewaysCommand({ VpnGatewayIds: [ctx.properties.VpnGatewayId] }),
      actual: (r: any) => (r.InternetGateways?.[0]?.Attachments ?? r.VpnGateways?.[0]?.VpcAttachments)?.map((a: any) => a.VpcId),
      expected: (v) => [v],
    }),
  },
});
