# cdk-integ-assertions

Checks that the resources a CDK integ test deployed have the properties its template says they have, by reading each
resource back through its service's API.

CloudFormation reporting `CREATE_COMPLETE` doesn't prove a bucket has versioning on or a queue has the right
visibility timeout. A *handler* per resource type reads the deployed resource with read-only SDK calls, and compares
each property against the stack's *resolved template*: the synthesized template with every `Ref`, `Fn::GetAtt`,
`Fn::Sub` and so on replaced by the value it has in the deployed stack.

The same handlers run against real AWS or against an emulator, so they can also measure how faithfully an emulator
behaves like AWS.

## How it works

1. Deploy the integ test (e.g. `cdk deploy --app <test>.js.snapshot`, or with integ-runner).
2. Resolve each deployed stack's template with the toolkit-lib `evaluate` action (`scripts/evaluate.js`).
3. Run the handlers (`lib/check.ts`). For each resource with a handler:
   - the handler's `exists` call must succeed;
   - for each property set in the template, the check's read call returns the deployed value, which must match the
     template's value;
   - each passing check is compared again with the expected value altered, which must not match; a check that still
     matches can't tell right from wrong, and is reported as `ALTERED VALUE NOT CAUGHT`.

Only `Get*`, `Describe*`, `List*`, `Head*` and `BatchGet*` calls are allowed, and identical calls are made once.

## Setup

```sh
npm install
scripts/build-toolkit-lib.sh   # builds toolkit-lib with the evaluate action into .toolkit-lib/
```

The `evaluate` action isn't released yet. `build-toolkit-lib.sh` builds it from the
[`template-evaluation`](https://github.com/iankhou/aws-cdk-cli/tree/template-evaluation) branch of
iankhou/aws-cdk-cli (aws/aws-cdk-cli#2075, #2066 and #2087). To use another build, set `TOOLKIT_LIB` to its
`packages/@aws-cdk/toolkit-lib` directory.

## Usage

Credentials, region and endpoint come from the standard AWS environment variables.

```sh
node scripts/evaluate.js path/to/integ.my-test.js.snapshot my-test.evaluate.json MyStack
npm run check -- --resolved my-test.evaluate.json --stack MyStack --out my-test.report.json
```

`check` prints every result that isn't a pass (`--all` prints everything), and a summary:

| Status | Meaning |
|---|---|
| `pass` | the deployed value matches the template |
| `fail` | the deployed value differs from the template |
| `missing` | the `exists` call failed: CloudFormation has the resource, the service doesn't |
| `error` | the read call failed |
| `unresolved` | the template value couldn't be resolved, so there's nothing to compare |
| `gap` | the template sets a property the handler doesn't check or skip |
| `no handler` | no handler for the resource type |
| `not deployed` | the resource isn't in the deployed stack |

`--types T1,T2` limits the run to some resource types.

### From integ-runner

integ-runner from the same branch can run the checker on each test stack after deploying it:

```sh
integ-runner --resource-checks path/to/cdk-integ-assertions ...
```

It prints a summary per stack (e.g. `my-stack: 24 pass, 3 missing`), and writes the results to
`<stackName>.checks.json` in the snapshot, next to `<stackName>.resolved.json`. The results never fail the test.

### Against an emulator

Point the AWS environment at the emulator (`AWS_ENDPOINT_URL`, its credentials, and `NODE_EXTRA_CA_CERTS` if it
serves HTTPS with its own CA). Nothing is adjusted for the emulator: whatever it doesn't support fails or is reported
(a deployment that fails, a value evaluate can't resolve, a `missing` resource, a `fail`), and those are the gaps to
compare against a run on real AWS.

With an endpoint override, SQS calls go to the override, not to the host in the queue URL.

## Writing a handler

A handler is `handlers/<type>.ts`, named after the resource type in lower case with `::` replaced by `-` (e.g.
`handlers/aws-sqs-queue.ts` for `AWS::SQS::Queue`). It's typed against the AWS SDK v3, so `npm run typecheck` catches
wrong commands, inputs and response fields.

```ts
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { check, handler } from '../lib/handler';

// The physical id is the queue URL.
const attributes = (ctx: { physicalId: string }) => new GetQueueAttributesCommand({ QueueUrl: ctx.physicalId, AttributeNames: ['All'] });

export default handler({
  type: 'AWS::SQS::Queue',
  client: SQSClient,
  exists: attributes,
  properties: {
    VisibilityTimeout: check({ call: attributes, actual: (res) => res.Attributes?.VisibilityTimeout }),
    RedrivePolicy: check({ call: attributes, actual: (res) => res.Attributes?.RedrivePolicy, compare: 'json' }),
  },
});
```

- `properties` is keyed by property path in the template (`VersioningConfiguration.Status`, or `Tags`).
- `expected` converts the template's value to the API's shape, when they differ (e.g. CloudFormation's tag list to a map).
- `compare` is `equals` (default; scalars compared as strings), `subset` (expected keys and elements present), or
  `json` (JSON documents, compared as policies).
- `skip` lists properties that can't be read back (e.g. write-only), with the reason, so they aren't reported as gaps.
- `ctx.send` makes an extra read call a check needs, such as a lookup by name.

Run the handler against a deployed stack that sets the property, and check it passes and catches the altered value.

## Handlers

`AWS::ApiGateway::Account`, `AWS::ApiGateway::Deployment`, `AWS::ApiGateway::Method`, `AWS::ApiGateway::Model`, `AWS::ApiGateway::RequestValidator`, `AWS::ApiGateway::Resource`, `AWS::ApiGateway::RestApi`, `AWS::ApiGateway::Stage`, `AWS::ApplicationAutoScaling::ScalableTarget`, `AWS::ApplicationAutoScaling::ScalingPolicy`, `AWS::CloudFront::CloudFrontOriginAccessIdentity`, `AWS::CloudFront::Distribution`, `AWS::CloudFront::Function`, `AWS::CloudWatch::Alarm`, `AWS::CloudWatch::CompositeAlarm`, `AWS::CloudWatch::Dashboard`, `AWS::DynamoDB::GlobalTable`, `AWS::DynamoDB::Table`, `AWS::EC2::EIP`, `AWS::EC2::InternetGateway`, `AWS::EC2::NatGateway`, `AWS::EC2::Route`, `AWS::EC2::RouteTable`, `AWS::EC2::SecurityGroup`, `AWS::EC2::Subnet`, `AWS::EC2::SubnetRouteTableAssociation`, `AWS::EC2::VPC`, `AWS::EC2::VPCGatewayAttachment`, `AWS::ECS::Cluster`, `AWS::ECS::ClusterCapacityProviderAssociations`, `AWS::ECS::Service`, `AWS::ECS::TaskDefinition`, `AWS::Events::Rule`, `AWS::IAM::ManagedPolicy`, `AWS::IAM::Policy`, `AWS::IAM::Role`, `AWS::KMS::Key`, `AWS::Lambda::EventInvokeConfig`, `AWS::Lambda::EventSourceMapping`, `AWS::Lambda::Function`, `AWS::Lambda::LayerVersion`, `AWS::Lambda::Permission`, `AWS::Lambda::Version`, `AWS::Logs::LogGroup`, `AWS::Logs::MetricFilter`, `AWS::Logs::SubscriptionFilter`, `AWS::S3::Bucket`, `AWS::S3::BucketPolicy`, `AWS::SNS::Subscription`, `AWS::SNS::Topic`, `AWS::SNS::TopicPolicy`, `AWS::SQS::Queue`, `AWS::SQS::QueuePolicy`, `AWS::StepFunctions::StateMachine`, `AWS::WAFv2::WebACL`, `AWS::WAFv2::WebACLAssociation`

## License

Apache-2.0
