import { GetAccountAuthorizationDetailsCommand, GetPolicyCommand, IAMClient, ListEntitiesForPolicyCommand } from '@aws-sdk/client-iam';
import { check, handler } from '../lib/handler';

// The physical id is the policy ARN.
const getPolicy = (ctx: { physicalId: string }) => new GetPolicyCommand({ PolicyArn: ctx.physicalId });
const entities = (ctx: { physicalId: string }) => new ListEntitiesForPolicyCommand({ PolicyArn: ctx.physicalId, MaxItems: 1000 });
const sorted = (v: string[]) => [...v].sort();

export default handler({
  type: 'AWS::IAM::ManagedPolicy',
  client: IAMClient,
  exists: getPolicy,
  properties: {
    Description: check({
      call: getPolicy,
      expected: (v: string) => (v === '' ? undefined : v),
      actual: (res) => res.Policy?.Description,
      note: 'IAM does not store an empty description',
    }),
    Path: check({ call: getPolicy, actual: (res) => res.Policy?.Path }),
    ManagedPolicyName: check({ call: getPolicy, actual: (res) => res.Policy?.PolicyName }),
    // GetPolicyVersion needs the DefaultVersionId (only known from GetPolicy), so the default version's
    // document is read from GetAccountAuthorizationDetails instead.
    PolicyDocument: check({
      call: () => new GetAccountAuthorizationDetailsCommand({ Filter: ['LocalManagedPolicy'], MaxItems: 1000 }),
      actual: (res, ctx) => res.Policies?.find((p) => p.Arn === ctx.physicalId)
        ?.PolicyVersionList?.find((v) => v.IsDefaultVersion)?.Document,
      compare: 'json',
      note: 'document is URL-encoded',
    }),
    Roles: check({ call: entities, actual: (res) => sorted((res.PolicyRoles ?? []).map((r) => r.RoleName!)), expected: sorted }),
    Users: check({ call: entities, actual: (res) => sorted((res.PolicyUsers ?? []).map((r) => r.UserName!)), expected: sorted }),
    Groups: check({ call: entities, actual: (res) => sorted((res.PolicyGroups ?? []).map((r) => r.GroupName!)), expected: sorted }),
  },
});
