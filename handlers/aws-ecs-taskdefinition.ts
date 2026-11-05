import { DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) =>
  new DescribeTaskDefinitionCommand({ taskDefinition: ctx.physicalId, include: ['TAGS'] });

// Keys whose values are user-defined maps (not renamed)
const MAPS = new Set(['Options', 'DockerLabels', 'DriverOpts', 'Labels']);

/** CloudFormation's PascalCase keys to the API's camelCase; numeric strings for numeric API fields become numbers */
const camel = (v: any): any => Array.isArray(v) ? v.map(camel)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) =>
    [k[0].toLowerCase() + k.slice(1), MAPS.has(k) ? x : camel(x)]))
  : v;

const td = (res: any) => res.taskDefinition;

export default handler({
  type: 'AWS::ECS::TaskDefinition',
  client: ECSClient,
  exists: describe,
  properties: {
    ContainerDefinitions: check({
      call: describe,
      expected: camel,
      actual: (res) => td(res)?.containerDefinitions,
      compare: 'subset',
      note: 'the API adds defaults (cpu 0, empty portMappings, mountPoints, volumesFrom, ...)',
    }),
    Cpu: check({ call: describe, actual: (res) => td(res)?.cpu }),
    Memory: check({ call: describe, actual: (res) => td(res)?.memory }),
    ExecutionRoleArn: check({ call: describe, actual: (res) => td(res)?.executionRoleArn }),
    TaskRoleArn: check({ call: describe, actual: (res) => td(res)?.taskRoleArn }),
    Family: check({ call: describe, actual: (res) => td(res)?.family }),
    NetworkMode: check({ call: describe, actual: (res) => td(res)?.networkMode }),
    RequiresCompatibilities: check({ call: describe, actual: (res) => td(res)?.requiresCompatibilities }),
    RuntimePlatform: check({ call: describe, expected: camel, actual: (res) => td(res)?.runtimePlatform }),
    IpcMode: check({ call: describe, actual: (res) => td(res)?.ipcMode }),
    PidMode: check({ call: describe, actual: (res) => td(res)?.pidMode }),
    EnableFaultInjection: check({ call: describe, actual: (res) => td(res)?.enableFaultInjection }),
    'EphemeralStorage.SizeInGiB': check({ call: describe, actual: (res) => td(res)?.ephemeralStorage?.sizeInGiB }),
    Volumes: check({ call: describe, expected: camel, actual: (res) => td(res)?.volumes, compare: 'subset' }),
    PlacementConstraints: check({ call: describe, expected: camel, actual: (res) => td(res)?.placementConstraints }),
    ProxyConfiguration: check({ call: describe, expected: camel, actual: (res) => td(res)?.proxyConfiguration, compare: 'subset' }),
    InferenceAccelerators: check({ call: describe, expected: camel, actual: (res) => td(res)?.inferenceAccelerators }),
    Tags: check({
      call: describe,
      expected: (tags: any[]) => tags.map((t) => ({ key: t.Key, value: t.Value })),
      actual: (res) => res.tags,
      compare: 'subset',
    }),
  },
});
