import { GetWebACLForResourceCommand, ListResourcesForWebACLCommand, ResourceType, WAFV2Client } from '@aws-sdk/client-wafv2';
import { check, Context, handler } from '../lib/handler';

// Physical id is ResourceArn|WebACLArn
const ids = (ctx: Context) => { const [resource, acl] = ctx.physicalId.split('|'); return { resource, acl }; };

/** ListResourcesForWebACL needs the resource type (it defaults to APPLICATION_LOAD_BALANCER) */
function resourceType(arn: string): ResourceType {
  const [, , service, , , rest] = arn.split(':');
  if (service === 'apigateway') return 'API_GATEWAY';
  if (service === 'appsync') return 'APPSYNC';
  if (service === 'cognito-idp') return 'COGNITO_USER_POOL';
  if (service === 'apprunner') return 'APP_RUNNER_SERVICE';
  if (service === 'ec2' && rest?.startsWith('verified-access-instance')) return 'VERIFIED_ACCESS_INSTANCE';
  if (service === 'amplify') return 'AMPLIFY';
  return 'APPLICATION_LOAD_BALANCER';
}

export default handler({
  type: 'AWS::WAFv2::WebACLAssociation',
  client: WAFV2Client,
  exists: (ctx) => new GetWebACLForResourceCommand({ ResourceArn: ids(ctx).resource }),
  properties: {
    WebACLArn: check({
      call: (ctx) => new GetWebACLForResourceCommand({ ResourceArn: ids(ctx).resource }),
      actual: (r) => r.WebACL?.ARN,
    }),
    ResourceArn: check({
      call: (ctx) => new ListResourcesForWebACLCommand({ WebACLArn: ids(ctx).acl, ResourceType: resourceType(ids(ctx).resource) }),
      expected: (v: string) => [v],
      actual: (r) => r.ResourceArns,
      compare: 'subset',
      note: 'the resources associated with the web ACL include this one',
    }),
  },
});
