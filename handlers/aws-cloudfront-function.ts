import { CloudFrontClient, DescribeFunctionCommand, GetFunctionCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudfront';
import { check, handler } from '../lib/handler';

// The physical id is the function ARN (arn:aws:cloudfront::<account>:function/<name>); the API takes the name.
const name = (ctx: { physicalId: string }) => ctx.physicalId.split('/').pop()!;
const describe = (ctx: { physicalId: string }) => new DescribeFunctionCommand({ Name: name(ctx), Stage: 'DEVELOPMENT' });

export default handler({
  type: 'AWS::CloudFront::Function',
  client: CloudFrontClient,
  exists: describe,
  properties: {
    Name: check({ call: describe, actual: (res) => res.FunctionSummary?.Name }),
    'FunctionConfig.Comment': check({ call: describe, actual: (res) => res.FunctionSummary?.FunctionConfig?.Comment }),
    'FunctionConfig.Runtime': check({ call: describe, actual: (res) => res.FunctionSummary?.FunctionConfig?.Runtime }),
    'FunctionConfig.KeyValueStoreAssociations': check({
      call: describe,
      actual: (res) => res.FunctionSummary?.FunctionConfig?.KeyValueStoreAssociations?.Items ?? [],
    }),
    FunctionCode: check({
      call: (ctx) => new GetFunctionCommand({ Name: name(ctx), Stage: 'DEVELOPMENT' }),
      actual: (res) => res.FunctionCode && Buffer.from(res.FunctionCode).toString('utf-8'),
    }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ Resource: ctx.physicalId }),
      actual: (res) => res.Tags?.Items ?? [],
      compare: 'subset',
    }),
  },
  skip: {
    AutoPublish: 'write-only (whether CloudFormation publishes DEVELOPMENT to LIVE after each update)',
  },
});
