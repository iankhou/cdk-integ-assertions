import { DescribeClustersCommand, ECSClient, ListServicesCommand } from '@aws-sdk/client-ecs';
import { check, handler } from '../lib/handler';

// The physical id is the cluster name
const describe = (ctx: { physicalId: string }) => new DescribeClustersCommand({ clusters: [ctx.physicalId] });

export default handler({
  type: 'AWS::ECS::ClusterCapacityProviderAssociations',
  client: ECSClient,
  // DescribeClusters reports a missing cluster in `failures` rather than failing
  exists: (ctx) => new ListServicesCommand({ cluster: ctx.physicalId }),
  properties: {
    Cluster: check({
      call: describe,
      expected: (c: string) => c.split('/').pop(),
      actual: (res) => res.clusters?.[0]?.clusterName,
    }),
    CapacityProviders: check({
      call: describe,
      expected: (c: string[]) => [...c].sort(),
      actual: (res) => [...(res.clusters?.[0]?.capacityProviders ?? [])].sort(),
      note: 'order is not significant',
    }),
    DefaultCapacityProviderStrategy: check({
      call: describe,
      expected: (s: any[]) => s.map((x) => ({ capacityProvider: x.CapacityProvider, weight: Number(x.Weight ?? 0), base: Number(x.Base ?? 0) })),
      actual: (res) => res.clusters?.[0]?.defaultCapacityProviderStrategy,
    }),
  },
});
