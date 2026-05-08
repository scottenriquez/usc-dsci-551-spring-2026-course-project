from aws_cdk import aws_ec2 as ec2
from constructs import Construct

from yugabyte_db import placement


class SecurityConstruct(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        vpc: ec2.IVpc,
        role: str,
    ) -> None:
        super().__init__(scope, construct_id)
        peer_cidr = placement.peer_vpc_cidr(
            placement.PRIMARY_REGION if role == 'primary' else placement.SECONDARY_REGION
        )

        self.master_security_group = ec2.SecurityGroup(
            self,
            'YugabyteMasterSecurityGroup',
            vpc=vpc,
            description='Yugabyte master node security group',
            security_group_name=f'YugabyteMasterSecurityGroup-{role}',
        )
        for port, label in [(22, 'SSH access'), (7000, 'YB-Master HTTP'), (7100, 'YB-Master RPC')]:
            self.master_security_group.add_ingress_rule(
                ec2.Peer.ipv4(vpc.vpc_cidr_block),
                ec2.Port.tcp(port),
                f'{label} (local VPC)',
            )
        self.master_security_group.add_ingress_rule(
            ec2.Peer.ipv4(peer_cidr),
            ec2.Port.tcp(7100),
            'YB-Master RPC (peer region)',
        )

        self.tserver_security_group = ec2.SecurityGroup(
            self,
            'YugabyteTServerSecurityGroup',
            vpc=vpc,
            description='Yugabyte TServer node security group',
            security_group_name=f'YugabyteTServerSecurityGroup-{role}',
        )
        local_ports = [
            (22, 'SSH access'),
            (9000, 'YB-TServer HTTP'),
            (9100, 'YB-TServer RPC'),
            (placement.YEDIS_PORT, 'YEDIS'),
            (placement.YSQL_PORT, 'YSQL'),
            (placement.YCQL_PORT, 'YCQL'),
        ]
        for port, label in local_ports:
            self.tserver_security_group.add_ingress_rule(
                ec2.Peer.ipv4(vpc.vpc_cidr_block),
                ec2.Port.tcp(port),
                f'{label} (local VPC)',
            )
        for port, label in [
            (9100, 'YB-TServer RPC'),
            (placement.YSQL_PORT, 'YSQL'),
            (placement.YCQL_PORT, 'YCQL'),
        ]:
            self.tserver_security_group.add_ingress_rule(
                ec2.Peer.ipv4(peer_cidr),
                ec2.Port.tcp(port),
                f'{label} (peer region)',
            )
