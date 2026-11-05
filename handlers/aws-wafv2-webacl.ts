import { GetWebACLCommand, GetWebACLCommandOutput, ListTagsForResourceCommand, WAFV2Client, WebACL } from '@aws-sdk/client-wafv2';
import { check, Context, handler } from '../lib/handler';

// Physical id is Name|Id|Scope
const get = (ctx: Context) => {
  const [Name, Id, Scope] = ctx.physicalId.split('|');
  return new GetWebACLCommand({ Name, Id, Scope: Scope as 'REGIONAL' | 'CLOUDFRONT' });
};
const acl = (pick: (w: WebACL | undefined) => unknown, compare?: 'subset') =>
  check<GetWebACLCommandOutput>({ call: get, actual: (r) => pick(r.WebACL), compare });

export default handler({
  type: 'AWS::WAFv2::WebACL',
  client: WAFV2Client,
  exists: get,
  properties: {
    Name: acl((w) => w?.Name),
    // Scope isn't in the response; the ARN says regional/ or global/ (CLOUDFRONT)
    Scope: acl((w) => (w?.ARN?.split(':')[5]?.startsWith('global/') ? 'CLOUDFRONT' : 'REGIONAL')),
    DefaultAction: acl((w) => w?.DefaultAction),
    Description: acl((w) => w?.Description),
    // WAF fills in defaults (e.g. EvaluationWindowSec on rate-based statements)
    Rules: acl((w) => w?.Rules, 'subset'),
    VisibilityConfig: acl((w) => w?.VisibilityConfig),
    DataProtectionConfig: acl((w) => w?.DataProtectionConfig),
    ApplicationConfig: acl((w) => w?.ApplicationConfig),
    CustomResponseBodies: acl((w) => w?.CustomResponseBodies),
    CaptchaConfig: acl((w) => w?.CaptchaConfig),
    ChallengeConfig: acl((w) => w?.ChallengeConfig),
    TokenDomains: acl((w) => w?.TokenDomains),
    AssociationConfig: acl((w) => w?.AssociationConfig),
    OnSourceDDoSProtectionConfig: acl((w) => w?.OnSourceDDoSProtectionConfig),
    MonetizationConfig: acl((w) => w?.MonetizationConfig),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({
        ResourceARN: `arn:aws:wafv2:${ctx.region}:${ctx.account}:${ctx.physicalId.split('|')[2] === 'CLOUDFRONT' ? 'global' : 'regional'}/webacl/${ctx.physicalId.split('|')[0]}/${ctx.physicalId.split('|')[1]}`,
      }),
      actual: (r) => r.TagInfoForResource?.TagList,
      compare: 'subset',
    }),
  },
});
