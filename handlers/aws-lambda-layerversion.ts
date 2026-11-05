import { GetLayerVersionByArnCommand, GetLayerVersionByArnCommandOutput, LambdaClient } from '@aws-sdk/client-lambda';
import { check, Context, handler } from '../lib/handler';

// Physical id is the layer version ARN.
const get = (ctx: Context) => new GetLayerVersionByArnCommand({ Arn: ctx.physicalId });
const layer = (pick: (r: GetLayerVersionByArnCommandOutput) => unknown) => check<GetLayerVersionByArnCommandOutput>({ call: get, actual: pick });

export default handler({
  type: 'AWS::Lambda::LayerVersion',
  client: LambdaClient,
  exists: get,
  properties: {
    Description: layer((r) => r.Description),
    CompatibleRuntimes: layer((r) => r.CompatibleRuntimes),
    CompatibleArchitectures: layer((r) => r.CompatibleArchitectures),
    LicenseInfo: layer((r) => r.LicenseInfo),
    // LayerName may be a name or a layer ARN; API returns the layer ARN
    LayerName: { ...layer((r) => r.LayerArn?.split(':')[6]), expected: (v: string) => v.split(':').pop() },
  },
  skip: {
    Content: 'write-only; the API only returns a presigned download location and CodeSha256',
  },
});
