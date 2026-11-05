import { GetPolicyCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { check, handler } from '../lib/handler';

// A permission is one statement (Sid = physical id) in the function's resource policy.
const getPolicy = (ctx: { properties: any }) => new GetPolicyCommand({ FunctionName: ctx.properties.FunctionName });
const statement = (res: { Policy?: string }, ctx: { physicalId: string }) =>
  JSON.parse(res.Policy ?? '{"Statement":[]}').Statement.find((s: any) => s.Sid === ctx.physicalId);
const condition = (op: string, key: string) => (res: { Policy?: string }, ctx: { physicalId: string }) =>
  statement(res, ctx)?.Condition?.[op]?.[key];

export default handler({
  type: 'AWS::Lambda::Permission',
  client: LambdaClient,
  exists: getPolicy,
  properties: {
    Action: check({ call: getPolicy, actual: (res, ctx) => statement(res, ctx)?.Action }),
    // The statement's Resource is the function ARN; the template may give a name or ARN.
    FunctionName: check({
      call: getPolicy,
      actual: (res, ctx) => statement(res, ctx)?.Resource,
      expected: (v: string, ctx) => v.startsWith('arn:') ? v : `arn:aws:lambda:${ctx.region}:${ctx.account}:function:${v}`,
    }),
    // Service principals become {Service: x}, account ids {AWS: arn:aws:iam::<id>:root}, '*' stays '*'.
    Principal: check({
      call: getPolicy,
      actual: (res, ctx) => statement(res, ctx)?.Principal,
      expected: (v: string) => v === '*' ? '*'
        : /^\d{12}$/.test(v) ? { AWS: `arn:aws:iam::${v}:root` }
        : v.startsWith('arn:') ? { AWS: v }
        : { Service: v },
    }),
    SourceArn: check({ call: getPolicy, actual: condition('ArnLike', 'AWS:SourceArn') }),
    SourceAccount: check({ call: getPolicy, actual: condition('StringEquals', 'AWS:SourceAccount') }),
    PrincipalOrgID: check({ call: getPolicy, actual: condition('StringEquals', 'aws:PrincipalOrgID') }),
    EventSourceToken: check({ call: getPolicy, actual: condition('StringEquals', 'lambda:EventSourceToken') }),
    FunctionUrlAuthType: check({ call: getPolicy, actual: condition('StringEquals', 'lambda:FunctionUrlAuthType') }),
    InvokedViaFunctionUrl: check({ call: getPolicy, actual: condition('Bool', 'lambda:InvokedViaFunctionUrl') }),
  },
});
