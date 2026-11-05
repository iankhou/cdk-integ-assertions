import { DescribeInternetGatewaysCommand, EC2Client } from '@aws-sdk/client-ec2';
import { check, handler } from '../lib/handler';

const igws = (ctx: { physicalId: string }) => new DescribeInternetGatewaysCommand({ InternetGatewayIds: [ctx.physicalId] });

export default handler({
  type: 'AWS::EC2::InternetGateway',
  client: EC2Client,
  exists: igws,
  properties: {
    Tags: check({ call: igws, actual: (r) => r.InternetGateways?.[0]?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
});
