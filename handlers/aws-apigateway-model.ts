import { APIGatewayClient, GetModelCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

const call = (ctx: any) => new GetModelCommand({ restApiId: ctx.properties.RestApiId, modelName: ctx.physicalId });

export default handler({
  type: 'AWS::ApiGateway::Model',
  client: APIGatewayClient,
  exists: call,
  properties: {
    Name: check({ call, actual: (r) => r.name }),
    ContentType: check({ call, actual: (r) => r.contentType }),
    Description: check({ call, actual: (r) => r.description }),
    Schema: check({ call, actual: (r) => r.schema, compare: 'json' }),
    RestApiId: check({
      call,
      actual: (r, ctx) => (r.name === ctx.physicalId ? ctx.properties.RestApiId : undefined),
      note: 'the response has no API id; the model is found under the template API',
    }),
  },
});
