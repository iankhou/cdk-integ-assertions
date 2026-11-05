import { CloudFrontClient, GetDistributionConfigCommand, ListTagsForResourceCommand } from '@aws-sdk/client-cloudfront';
import { check, handler } from '../lib/handler';

// The physical id is the distribution id.
const getConfig = (ctx: { physicalId: string }) => new GetDistributionConfigCommand({ Id: ctx.physicalId });
const num = (v: any) => (v === undefined ? undefined : Number(v));
/** CloudFront lists are { Quantity, Items } */
const items = (l: any[] | undefined, f: (x: any) => any = (x) => x) => l && { Quantity: l.length, Items: l.length ? l.map(f) : undefined };

/** Keep only the parts of an API value the expected value sets (CloudFront fills in defaults for the rest) */
const shape = (api: any, want: any): any => {
  if (Array.isArray(want) && Array.isArray(api)) return api.map((a, i) => (i < want.length ? shape(a, want[i]) : a));
  if (want && typeof want === 'object' && api && typeof api === 'object' && !Array.isArray(api)) {
    return Object.fromEntries(Object.keys(want).filter((k) => want[k] !== undefined).map((k) => [k, shape(api[k], want[k])]));
  }
  return api;
};

const behavior = (b: any) => ({
  PathPattern: b.PathPattern,
  TargetOriginId: b.TargetOriginId,
  ViewerProtocolPolicy: b.ViewerProtocolPolicy,
  Compress: b.Compress,
  CachePolicyId: b.CachePolicyId,
  OriginRequestPolicyId: b.OriginRequestPolicyId,
  ResponseHeadersPolicyId: b.ResponseHeadersPolicyId,
  FieldLevelEncryptionId: b.FieldLevelEncryptionId,
  RealtimeLogConfigArn: b.RealtimeLogConfigArn,
  SmoothStreaming: b.SmoothStreaming,
  MinTTL: num(b.MinTTL),
  DefaultTTL: num(b.DefaultTTL),
  MaxTTL: num(b.MaxTTL),
  AllowedMethods: b.AllowedMethods && { ...items(b.AllowedMethods), CachedMethods: items(b.CachedMethods) },
  FunctionAssociations: items(b.FunctionAssociations, (f) => ({ FunctionARN: f.FunctionARN, EventType: f.EventType })),
  LambdaFunctionAssociations: items(b.LambdaFunctionAssociations, (l) => ({
    EventType: l.EventType, LambdaFunctionARN: l.LambdaFunctionARN, IncludeBody: l.IncludeBody,
  })),
  TrustedKeyGroups: b.TrustedKeyGroups && { Enabled: b.TrustedKeyGroups.length > 0, ...items(b.TrustedKeyGroups) },
  TrustedSigners: b.TrustedSigners && { Enabled: b.TrustedSigners.length > 0, ...items(b.TrustedSigners) },
});

const origin = (o: any) => ({
  Id: o.Id,
  DomainName: o.DomainName,
  OriginPath: o.OriginPath,
  OriginAccessControlId: o.OriginAccessControlId,
  ConnectionAttempts: num(o.ConnectionAttempts),
  ConnectionTimeout: num(o.ConnectionTimeout),
  S3OriginConfig: o.S3OriginConfig && {
    OriginAccessIdentity: o.S3OriginConfig.OriginAccessIdentity,
    OriginReadTimeout: num(o.S3OriginConfig.OriginReadTimeout),
  },
  CustomOriginConfig: o.CustomOriginConfig && {
    HTTPPort: num(o.CustomOriginConfig.HTTPPort),
    HTTPSPort: num(o.CustomOriginConfig.HTTPSPort),
    OriginProtocolPolicy: o.CustomOriginConfig.OriginProtocolPolicy,
    OriginSslProtocols: items(o.CustomOriginConfig.OriginSSLProtocols),
    OriginReadTimeout: num(o.CustomOriginConfig.OriginReadTimeout),
    OriginKeepaliveTimeout: num(o.CustomOriginConfig.OriginKeepaliveTimeout),
  },
  CustomHeaders: items(o.OriginCustomHeaders, (h) => ({ HeaderName: h.HeaderName, HeaderValue: h.HeaderValue })),
  OriginShield: o.OriginShield,
});

/** A check of DistributionConfig.<key>: `toApi` converts the template value, `field` picks the API value */
const config = (field: string, toApi: (v: any) => any = (v) => v) => check({
  call: getConfig,
  expected: toApi,
  actual: (res, ctx) => shape((res.DistributionConfig as any)?.[field], toApi(ctx.properties.DistributionConfig[field === 'IsIPV6Enabled' ? 'IPV6Enabled' : field])),
});

export default handler({
  type: 'AWS::CloudFront::Distribution',
  client: CloudFrontClient,
  exists: getConfig,
  properties: {
    'DistributionConfig.Enabled': config('Enabled'),
    'DistributionConfig.Comment': config('Comment'),
    'DistributionConfig.DefaultRootObject': config('DefaultRootObject'),
    'DistributionConfig.HttpVersion': config('HttpVersion'),
    'DistributionConfig.IPV6Enabled': config('IsIPV6Enabled'),
    'DistributionConfig.PriceClass': config('PriceClass'),
    'DistributionConfig.WebACLId': config('WebACLId'),
    'DistributionConfig.Staging': config('Staging'),
    'DistributionConfig.ContinuousDeploymentPolicyId': config('ContinuousDeploymentPolicyId'),
    'DistributionConfig.Aliases': config('Aliases', (a: string[]) => items(a)),
    'DistributionConfig.DefaultCacheBehavior': config('DefaultCacheBehavior', behavior),
    'DistributionConfig.CacheBehaviors': config('CacheBehaviors', (l: any[]) => items(l, behavior)),
    'DistributionConfig.Origins': config('Origins', (l: any[]) => items(l, origin)),
    // CloudFront keeps error responses keyed (and ordered) by error code, so the template's order is sorted the same way
    'DistributionConfig.CustomErrorResponses': config('CustomErrorResponses', (l: any[]) => items([...l].sort((a, b) => Number(a.ErrorCode) - Number(b.ErrorCode)), (e) => ({
      ErrorCode: num(e.ErrorCode),
      ResponseCode: e.ResponseCode === undefined ? undefined : String(e.ResponseCode),
      ResponsePagePath: e.ResponsePagePath,
      ErrorCachingMinTTL: num(e.ErrorCachingMinTTL),
    }))),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ Resource: `arn:aws:cloudfront::${ctx.account}:distribution/${ctx.physicalId}` }),
      actual: (res) => res.Tags?.Items ?? [],
      compare: 'subset',
    }),
  },
});
