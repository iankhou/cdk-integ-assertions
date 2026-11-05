import { APIGatewayClient, GetDeploymentCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

const call = (ctx: any) => new GetDeploymentCommand({ restApiId: ctx.properties.RestApiId, deploymentId: ctx.physicalId });

export default handler({
  type: 'AWS::ApiGateway::Deployment',
  client: APIGatewayClient,
  exists: call,
  properties: {
    Description: check({ call, actual: (r) => r.description }),
    RestApiId: check({
      call,
      actual: (r, ctx) => (r.id === ctx.physicalId ? ctx.properties.RestApiId : undefined),
      note: 'the response has no API id; the deployment is found under the template API',
    }),
  },
  skip: {
    StageName: 'write-only (creates a stage; checked through AWS::ApiGateway::Stage if modeled)',
    StageDescription: 'write-only',
    DeploymentCanarySettings: 'write-only',
  },
});
