from aws_cdk import (
    aws_ec2 as ec2,
)
from constructs import Construct


class SecurityConstruct(Construct):
    def __init__(self, scope: Construct, construct_id: str, *, vpc: ec2.IVpc) -> None:
        super().__init__(scope, construct_id)
        self.master_security_group = ec2.SecurityGroup(
            self,
            'YugabyteMasterSecurityGroup',
            vpc=vpc,
            description='Yugabyte master node security group',
            security_group_name='YugabyteMasterSecurityGroup',
        )
        self.master_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(22),
            'SSH access',
        )
        self.master_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(7000),
            'YB-Master HTTP',
        )
        self.master_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(7100),
            'YB-Master RPC',
        )
        self.tserver_security_group = ec2.SecurityGroup(
            self,
            'YugabyteTServerSecurityGroup',
            vpc=vpc,
            description='Yugabyte TServer node security group',
            security_group_name='YugabyteTServerSecurityGroup',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(22),
            'SSH access',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(9000),
            'YB-TServer HTTP',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(9100),
            'YB-TServer RPC',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(6379),
            'YEDIS',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(5433),
            'YSQL',
        )
        self.tserver_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(9042),
            'YCQL',
        )
