from aws_cdk import aws_ec2 as ec2
from constructs import Construct, DependencyGroup


class NetworkingConstruct(Construct):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        self.vpc = ec2.Vpc(
            self,
            'VPC',
            ip_addresses=ec2.IpAddresses.cidr('10.0.0.0/16'),
            max_azs=3,
            nat_gateways=1,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name='Public',
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name='Private',
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                ),
            ],
            enable_dns_support=True,
            enable_dns_hostnames=True,
        )
        self.public_subnets = self.vpc.public_subnets
        self.private_subnets = self.vpc.private_subnets
        nat_ready = DependencyGroup()
        for subnet in self.vpc.private_subnets:
            route = subnet.node.find_child('DefaultRoute')
            nat_ready.add(route)
        self.nat_connectivity = nat_ready
