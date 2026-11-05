import { GetSubscriptionAttributesCommand, GetSubscriptionAttributesCommandOutput, SNSClient } from '@aws-sdk/client-sns';
import { check, handler } from '../lib/handler';

const attr = (name: string, compare?: 'json') =>
  check<GetSubscriptionAttributesCommandOutput>({
    call: (ctx) => new GetSubscriptionAttributesCommand({ SubscriptionArn: ctx.physicalId }),
    actual: (r) => r.Attributes?.[name],
    compare,
  });

export default handler({
  type: 'AWS::SNS::Subscription',
  client: SNSClient,
  exists: (ctx) => new GetSubscriptionAttributesCommand({ SubscriptionArn: ctx.physicalId }),
  properties: {
    TopicArn: attr('TopicArn'),
    Protocol: attr('Protocol'),
    Endpoint: attr('Endpoint'),
    RawMessageDelivery: attr('RawMessageDelivery'),
    FilterPolicy: attr('FilterPolicy', 'json'),
    FilterPolicyScope: attr('FilterPolicyScope'),
    RedrivePolicy: attr('RedrivePolicy', 'json'),
    DeliveryPolicy: attr('DeliveryPolicy', 'json'),
    ReplayPolicy: attr('ReplayPolicy', 'json'),
    SubscriptionRoleArn: attr('SubscriptionRoleArn'),
  },
  skip: {
    Region: 'write-only (region of the topic, used only to create the subscription)',
  },
});
