import { GetFunctionEventInvokeConfigCommand, GetFunctionEventInvokeConfigCommandOutput, LambdaClient } from '@aws-sdk/client-lambda';
import { check, Context, handler } from '../lib/handler';

// Identified by FunctionName + Qualifier (physical id is "name|qualifier").
const get = (ctx: Context) => new GetFunctionEventInvokeConfigCommand({ FunctionName: ctx.properties.FunctionName, Qualifier: ctx.properties.Qualifier });
const cfg = (pick: (r: GetFunctionEventInvokeConfigCommandOutput) => unknown) => check<GetFunctionEventInvokeConfigCommandOutput>({ call: get, actual: pick });
const nameOf = (v: string) => (v.startsWith('arn:') ? v.split(':')[6] : v.split(':')[0]);

export default handler({
  type: 'AWS::Lambda::EventInvokeConfig',
  client: LambdaClient,
  exists: get,
  properties: {
    // API returns the qualified function ARN arn:aws:lambda:<region>:<account>:function:<name>:<qualifier>
    FunctionName: { ...cfg((r) => r.FunctionArn?.split(':')[6]), expected: nameOf },
    Qualifier: cfg((r) => r.FunctionArn?.split(':')[7] ?? '$LATEST'),
    MaximumRetryAttempts: cfg((r) => r.MaximumRetryAttempts),
    MaximumEventAgeInSeconds: cfg((r) => r.MaximumEventAgeInSeconds),
    DestinationConfig: cfg((r) => r.DestinationConfig),
  },
});
