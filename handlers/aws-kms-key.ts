import {
  DescribeKeyCommand, DescribeKeyCommandOutput, GetKeyPolicyCommand, GetKeyRotationStatusCommand, KMSClient, ListResourceTagsCommand,
} from '@aws-sdk/client-kms';
import { check, handler } from '../lib/handler';

const key = (pick: (m: NonNullable<DescribeKeyCommandOutput['KeyMetadata']>) => unknown) =>
  check<DescribeKeyCommandOutput>({ call: (ctx) => new DescribeKeyCommand({ KeyId: ctx.physicalId }), actual: (r) => pick(r.KeyMetadata!) });
const rotation = (ctx: { physicalId: string }) => new GetKeyRotationStatusCommand({ KeyId: ctx.physicalId });

export default handler({
  type: 'AWS::KMS::Key',
  client: KMSClient,
  exists: (ctx) => new DescribeKeyCommand({ KeyId: ctx.physicalId }),
  properties: {
    Description: key((m) => m.Description),
    Enabled: key((m) => m.Enabled),
    KeyUsage: key((m) => m.KeyUsage),
    Origin: key((m) => m.Origin),
    KeySpec: key((m) => m.KeySpec),
    MultiRegion: key((m) => m.MultiRegion),
    EnableKeyRotation: check({ call: rotation, actual: (r) => r.KeyRotationEnabled }),
    RotationPeriodInDays: check({ call: rotation, actual: (r) => r.RotationPeriodInDays, note: 'write-only in the schema, but GetKeyRotationStatus returns it' }),
    KeyPolicy: check({
      call: (ctx) => new GetKeyPolicyCommand({ KeyId: ctx.physicalId, PolicyName: 'default' }),
      actual: (r) => r.Policy,
      compare: 'json',
    }),
    Tags: check({
      call: (ctx) => new ListResourceTagsCommand({ KeyId: ctx.physicalId }),
      expected: (tags: { Key: string; Value: string }[]) => tags.map((t) => ({ TagKey: t.Key, TagValue: t.Value })),
      actual: (r) => r.Tags,
      compare: 'subset',
    }),
  },
  skip: {
    PendingWindowInDays: 'write-only (only applies when the key is scheduled for deletion)',
    BypassPolicyLockoutSafetyCheck: 'write-only (flag on the PutKeyPolicy/CreateKey request)',
  },
});
