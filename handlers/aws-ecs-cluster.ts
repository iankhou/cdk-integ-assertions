import { DescribeClustersCommand, ECSClient, ListServicesCommand } from '@aws-sdk/client-ecs';
import { check, handler } from '../lib/handler';

const describe = (ctx: { physicalId: string }) =>
  new DescribeClustersCommand({ clusters: [ctx.physicalId], include: ['SETTINGS', 'CONFIGURATIONS', 'TAGS'] });

/** CloudFormation's PascalCase keys to the API's camelCase (user-defined map keys are left alone) */
const camel = (v: any): any => Array.isArray(v) ? v.map(camel)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k[0].toLowerCase() + k.slice(1), camel(x)]))
  : v;

const strategy = (s: any[]) => s.map((x) => ({ capacityProvider: x.CapacityProvider, weight: Number(x.Weight ?? 0), base: Number(x.Base ?? 0) }));

export default handler({
  type: 'AWS::ECS::Cluster',
  client: ECSClient,
  // DescribeClusters reports a missing cluster in `failures` rather than failing
  exists: (ctx) => new ListServicesCommand({ cluster: ctx.physicalId }),
  properties: {
    ClusterName: check({ call: describe, actual: (res) => res.clusters?.[0]?.clusterName }),
    ClusterSettings: check({
      call: describe,
      expected: (s: any[]) => s.map((x) => ({ name: x.Name, value: x.Value })),
      actual: (res) => res.clusters?.[0]?.settings,
    }),
    CapacityProviders: check({ call: describe, actual: (res) => res.clusters?.[0]?.capacityProviders }),
    DefaultCapacityProviderStrategy: check({
      call: describe,
      expected: strategy,
      actual: (res) => res.clusters?.[0]?.defaultCapacityProviderStrategy,
    }),
    Configuration: check({
      call: describe,
      expected: camel,
      actual: (res) => res.clusters?.[0]?.configuration,
      compare: 'subset',
    }),
    Tags: check({
      call: describe,
      expected: (tags: any[]) => tags.map((t) => ({ key: t.Key, value: t.Value })),
      actual: (res) => res.clusters?.[0]?.tags,
      compare: 'subset',
    }),
  },
  skip: {
    ServiceConnectDefaults: 'write-only',
  },
});
