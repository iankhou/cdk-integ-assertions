import { CloudFrontClient, GetCloudFrontOriginAccessIdentityCommand } from '@aws-sdk/client-cloudfront';
import { GetBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { check, Context, handler } from '../lib/handler';

// The runner orders statements by their JSON text, which depends on key order; S3 returns keys in its own
// order (Effect, Principal, Action, ...), so both sides get sorted keys to make the statement order comparable.
const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
// A policy granted to an OAI's {CanonicalUser: <S3 canonical user id>} is stored (and returned) by S3 as
// {AWS: "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity <OAI id>"}; look up each such OAI's
// S3CanonicalUserId so the deployed principal is compared in the template's form.
const OAI_ARN = /^arn:aws:iam::cloudfront:user\/CloudFront Origin Access Identity (\S+)$/;
const canonicalPrincipals = async (policy: any, ctx: Context) => {
  for (const st of policy.Statement ?? []) {
    const aws = st.Principal?.AWS;
    const arns: string[] = aws === undefined ? [] : Array.isArray(aws) ? aws : [aws];
    if (!arns.length || !arns.every((a) => OAI_ARN.test(a))) continue;
    const ids = await Promise.all(arns.map(async (a) => (await ctx.send(CloudFrontClient,
      new GetCloudFrontOriginAccessIdentityCommand({ Id: OAI_ARN.exec(a)![1] }))).CloudFrontOriginAccessIdentity?.S3CanonicalUserId));
    st.Principal = { CanonicalUser: ids.length === 1 ? ids[0] : ids };
  }
  return policy;
};
// The physical id is the bucket name.
const getPolicy = (ctx: { physicalId: string }) => new GetBucketPolicyCommand({ Bucket: ctx.physicalId });

export default handler({
  type: 'AWS::S3::BucketPolicy',
  client: S3Client,
  exists: getPolicy,
  properties: {
    // GetBucketPolicy doesn't echo the bucket; a policy is present on the bucket CloudFormation reports.
    Bucket: check({ call: getPolicy, actual: (res, ctx) => (res.Policy ? ctx.physicalId : undefined) }),
    PolicyDocument: check({
      call: getPolicy,
      actual: async (res, ctx) => res.Policy && sortKeys(await canonicalPrincipals(JSON.parse(res.Policy), ctx)),
      expected: sortKeys,
      compare: 'json',
    }),
  },
});
