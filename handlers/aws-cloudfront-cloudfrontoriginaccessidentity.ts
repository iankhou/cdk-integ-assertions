import { CloudFrontClient, GetCloudFrontOriginAccessIdentityCommand } from '@aws-sdk/client-cloudfront';
import { check, handler } from '../lib/handler';

// The physical id is the OAI id.
const get = (ctx: { physicalId: string }) => new GetCloudFrontOriginAccessIdentityCommand({ Id: ctx.physicalId });

export default handler({
  type: 'AWS::CloudFront::CloudFrontOriginAccessIdentity',
  client: CloudFrontClient,
  exists: get,
  properties: {
    'CloudFrontOriginAccessIdentityConfig.Comment': check({
      call: get,
      actual: (res) => res.CloudFrontOriginAccessIdentity?.CloudFrontOriginAccessIdentityConfig?.Comment,
    }),
  },
});
