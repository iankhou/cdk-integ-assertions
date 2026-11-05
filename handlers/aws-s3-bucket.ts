import {
  GetBucketAccelerateConfigurationCommand,
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLoggingCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketTaggingCommand,
  GetBucketVersioningCommand,
  GetBucketWebsiteCommand,
  GetObjectLockConfigurationCommand,
  GetPublicAccessBlockCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { check, handler } from '../lib/handler';

const bucket = (ctx: { physicalId: string }) => ({ Bucket: ctx.physicalId });
const days = (d: any) => (d === undefined ? undefined : Number(d));
const date = (d: any) => (d === undefined ? undefined : new Date(d).toISOString());

/** A CloudFormation lifecycle rule in the API's shape */
function lifecycleRule(r: any) {
  const tags = (r.TagFilters ?? []).map((t: any) => ({ Key: t.Key, Value: t.Value }));
  const filterParts = {
    Prefix: r.Prefix,
    ObjectSizeGreaterThan: days(r.ObjectSizeGreaterThan),
    ObjectSizeLessThan: days(r.ObjectSizeLessThan),
  };
  const n = Object.values(filterParts).filter((v) => v !== undefined).length + tags.length;
  const filter = n > 1 ? { And: { ...filterParts, Tags: tags.length ? tags : undefined } }
    : tags.length ? { Tag: tags[0] } : n ? filterParts : { Prefix: '' }; // S3 reports no filter as an empty prefix
  const expiration = {
    Days: days(r.ExpirationInDays),
    Date: date(r.ExpirationDate),
    ExpiredObjectDeleteMarker: r.ExpiredObjectDeleteMarker,
  };
  const noncurrentTransitions = [...(r.NoncurrentVersionTransitions ?? []), ...(r.NoncurrentVersionTransition ? [r.NoncurrentVersionTransition] : [])];
  const transitions = [...(r.Transitions ?? []), ...(r.Transition ? [r.Transition] : [])];
  const noncurrentExpiration = r.NoncurrentVersionExpiration
    ? { NoncurrentDays: days(r.NoncurrentVersionExpiration.NoncurrentDays), NewerNoncurrentVersions: days(r.NoncurrentVersionExpiration.NewerNoncurrentVersions) }
    : r.NoncurrentVersionExpirationInDays !== undefined ? { NoncurrentDays: days(r.NoncurrentVersionExpirationInDays) } : undefined;
  return {
    ID: r.Id,
    Status: r.Status,
    Filter: filter,
    Expiration: Object.values(expiration).some((v) => v !== undefined) ? expiration : undefined,
    Transitions: transitions.length
      ? transitions.map((t: any) => ({ StorageClass: t.StorageClass, Days: days(t.TransitionInDays), Date: date(t.TransitionDate) }))
      : undefined,
    NoncurrentVersionTransitions: noncurrentTransitions.length
      ? noncurrentTransitions.map((t: any) => ({ StorageClass: t.StorageClass, NoncurrentDays: days(t.TransitionInDays), NewerNoncurrentVersions: days(t.NewerNoncurrentVersions) }))
      : undefined,
    NoncurrentVersionExpiration: noncurrentExpiration,
    AbortIncompleteMultipartUpload: r.AbortIncompleteMultipartUpload
      ? { DaysAfterInitiation: days(r.AbortIncompleteMultipartUpload.DaysAfterInitiation) } : undefined,
  };
}

/** API lifecycle rule, normalized: dates as ISO strings, ID dropped where CloudFormation generated it */
function apiLifecycleRule(r: any, templateRule: any) {
  const iso = (x: any) => (x instanceof Date ? x.toISOString() : x);
  return {
    ...r,
    ID: templateRule?.Id === undefined ? undefined : r.ID,
    Expiration: r.Expiration ? { ...r.Expiration, Date: iso(r.Expiration.Date) } : undefined,
    Transitions: r.Transitions?.map((t: any) => ({ ...t, Date: iso(t.Date) })),
  };
}

export default handler({
  type: 'AWS::S3::Bucket',
  client: S3Client,
  exists: (ctx) => new HeadBucketCommand(bucket(ctx)),
  properties: {
    'VersioningConfiguration.Status': check({
      call: (ctx) => new GetBucketVersioningCommand(bucket(ctx)),
      actual: (res) => res.Status,
    }),
    PublicAccessBlockConfiguration: check({
      call: (ctx) => new GetPublicAccessBlockCommand(bucket(ctx)),
      actual: (res) => res.PublicAccessBlockConfiguration,
    }),
    'BucketEncryption.ServerSideEncryptionConfiguration': check({
      call: (ctx) => new GetBucketEncryptionCommand(bucket(ctx)),
      expected: (rules: any[]) => rules.map((r) => ({
        ApplyServerSideEncryptionByDefault: r.ServerSideEncryptionByDefault && {
          SSEAlgorithm: r.ServerSideEncryptionByDefault.SSEAlgorithm,
          KMSMasterKeyID: r.ServerSideEncryptionByDefault.KMSMasterKeyID,
        },
        BucketKeyEnabled: r.BucketKeyEnabled,
        BlockedEncryptionTypes: r.BlockedEncryptionTypes,
      })),
      // S3 reports its defaults (BucketKeyEnabled false, SSE-C blocked) even when not set; drop those only when the template doesn't set them
      actual: (res, ctx) => res.ServerSideEncryptionConfiguration?.Rules?.map((r, i) => {
        const t = ctx.properties.BucketEncryption.ServerSideEncryptionConfiguration[i] ?? {};
        const sseCOnly = JSON.stringify(r.BlockedEncryptionTypes?.EncryptionType) === '["SSE-C"]';
        return {
          ...r,
          BucketKeyEnabled: t.BucketKeyEnabled === undefined && r.BucketKeyEnabled === false ? undefined : r.BucketKeyEnabled,
          BlockedEncryptionTypes: t.BlockedEncryptionTypes === undefined && sseCOnly ? undefined : r.BlockedEncryptionTypes,
        };
      }),
    }),
    'LifecycleConfiguration.Rules': check({
      call: (ctx) => new GetBucketLifecycleConfigurationCommand(bucket(ctx)),
      expected: (rules: any[]) => rules.map(lifecycleRule),
      actual: (res, ctx) => res.Rules?.map((r, i) => apiLifecycleRule(r, ctx.properties.LifecycleConfiguration.Rules[i])),
    }),
    Tags: check({
      call: (ctx) => new GetBucketTaggingCommand(bucket(ctx)),
      actual: (res) => res.TagSet,
      compare: 'subset',
      note: 'CloudFormation adds aws:cloudformation:* tags',
    }),
    'CorsConfiguration.CorsRules': check({
      call: (ctx) => new GetBucketCorsCommand(bucket(ctx)),
      expected: (rules: any[]) => rules.map((r) => ({
        ID: r.Id, AllowedHeaders: r.AllowedHeaders, AllowedMethods: r.AllowedMethods, AllowedOrigins: r.AllowedOrigins,
        ExposeHeaders: r.ExposedHeaders, MaxAgeSeconds: r.MaxAge === undefined ? undefined : Number(r.MaxAge),
      })),
      actual: (res) => res.CORSRules,
    }),
    'OwnershipControls.Rules': check({
      call: (ctx) => new GetBucketOwnershipControlsCommand(bucket(ctx)),
      actual: (res) => res.OwnershipControls?.Rules,
    }),
    WebsiteConfiguration: check({
      call: (ctx) => new GetBucketWebsiteCommand(bucket(ctx)),
      expected: (w: any) => ({
        IndexDocument: w.IndexDocument === undefined ? undefined : { Suffix: w.IndexDocument },
        ErrorDocument: w.ErrorDocument === undefined ? undefined : { Key: w.ErrorDocument },
        RedirectAllRequestsTo: w.RedirectAllRequestsTo,
        RoutingRules: w.RoutingRules?.map((r: any) => ({
          Condition: r.RoutingRuleCondition,
          Redirect: r.RedirectRule,
        })),
      }),
      actual: (res) => ({ IndexDocument: res.IndexDocument, ErrorDocument: res.ErrorDocument, RedirectAllRequestsTo: res.RedirectAllRequestsTo, RoutingRules: res.RoutingRules }),
    }),
    LoggingConfiguration: check({
      call: (ctx) => new GetBucketLoggingCommand(bucket(ctx)),
      expected: (l: any, ctx) => ({ TargetBucket: l.DestinationBucketName ?? ctx.physicalId, TargetPrefix: l.LogFilePrefix ?? '' }),
      actual: (res) => res.LoggingEnabled && { TargetBucket: res.LoggingEnabled.TargetBucket, TargetPrefix: res.LoggingEnabled.TargetPrefix },
      note: 'without DestinationBucketName, logs go to the bucket itself',
    }),
    'AccelerateConfiguration.AccelerationStatus': check({
      call: (ctx) => new GetBucketAccelerateConfigurationCommand(bucket(ctx)),
      actual: (res) => res.Status,
    }),
    ObjectLockEnabled: check({
      call: (ctx) => new GetObjectLockConfigurationCommand(bucket(ctx)),
      expected: (v: any) => (String(v) === 'true' ? 'Enabled' : undefined),
      actual: (res) => res.ObjectLockConfiguration?.ObjectLockEnabled,
    }),
  },
  skip: {
    AccessControl: 'write-only (canned ACL applied at creation)',
    BucketNamePrefix: 'write-only',
    BucketNamespace: 'write-only',
  },
});
