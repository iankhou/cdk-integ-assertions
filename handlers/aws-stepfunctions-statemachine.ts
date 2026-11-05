import { DescribeStateMachineCommand, ListTagsForResourceCommand, SFNClient } from '@aws-sdk/client-sfn';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) => new DescribeStateMachineCommand({ stateMachineArn: ctx.physicalId });

export default handler({
  type: 'AWS::StepFunctions::StateMachine',
  client: SFNClient,
  exists: describe,
  properties: {
    DefinitionString: check({
      call: describe,
      // parsed and compared structurally (state order in arrays is significant)
      expected: (v: string) => JSON.parse(v),
      actual: (res) => res.definition && JSON.parse(res.definition),
    }),
    RoleArn: check({ call: describe, actual: (res) => res.roleArn }),
    StateMachineName: check({ call: describe, actual: (res) => res.name }),
    StateMachineType: check({ call: describe, actual: (res) => res.type }),
    'TracingConfiguration.Enabled': check({ call: describe, actual: (res) => res.tracingConfiguration?.enabled }),
    LoggingConfiguration: check({
      call: describe,
      expected: (l: any) => ({
        level: l.Level,
        includeExecutionData: l.IncludeExecutionData,
        destinations: l.Destinations?.map((d: any) => ({ cloudWatchLogsLogGroup: { logGroupArn: d.CloudWatchLogsLogGroup?.LogGroupArn } })),
      }),
      actual: (res) => res.loggingConfiguration,
    }),
    EncryptionConfiguration: check({
      call: describe,
      expected: (e: any) => ({
        type: e.Type,
        kmsKeyId: e.KmsKeyId,
        kmsDataKeyReusePeriodSeconds: e.KmsDataKeyReusePeriodSeconds === undefined ? undefined : Number(e.KmsDataKeyReusePeriodSeconds),
      }),
      actual: (res) => res.encryptionConfiguration,
    }),
    Tags: check({
      call: (ctx) => new ListTagsForResourceCommand({ resourceArn: ctx.physicalId }),
      expected: (tags: any[]) => tags.map((t) => ({ key: t.Key, value: t.Value })),
      actual: (res) => res.tags,
      compare: 'subset',
      note: 'CloudFormation adds aws:cloudformation:* tags',
    }),
  },
  skip: {
    Definition: 'write-only (sent as the definition string)',
    DefinitionS3Location: 'write-only',
    DefinitionSubstitutions: 'write-only (substituted into the definition)',
  },
});
