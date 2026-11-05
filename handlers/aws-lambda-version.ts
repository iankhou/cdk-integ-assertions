import { GetFunctionConfigurationCommand, GetFunctionConfigurationCommandOutput, GetProvisionedConcurrencyConfigCommand, GetRuntimeManagementConfigCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { check, Context, handler } from '../lib/handler';

// Physical id is the qualified function ARN (...:function:<name>:<version>).
const get = (ctx: Context) => new GetFunctionConfigurationCommand({ FunctionName: ctx.physicalId });
const conf = (pick: (r: GetFunctionConfigurationCommandOutput) => unknown) => check<GetFunctionConfigurationCommandOutput>({ call: get, actual: pick });
const fn = (ctx: Context) => ctx.physicalId.split(':').slice(0, 7).join(':');
const version = (ctx: Context) => ctx.physicalId.split(':')[7];

export default handler({
  type: 'AWS::Lambda::Version',
  client: LambdaClient,
  exists: get,
  properties: {
    FunctionName: {
      ...conf((r) => r.FunctionArn?.split(':')[6]),
      expected: (v: string) => (v.startsWith('arn:') ? v.split(':')[6] : v.split(':')[0]),
    },
    Description: conf((r) => r.Description),
    CodeSha256: conf((r) => r.CodeSha256),
    'ProvisionedConcurrencyConfig.ProvisionedConcurrentExecutions': check({
      call: (ctx) => new GetProvisionedConcurrencyConfigCommand({ FunctionName: fn(ctx), Qualifier: version(ctx) }),
      actual: (r) => r.RequestedProvisionedConcurrentExecutions,
    }),
    RuntimePolicy: check({
      call: (ctx) => new GetRuntimeManagementConfigCommand({ FunctionName: fn(ctx), Qualifier: version(ctx) }),
      actual: (r) => ({ UpdateRuntimeOn: r.UpdateRuntimeOn, RuntimeVersionArn: r.RuntimeVersionArn }),
      compare: 'subset',
    }),
  },
});
