import { DescribeSecurityGroupsCommand, DescribeSecurityGroupsCommandOutput, EC2Client, IpPermission } from '@aws-sdk/client-ec2';
import { check, handler, Context } from '../lib/handler';

const groups = (ctx: { physicalId: string }) => new DescribeSecurityGroupsCommand({ GroupIds: [ctx.physicalId] });
const group = (r: DescribeSecurityGroupsCommandOutput) => r.SecurityGroups?.[0];
const sortRules = (rules: any[]) =>
  rules
    .map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])))
    .map((x) => (x.IpProtocol === '-1' ? { ...x, FromPort: undefined, ToPort: undefined } : x))
    .sort((a, b) => JSON.stringify(a, Object.keys(a).sort()).localeCompare(JSON.stringify(b, Object.keys(b).sort())));

// The API groups rules by protocol/ports with lists of sources; CloudFormation has one rule per source.
function flatten(perms: IpPermission[] | undefined, ingress: boolean, account: string): any[] {
  return (perms ?? []).flatMap((p) => {
    const base = { IpProtocol: p.IpProtocol, FromPort: p.FromPort, ToPort: p.ToPort };
    return [
      ...(p.IpRanges ?? []).map((x) => ({ ...base, CidrIp: x.CidrIp, Description: x.Description })),
      ...(p.Ipv6Ranges ?? []).map((x) => ({ ...base, CidrIpv6: x.CidrIpv6, Description: x.Description })),
      ...(p.PrefixListIds ?? []).map((x) => ({
        ...base, [ingress ? 'SourcePrefixListId' : 'DestinationPrefixListId']: x.PrefixListId, Description: x.Description,
      })),
      ...(p.UserIdGroupPairs ?? []).map((x) => ({
        ...base,
        [ingress ? 'SourceSecurityGroupId' : 'DestinationSecurityGroupId']: x.GroupId,
        // The API always reports the owner; CloudFormation only has it for cross-account rules.
        ...(ingress && x.UserId !== account ? { SourceSecurityGroupOwnerId: x.UserId } : {}),
        Description: x.Description,
      })),
    ];
  });
}

const protocol = (rules: any[]) =>
  rules.map((r) => ({ ...r, IpProtocol: ({ tcp: '6', udp: '17', icmp: '1', icmpv6: '58' } as any)[String(r.IpProtocol).toLowerCase()] ?? r.IpProtocol }));

export default handler({
  type: 'AWS::EC2::SecurityGroup',
  client: EC2Client,
  exists: groups,
  properties: {
    GroupDescription: check({ call: groups, actual: (r) => group(r)?.Description }),
    GroupName: check({ call: groups, actual: (r) => group(r)?.GroupName }),
    VpcId: check({ call: groups, actual: (r) => group(r)?.VpcId }),
    SecurityGroupIngress: check({
      call: groups,
      expected: (v: any[]) => sortRules(protocol(v.map(({ SourceSecurityGroupName, ...rest }) => rest))),
      actual: (r, ctx: Context) => sortRules(protocol(flatten(group(r)?.IpPermissions, true, ctx.account))),
      note: 'SourceSecurityGroupName is write-only; protocol names are normalized to numbers',
    }),
    SecurityGroupEgress: check({
      call: groups,
      expected: (v: any[]) => sortRules(protocol(v)),
      actual: (r, ctx: Context) => sortRules(protocol(flatten(group(r)?.IpPermissionsEgress, false, ctx.account))),
      note: 'protocol names are normalized to numbers',
    }),
    Tags: check({ call: groups, actual: (r) => group(r)?.Tags, compare: 'subset', note: 'EC2 adds aws:cloudformation:* tags' }),
  },
});
