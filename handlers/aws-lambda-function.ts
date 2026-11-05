import { GetFunctionCodeSigningConfigCommand, GetFunctionCommand, GetFunctionCommandOutput, GetFunctionRecursionConfigCommand, GetRuntimeManagementConfigCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { check, handler } from '../lib/handler';

// Physical id is the function name. Most properties come from GetFunction (Configuration, Tags, Concurrency).
const get = (ctx: { physicalId: string }) => new GetFunctionCommand({ FunctionName: ctx.physicalId });
const conf = (pick: (c: NonNullable<GetFunctionCommandOutput['Configuration']>) => unknown) =>
  check<GetFunctionCommandOutput>({ call: get, actual: (r) => pick(r.Configuration ?? {}) });

export default handler({
  type: 'AWS::Lambda::Function',
  client: LambdaClient,
  exists: get,
  properties: {
    FunctionName: conf((c) => c.FunctionName),
    Description: conf((c) => c.Description),
    Handler: conf((c) => c.Handler),
    Runtime: conf((c) => c.Runtime),
    Role: conf((c) => c.Role),
    Timeout: conf((c) => c.Timeout),
    MemorySize: conf((c) => c.MemorySize),
    Architectures: conf((c) => c.Architectures),
    PackageType: conf((c) => c.PackageType),
    KmsKeyArn: conf((c) => c.KMSKeyArn),
    'Environment.Variables': conf((c) => c.Environment?.Variables),
    'TracingConfig.Mode': conf((c) => c.TracingConfig?.Mode),
    DeadLetterConfig: conf((c) => c.DeadLetterConfig),
    Layers: conf((c) => c.Layers?.map((l) => l.Arn)),
    // API adds VpcId / Ipv6AllowedForDualStack
    VpcConfig: { ...conf((c) => c.VpcConfig), compare: 'subset' },
    EphemeralStorage: conf((c) => c.EphemeralStorage),
    FileSystemConfigs: conf((c) => c.FileSystemConfigs),
    ImageConfig: conf((c) => c.ImageConfigResponse?.ImageConfig),
    // API fills in defaults (LogGroup, LogFormat)
    LoggingConfig: { ...conf((c) => c.LoggingConfig), compare: 'subset' },
    ReservedConcurrentExecutions: check<GetFunctionCommandOutput>({
      call: get,
      actual: (r) => r.Concurrency?.ReservedConcurrentExecutions,
    }),
    // Template is a Key/Value list, API a map that also has CloudFormation's aws:* tags
    Tags: check<GetFunctionCommandOutput>({
      call: get,
      expected: (v: { Key: string; Value: string }[]) => Object.fromEntries(v.map((t) => [t.Key, t.Value])),
      actual: (r) => r.Tags,
      compare: 'subset',
    }),
    RuntimeManagementConfig: check({
      call: (ctx) => new GetRuntimeManagementConfigCommand({ FunctionName: ctx.physicalId }),
      actual: (r) => ({ UpdateRuntimeOn: r.UpdateRuntimeOn, RuntimeVersionArn: r.RuntimeVersionArn }),
      compare: 'subset',
    }),
    RecursiveLoop: check({
      call: (ctx) => new GetFunctionRecursionConfigCommand({ FunctionName: ctx.physicalId }),
      actual: (r) => r.RecursiveLoop,
    }),
    CodeSigningConfigArn: check({
      call: (ctx) => new GetFunctionCodeSigningConfigCommand({ FunctionName: ctx.physicalId }),
      actual: (r) => r.CodeSigningConfigArn,
    }),
  },
  skip: {
    Code: 'write-only (S3Bucket/S3Key/ZipFile/ImageUri); the API only returns a presigned download location and CodeSha256',
    SnapStart: 'write-only',
  },
});
