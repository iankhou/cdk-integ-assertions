import { APIGatewayClient, GetRestApiCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

const get = check({ call: (ctx) => new GetRestApiCommand({ restApiId: ctx.physicalId }), actual: (res: any) => res });
/** Recursively sort object keys, so policy statements compare independent of key order */
const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const field = (f: (res: any) => unknown, extra: object = {}) => check({ ...get, actual: f, ...extra });

export default handler({
  type: 'AWS::ApiGateway::RestApi',
  client: APIGatewayClient,
  exists: (ctx) => new GetRestApiCommand({ restApiId: ctx.physicalId }),
  properties: {
    Name: field((r) => r.name),
    Description: field((r) => r.description),
    Version: field((r) => r.version),
    DisableExecuteApiEndpoint: field((r) => r.disableExecuteApiEndpoint),
    MinimumCompressionSize: field((r) => r.minimumCompressionSize),
    BinaryMediaTypes: field((r) => r.binaryMediaTypes),
    ApiKeySourceType: field((r) => r.apiKeySource),
    SecurityPolicy: field((r) => r.securityPolicy),
    EndpointAccessMode: field((r) => r.endpointAccessMode),
    EndpointConfiguration: check({
      ...get,
      expected: (e: any) => ({ types: e.Types, ipAddressType: e.IpAddressType, vpcEndpointIds: e.VpcEndpointIds }),
      // API Gateway reports the default ipAddressType (ipv4) when the template doesn't set one
      actual: (r: any, ctx) => ({
        ...r.endpointConfiguration,
        ipAddressType: ctx.properties.EndpointConfiguration.IpAddressType === undefined && r.endpointConfiguration?.ipAddressType === 'ipv4'
          ? undefined : r.endpointConfiguration?.ipAddressType,
      }),
    }),
    Policy: check({
      ...get,
      // API Gateway expands execute-api:/stage/method/path resources to full ARNs
      expected: (p: any, ctx) => sortKeys(JSON.parse(JSON.stringify(typeof p === 'string' ? JSON.parse(p) : p).replace(
        /"execute-api:\//g, `"arn:aws:execute-api:${ctx.region}:${ctx.account}:${ctx.physicalId}/`))),
      // the policy comes back as a backslash-escaped JSON string
      actual: (r: any) => r.policy && sortKeys(JSON.parse(JSON.parse(`"${r.policy}"`))),
      compare: 'json',
    }),
    Tags: check({
      ...get,
      expected: (tags: any[]) => Object.fromEntries(tags.map((t) => [t.Key, t.Value])),
      actual: (r: any) => r.tags,
      compare: 'subset',
      note: 'CloudFormation adds aws:cloudformation:* tags',
    }),
  },
  skip: {
    Body: 'write-only (OpenAPI import)',
    BodyS3Location: 'write-only (OpenAPI import)',
    CloneFrom: 'write-only',
    FailOnWarnings: 'write-only',
    Mode: 'write-only',
    Parameters: 'write-only',
  },
});
