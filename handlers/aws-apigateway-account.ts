import { APIGatewayClient, GetAccountCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

export default handler({
  type: 'AWS::ApiGateway::Account',
  client: APIGatewayClient,
  exists: () => new GetAccountCommand({}),
  properties: {
    CloudWatchRoleArn: check({
      call: () => new GetAccountCommand({}),
      actual: (r) => r.cloudwatchRoleArn,
      note: 'account-level setting: the last stack to set it wins',
    }),
  },
});
