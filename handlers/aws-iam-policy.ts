import { GetGroupPolicyCommand, GetRolePolicyCommand, GetUserPolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { check, handler } from '../lib/handler';

// An inline policy attached to roles/users/groups. The physical id is a generated id with no read API,
// so reads go through GetRolePolicy (or GetUserPolicy / GetGroupPolicy) with the PolicyName.
const roleList = (ctx: { properties: any }): string[] => ctx.properties.Roles ?? [];
const getRolePolicy = (ctx: { properties: any }, role: string) =>
  new GetRolePolicyCommand({ RoleName: role, PolicyName: ctx.properties.PolicyName });

// The 'json' compare orders list items by their serialization, which depends on key order; IAM returns
// statement keys in its own order (e.g. Condition before Action), so put keys in a canonical order on both sides.
const sortKeys = (v: any): any =>
  Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
      : v;

// One check per attached entity, by list index.
const indexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const roleChecks = Object.fromEntries(indexes.map((i) => [`Roles.${i}`, check({
  call: (ctx) => getRolePolicy(ctx, roleList(ctx)[i]),
  actual: (res) => res.RoleName,
})]));
const userChecks = Object.fromEntries(indexes.map((i) => [`Users.${i}`, check({
  call: (ctx) => new GetUserPolicyCommand({ UserName: ctx.properties.Users[i], PolicyName: ctx.properties.PolicyName }),
  actual: (res) => res.UserName,
})]));
const groupChecks = Object.fromEntries(indexes.map((i) => [`Groups.${i}`, check({
  call: (ctx) => new GetGroupPolicyCommand({ GroupName: ctx.properties.Groups[i], PolicyName: ctx.properties.PolicyName }),
  actual: (res) => res.GroupName,
})]));

// Document and name are read from the first attached entity; the per-entity checks above confirm the attachments.
const first = (ctx: { properties: any }) => {
  const p = ctx.properties;
  if (p.Roles?.length) return getRolePolicy(ctx, p.Roles[0]);
  if (p.Users?.length) return new GetUserPolicyCommand({ UserName: p.Users[0], PolicyName: p.PolicyName });
  return new GetGroupPolicyCommand({ GroupName: p.Groups[0], PolicyName: p.PolicyName });
};

export default handler({
  type: 'AWS::IAM::Policy',
  client: IAMClient,
  exists: first,
  properties: {
    PolicyName: check({ call: first, actual: (res: any) => res.PolicyName }),
    PolicyDocument: check({
      call: first,
      expected: (v: any) => sortKeys(typeof v === 'string' ? JSON.parse(v) : v),
      actual: (res: any) => sortKeys(JSON.parse(decodeURIComponent(res.PolicyDocument))),
      compare: 'json',
      note: 'returned URL-encoded',
    }),
    ...roleChecks,
    ...userChecks,
    ...groupChecks,
  },
});
