import {
  GetDataProtectionPolicyCommand, GetTopicAttributesCommand, GetTopicAttributesCommandOutput, ListSubscriptionsByTopicCommand, ListTagsForResourceCommand, SNSClient,
} from '@aws-sdk/client-sns';
import { check, handler } from '../lib/handler';

const topic = (ctx: { physicalId: string }) => ({ TopicArn: ctx.physicalId });
const attr = (name: string, extra: { expected?: (v: any) => unknown; compare?: 'json' } = {}) =>
  check<GetTopicAttributesCommandOutput>({ call: (ctx) => new GetTopicAttributesCommand(topic(ctx)), actual: (r) => r.Attributes?.[name], ...extra });

// DeliveryStatusLogging protocols and their attribute name prefixes (http and https share HTTP*)
const prefixes: Record<string, string> = { http: 'HTTP', https: 'HTTP', sqs: 'SQS', lambda: 'Lambda', firehose: 'Firehose', application: 'Application' };
const byProtocol = (a: any, b: any) => String(a.Protocol).localeCompare(String(b.Protocol));

export default handler({
  type: 'AWS::SNS::Topic',
  client: SNSClient,
  exists: (ctx) => new GetTopicAttributesCommand(topic(ctx)),
  properties: {
    TopicName: check({
      call: (ctx) => new GetTopicAttributesCommand(topic(ctx)),
      actual: (r) => r.Attributes?.TopicArn?.split(':').pop(),
    }),
    DisplayName: attr('DisplayName'),
    KmsMasterKeyId: attr('KmsMasterKeyId'),
    FifoTopic: attr('FifoTopic'),
    ContentBasedDeduplication: attr('ContentBasedDeduplication'),
    FifoThroughputScope: attr('FifoThroughputScope'),
    SignatureVersion: attr('SignatureVersion'),
    TracingConfig: attr('TracingConfig'),
    MaximumMessageSize: attr('MaximumMessageSize'),
    ArchivePolicy: attr('ArchivePolicy', { compare: 'json' }),
    DeliveryStatusLogging: check({
      call: (ctx) => new GetTopicAttributesCommand(topic(ctx)),
      expected: (v: any[]) => v.map((l) => ({
        Protocol: prefixes[l.Protocol],
        FailureFeedbackRoleArn: l.FailureFeedbackRoleArn,
        SuccessFeedbackRoleArn: l.SuccessFeedbackRoleArn,
        SuccessFeedbackSampleRate: l.SuccessFeedbackSampleRate === undefined ? undefined : String(l.SuccessFeedbackSampleRate),
      })).sort(byProtocol),
      actual: (r) => [...new Set(Object.values(prefixes))].map((p) => ({
        Protocol: p,
        FailureFeedbackRoleArn: r.Attributes?.[`${p}FailureFeedbackRoleArn`],
        SuccessFeedbackRoleArn: r.Attributes?.[`${p}SuccessFeedbackRoleArn`],
        SuccessFeedbackSampleRate: r.Attributes?.[`${p}SuccessFeedbackSampleRate`],
      })).filter((l) => l.FailureFeedbackRoleArn || l.SuccessFeedbackRoleArn || l.SuccessFeedbackSampleRate).sort(byProtocol),
      note: 'one entry per protocol whose *FeedbackRoleArn / *SampleRate attributes are set; protocol compared by attribute prefix',
    }),
    DataProtectionPolicy: check({
      call: (ctx) => new GetDataProtectionPolicyCommand({ ResourceArn: ctx.physicalId }),
      actual: (r) => r.DataProtectionPolicy,
      compare: 'json',
    }),
    Subscription: check({
      call: (ctx) => new ListSubscriptionsByTopicCommand(topic(ctx)),
      actual: (r) => r.Subscriptions?.map((s) => ({ Endpoint: s.Endpoint, Protocol: s.Protocol })),
      compare: 'subset',
      note: 'the topic may also have subscriptions created by AWS::SNS::Subscription resources',
    }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ ResourceArn: ctx.physicalId }),
      actual: (r) => r.Tags,
      compare: 'subset',
    }),
  },
});
