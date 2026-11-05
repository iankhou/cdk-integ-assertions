import { APIGatewayClient, GetRequestValidatorCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

const call = (ctx: any) => new GetRequestValidatorCommand({ restApiId: ctx.properties.RestApiId, requestValidatorId: ctx.physicalId });

export default handler({
  type: 'AWS::ApiGateway::RequestValidator',
  client: APIGatewayClient,
  exists: call,
  properties: {
    Name: check({ call, actual: (r) => r.name }),
    ValidateRequestBody: check({ call, actual: (r) => r.validateRequestBody }),
    ValidateRequestParameters: check({ call, actual: (r) => r.validateRequestParameters }),
    RestApiId: check({
      call,
      actual: (r, ctx) => (r.id === ctx.physicalId ? ctx.properties.RestApiId : undefined),
      note: 'the response has no API id; the validator is found under the template API',
    }),
  },
});
