import { GetQueueAttributesCommand, ListQueueTagsCommand, SQSClient } from '@aws-sdk/client-sqs';
import { check, handler } from '../lib/handler';

// The physical id is the queue URL.
const attributes = (ctx: { physicalId: string }) => new GetQueueAttributesCommand({ QueueUrl: ctx.physicalId, AttributeNames: ['All'] });
const attr = (name: string, compare?: 'json') => check({ call: attributes, actual: (res) => res.Attributes?.[name as never], compare });

export default handler({
  type: 'AWS::SQS::Queue',
  client: SQSClient,
  exists: attributes,
  properties: {
    ContentBasedDeduplication: attr('ContentBasedDeduplication'),
    DeduplicationScope: attr('DeduplicationScope'),
    DelaySeconds: attr('DelaySeconds'),
    FifoQueue: attr('FifoQueue'),
    FifoThroughputLimit: attr('FifoThroughputLimit'),
    KmsDataKeyReusePeriodSeconds: attr('KmsDataKeyReusePeriodSeconds'),
    KmsMasterKeyId: attr('KmsMasterKeyId'),
    SqsManagedSseEnabled: attr('SqsManagedSseEnabled'),
    MaximumMessageSize: attr('MaximumMessageSize'),
    MessageRetentionPeriod: attr('MessageRetentionPeriod'),
    ReceiveMessageWaitTimeSeconds: attr('ReceiveMessageWaitTimeSeconds'),
    VisibilityTimeout: attr('VisibilityTimeout'),
    RedrivePolicy: attr('RedrivePolicy', 'json'),
    RedriveAllowPolicy: attr('RedriveAllowPolicy', 'json'),
    QueueName: check({ call: attributes, actual: (res) => res.Attributes?.QueueArn?.split(':').pop() }),
    Tags: check({
      call: (ctx) => new ListQueueTagsCommand({ QueueUrl: ctx.physicalId }),
      expected: (tags: any[]) => Object.fromEntries(tags.map((t) => [t.Key, t.Value])),
      actual: (res) => res.Tags ?? {},
      compare: 'subset',
      note: 'CloudFormation may add aws:cloudformation:* tags',
    }),
  },
});
