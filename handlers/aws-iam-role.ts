import {
  GetRoleCommand, GetRolePolicyCommand, IAMClient, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { check, handler } from '../lib/handler';

// The role's physical id is its name.
const getRole = (ctx: { physicalId: string }) => new GetRoleCommand({ RoleName: ctx.physicalId });

// Inline policies (Policies) are read one by one with GetRolePolicy; one check per list index.
const inlinePolicyChecks = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [`Policies.${i}.PolicyDocument`, check({
  call: (ctx) => new GetRolePolicyCommand({ RoleName: ctx.physicalId, PolicyName: ctx.properties.Policies[i].PolicyName }),
  actual: (res) => res.PolicyDocument,
  compare: 'json',
  note: 'GetRolePolicy returns the document URL-encoded',
})]));

export default handler({
  type: 'AWS::IAM::Role',
  client: IAMClient,
  exists: getRole,
  properties: {
    AssumeRolePolicyDocument: check({ call: getRole, actual: (res) => res.Role?.AssumeRolePolicyDocument, compare: 'json' }),
    Description: check({ call: getRole, actual: (res) => res.Role?.Description }),
    MaxSessionDuration: check({ call: getRole, actual: (res) => res.Role?.MaxSessionDuration }),
    Path: check({ call: getRole, actual: (res) => res.Role?.Path }),
    PermissionsBoundary: check({ call: getRole, actual: (res) => res.Role?.PermissionsBoundary?.PermissionsBoundaryArn }),
    RoleName: check({ call: getRole, actual: (res) => res.Role?.RoleName }),
    Tags: check({
      call: getRole,
      actual: (res) => res.Role?.Tags,
      compare: 'subset',
      note: 'CloudFormation adds aws:cloudformation:* tags',
    }),
    ManagedPolicyArns: check({
      call: (ctx) => new ListAttachedRolePoliciesCommand({ RoleName: ctx.physicalId, MaxItems: 1000 }),
      actual: (res) => (res.AttachedPolicies ?? []).map((p) => p.PolicyArn).sort(),
      expected: (v: string[]) => [...v].sort(),
    }),
    // AWS::IAM::Policy resources also attach inline policies to the role, so the names are a subset.
    Policies: check({
      call: (ctx) => new ListRolePoliciesCommand({ RoleName: ctx.physicalId, MaxItems: 1000 }),
      actual: (res) => res.PolicyNames,
      expected: (v: { PolicyName: string }[]) => v.map((p) => p.PolicyName),
      compare: 'subset',
    }),
    ...inlinePolicyChecks,
  },
});
