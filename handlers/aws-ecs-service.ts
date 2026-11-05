import { DescribeServicesCommand, ECSClient, ListServiceDeploymentsCommand } from '@aws-sdk/client-ecs';
import { check, handler } from '../lib/handler';

/** Physical id is the service ARN: arn:aws:ecs:<region>:<account>:service/<cluster>/<service> */
const describe = (ctx: { physicalId: string }) => new DescribeServicesCommand({
  cluster: ctx.physicalId.split('/')[1], services: [ctx.physicalId], include: ['TAGS'],
});
const svc = (res: any) => res.services?.[0];
const num = (v: any) => (v === undefined ? undefined : Number(v));
const bool = (v: any) => (v === undefined ? undefined : String(v) === 'true');

/** CloudFormation's PascalCase keys to the API's camelCase */
const camel = (v: any): any => Array.isArray(v) ? v.map(camel)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k[0].toLowerCase() + k.slice(1), camel(x)]))
  : v;
const sorted = (a?: string[]) => a && [...a].sort();
const awsvpc = (c: any) => c && { assignPublicIp: c.assignPublicIp ?? c.AssignPublicIp, securityGroups: sorted(c.securityGroups ?? c.SecurityGroups), subnets: sorted(c.subnets ?? c.Subnets) };
const strategy = (s: any[]) => s.map((x) => ({ capacityProvider: x.CapacityProvider, weight: num(x.Weight) ?? 0, base: num(x.Base) ?? 0 }));
const clusterArn = (name: string, ctx: { region: string; account: string }) =>
  name.startsWith('arn:') ? name : `arn:aws:ecs:${ctx.region}:${ctx.account}:cluster/${name}`;

export default handler({
  type: 'AWS::ECS::Service',
  client: ECSClient,
  // DescribeServices reports a missing service in `failures` rather than failing; this throws ServiceNotFoundException
  exists: (ctx) => new ListServiceDeploymentsCommand({ cluster: ctx.physicalId.split('/')[1], service: ctx.physicalId }),
  properties: {
    ServiceName: check({ call: describe, actual: (res) => svc(res)?.serviceName }),
    Cluster: check({ call: describe, expected: clusterArn, actual: (res) => svc(res)?.clusterArn }),
    TaskDefinition: check({ call: describe, actual: (res) => svc(res)?.taskDefinition }),
    LaunchType: check({ call: describe, actual: (res) => svc(res)?.launchType }),
    PlatformVersion: check({ call: describe, actual: (res) => svc(res)?.platformVersion }),
    DesiredCount: check({ call: describe, actual: (res) => svc(res)?.desiredCount }),
    SchedulingStrategy: check({ call: describe, actual: (res) => svc(res)?.schedulingStrategy }),
    PropagateTags: check({ call: describe, actual: (res) => svc(res)?.propagateTags }),
    EnableECSManagedTags: check({ call: describe, expected: bool, actual: (res) => svc(res)?.enableECSManagedTags }),
    EnableExecuteCommand: check({ call: describe, expected: bool, actual: (res) => svc(res)?.enableExecuteCommand }),
    HealthCheckGracePeriodSeconds: check({ call: describe, actual: (res) => svc(res)?.healthCheckGracePeriodSeconds }),
    AvailabilityZoneRebalancing: check({ call: describe, actual: (res) => svc(res)?.availabilityZoneRebalancing }),
    Role: check({
      call: describe,
      expected: (r: string, ctx) => (r.startsWith('arn:') ? r : `arn:aws:iam::${ctx.account}:role/${r}`),
      actual: (res) => svc(res)?.roleArn,
    }),
    DeploymentController: check({ call: describe, expected: camel, actual: (res) => svc(res)?.deploymentController }),
    DeploymentConfiguration: check({
      call: describe,
      expected: (d: any) => ({
        ...camel(d),
        maximumPercent: num(d.MaximumPercent),
        minimumHealthyPercent: num(d.MinimumHealthyPercent),
        deploymentCircuitBreaker: d.DeploymentCircuitBreaker && {
          enable: bool(d.DeploymentCircuitBreaker.Enable), rollback: bool(d.DeploymentCircuitBreaker.Rollback),
        },
        alarms: d.Alarms && { alarmNames: d.Alarms.AlarmNames, enable: bool(d.Alarms.Enable), rollback: bool(d.Alarms.Rollback) },
      }),
      actual: (res) => svc(res)?.deploymentConfiguration,
      compare: 'subset',
      note: 'subset: the API reports defaults (e.g. strategy ROLLING) not set in the template',
    }),
    NetworkConfiguration: check({
      call: describe,
      expected: (n: any) => ({ awsvpcConfiguration: awsvpc(n.AwsvpcConfiguration) }),
      actual: (res) => ({ awsvpcConfiguration: awsvpc(svc(res)?.networkConfiguration?.awsvpcConfiguration) }),
    }),
    CapacityProviderStrategy: check({ call: describe, expected: strategy, actual: (res) => svc(res)?.capacityProviderStrategy }),
    PlacementConstraints: check({ call: describe, expected: camel, actual: (res) => svc(res)?.placementConstraints }),
    PlacementStrategies: check({ call: describe, expected: camel, actual: (res) => svc(res)?.placementStrategy }),
    LoadBalancers: check({
      call: describe,
      expected: (l: any[]) => l.map((x) => ({ ...camel(x), containerPort: num(x.ContainerPort) })),
      actual: (res) => svc(res)?.loadBalancers,
    }),
    ServiceRegistries: check({
      call: describe,
      expected: (l: any[]) => l.map((x) => ({ ...camel(x), port: num(x.Port), containerPort: num(x.ContainerPort) })),
      actual: (res) => svc(res)?.serviceRegistries,
    }),
    Tags: check({
      call: describe,
      expected: (tags: any[]) => tags.map((t) => ({ key: t.Key, value: t.Value })),
      actual: (res) => svc(res)?.tags,
      compare: 'subset',
    }),
  },
  skip: {
    ServiceConnectConfiguration: 'write-only',
    VolumeConfigurations: 'write-only',
    ForceNewDeployment: 'write-only',
    Monitoring: 'write-only',
    VpcLatticeConfigurations: 'only reported on deployments (DescribeServiceDeployments), not on the service',
  },
});
