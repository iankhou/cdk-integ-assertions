import { APIGatewayClient, GetStageCommand } from '@aws-sdk/client-api-gateway';
import { check, handler } from '../lib/handler';

/** drop unset fields, so subset comparison only looks at what the template sets */
const defined = (v: any) => JSON.parse(JSON.stringify(v));

const call = (ctx: any) => new GetStageCommand({ restApiId: ctx.properties.RestApiId, stageName: ctx.physicalId });
const num = (v: any) => (v === undefined ? undefined : Number(v));
const bool = (v: any) => (v === undefined ? undefined : String(v) === 'true');

/** methodSettings key: resource path with / escaped as ~1 (/* is just *), then /method */
const settingKey = (s: any) => `${s.ResourcePath === '/*' ? '*' : s.ResourcePath.replace(/\//g, '~1')}/${s.HttpMethod}`;

export default handler({
  type: 'AWS::ApiGateway::Stage',
  client: APIGatewayClient,
  exists: call,
  properties: {
    StageName: check({ call, actual: (r) => r.stageName }),
    RestApiId: check({
      call,
      actual: (r, ctx) => (r.stageName === ctx.physicalId ? ctx.properties.RestApiId : undefined),
      note: 'the response has no API id; the stage is found under the template API',
    }),
    DeploymentId: check({ call, actual: (r) => r.deploymentId }),
    Description: check({ call, actual: (r) => r.description }),
    ClientCertificateId: check({ call, actual: (r) => r.clientCertificateId }),
    CacheClusterEnabled: check({ call, actual: (r) => r.cacheClusterEnabled }),
    CacheClusterSize: check({ call, actual: (r) => r.cacheClusterSize }),
    DocumentationVersion: check({ call, actual: (r) => r.documentationVersion }),
    TracingEnabled: check({ call, actual: (r) => r.tracingEnabled }),
    Variables: check({ call, actual: (r) => r.variables }),
    AccessLogSetting: check({
      call,
      // API Gateway stores the log group ARN without the trailing :* of the log group's Arn attribute
      expected: (a: any) => ({ destinationArn: a.DestinationArn?.replace(/:\*$/, ''), format: a.Format }),
      actual: (r) => r.accessLogSettings,
    }),
    CanarySetting: check({
      call,
      expected: (c: any) => ({
        deploymentId: c.DeploymentId, percentTraffic: num(c.PercentTraffic),
        stageVariableOverrides: c.StageVariableOverrides, useStageCache: bool(c.UseStageCache),
      }),
      actual: (r) => r.canarySettings,
    }),
    MethodSettings: check({
      call,
      expected: (ms: any[]) => defined(Object.fromEntries(ms.map((s) => [settingKey(s), {
        metricsEnabled: bool(s.MetricsEnabled),
        loggingLevel: s.LoggingLevel,
        dataTraceEnabled: bool(s.DataTraceEnabled),
        throttlingBurstLimit: num(s.ThrottlingBurstLimit),
        throttlingRateLimit: num(s.ThrottlingRateLimit),
        cachingEnabled: bool(s.CachingEnabled),
        cacheTtlInSeconds: num(s.CacheTtlInSeconds),
        cacheDataEncrypted: bool(s.CacheDataEncrypted),
      }]))),
      actual: (r) => r.methodSettings,
      compare: 'subset',
      note: 'API Gateway reports defaults for settings the template does not set',
    }),
    Tags: check({
      call,
      expected: (tags: any[]) => Object.fromEntries(tags.map((t) => [t.Key, t.Value])),
      actual: (r) => r.tags,
      compare: 'subset',
      note: 'CloudFormation adds aws:cloudformation:* tags',
    }),
  },
});
