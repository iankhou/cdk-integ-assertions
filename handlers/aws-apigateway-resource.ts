import { APIGatewayClient, GetResourceCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

const call = (ctx: any) => new GetResourceCommand({ restApiId: ctx.properties.RestApiId, resourceId: ctx.physicalId });

export default handler({
  type: 'AWS::ApiGateway::Resource',
  client: APIGatewayClient,
  exists: call,
  properties: {
    ParentId: check({ call, actual: (r) => r.parentId }),
    PathPart: check({ call, actual: (r) => r.pathPart }),
    RestApiId: check({
      call,
      actual: (r, ctx) => (r.id === ctx.physicalId ? ctx.properties.RestApiId : undefined),
      note: 'the response has no API id; the resource is found under the template API',
    }),
  },
});
