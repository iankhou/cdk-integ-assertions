import { APIGatewayClient, GetMethodCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

/** drop unset fields, so subset comparison only looks at what the template sets */
const defined = (v: any) => JSON.parse(JSON.stringify(v));

// physical id is restApiId|resourceId|httpMethod
const ids = (ctx: { physicalId: string }) => ctx.physicalId.split('|');
const call = (ctx: any) => { const [restApiId, resourceId, httpMethod] = ids(ctx); return new GetMethodCommand({ restApiId, resourceId, httpMethod }); };
const num = (v: any) => (v === undefined ? undefined : Number(v));
const bools = (m: any) => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v) === 'true']));

function integration(i: any) {
  return {
    type: i.Type,
    httpMethod: i.IntegrationHttpMethod,
    uri: i.Uri,
    connectionType: i.ConnectionType,
    connectionId: i.ConnectionId,
    credentials: i.Credentials,
    requestParameters: i.RequestParameters,
    requestTemplates: i.RequestTemplates,
    passthroughBehavior: i.PassthroughBehavior,
    contentHandling: i.ContentHandling,
    timeoutInMillis: num(i.TimeoutInMillis),
    cacheNamespace: i.CacheNamespace,
    cacheKeyParameters: i.CacheKeyParameters,
    responseTransferMode: i.ResponseTransferMode,
    integrationTarget: i.IntegrationTarget,
    integrationResponses: i.IntegrationResponses && Object.fromEntries(i.IntegrationResponses.map((r: any) => [r.StatusCode, {
      statusCode: r.StatusCode,
      selectionPattern: r.SelectionPattern,
      responseParameters: r.ResponseParameters,
      responseTemplates: r.ResponseTemplates,
      contentHandling: r.ContentHandling,
    }])),
  };
}

export default handler({
  type: 'AWS::ApiGateway::Method',
  client: APIGatewayClient,
  exists: call,
  properties: {
    RestApiId: check({ call, actual: (_r, ctx) => ids(ctx)[0], note: 'part of the physical id the method was read with' }),
    ResourceId: check({ call, actual: (_r, ctx) => ids(ctx)[1], note: 'part of the physical id the method was read with' }),
    HttpMethod: check({ call, actual: (r) => r.httpMethod }),
    AuthorizationType: check({ call, actual: (r) => r.authorizationType }),
    AuthorizerId: check({ call, actual: (r) => r.authorizerId }),
    AuthorizationScopes: check({ call, actual: (r) => r.authorizationScopes }),
    ApiKeyRequired: check({ call, actual: (r) => r.apiKeyRequired }),
    OperationName: check({ call, actual: (r) => r.operationName }),
    RequestValidatorId: check({ call, actual: (r) => r.requestValidatorId }),
    RequestModels: check({ call, actual: (r) => r.requestModels }),
    RequestParameters: check({ call, expected: bools, actual: (r) => r.requestParameters }),
    MethodResponses: check({
      call,
      expected: (rs: any[]) => Object.fromEntries(rs.map((r) => [r.StatusCode, {
        statusCode: r.StatusCode, responseModels: r.ResponseModels, responseParameters: bools(r.ResponseParameters),
      }])),
      actual: (r) => r.methodResponses,
    }),
    Integration: check({
      call,
      expected: (i: any) => defined(integration(i)),
      actual: (r) => r.methodIntegration,
      compare: 'subset',
      note: 'API Gateway fills in defaults (timeoutInMillis, cacheNamespace, connectionType, ...) the template may not set',
    }),
  },
});
