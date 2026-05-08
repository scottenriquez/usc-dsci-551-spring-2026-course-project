from aws_cdk import (
    Duration,
    RemovalPolicy,
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_ssm as ssm,
    custom_resources as cr,
)
from constructs import Construct, DependencyGroup

from yugabyte_db import placement


class NetworkingConstruct(Construct):
    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            *,
            role: str,
            peer_account_id: str,
    ) -> None:
        super().__init__(scope, construct_id)
        if role not in ('primary', 'secondary'):
            raise ValueError(f"role must be 'primary' or 'secondary', got {role!r}")
        self.role = role
        is_primary = role == 'primary'
        own_cidr = placement.PRIMARY_VPC_CIDR if is_primary else placement.SECONDARY_VPC_CIDR
        peer_cidr = placement.SECONDARY_VPC_CIDR if is_primary else placement.PRIMARY_VPC_CIDR
        peer_region = placement.SECONDARY_REGION if is_primary else placement.PRIMARY_REGION

        self.vpc = ec2.Vpc(
            self,
            'VPC',
            ip_addresses=ec2.IpAddresses.cidr(own_cidr),
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

        if is_primary:
            self._setup_primary_peering(peer_cidr, peer_region, peer_account_id)
        else:
            self._publish_secondary_state()

    def _publish_secondary_state(self) -> None:
        vpc_id_param = ssm.StringParameter(
            self,
            'SecondaryVpcIdParameter',
            parameter_name=placement.SSM_SECONDARY_VPC_ID,
            string_value=self.vpc.vpc_id,
            description='Secondary VPC ID for cross-region peering bootstrap',
        )
        vpc_id_param.apply_removal_policy(RemovalPolicy.DESTROY)
        for i, subnet in enumerate(self.private_subnets):
            rtbl_param = ssm.StringParameter(
                self,
                f'SecondaryRouteTable{i}Parameter',
                parameter_name=placement.ssm_secondary_rtbl(i),
                string_value=subnet.route_table.route_table_id,
                description=f'Secondary private subnet {i} route table ID',
            )
            rtbl_param.apply_removal_policy(RemovalPolicy.DESTROY)

    def _setup_primary_peering(
            self,
            peer_cidr: str,
            peer_region: str,
            peer_account_id: str,
    ) -> None:
        secondary_vpc_id = self._lookup_remote_ssm(
            'GetSecondaryVpcId',
            param_name=placement.SSM_SECONDARY_VPC_ID,
            region=peer_region,
        )
        secondary_rtbl_ids = [
            self._lookup_remote_ssm(
                f'GetSecondaryRtbl{i}',
                param_name=placement.ssm_secondary_rtbl(i),
                region=peer_region,
            )
            for i in range(3)
        ]
        self.peering = ec2.CfnVPCPeeringConnection(
            self,
            'CrossRegionPeering',
            vpc_id=self.vpc.vpc_id,
            peer_vpc_id=secondary_vpc_id,
            peer_region=peer_region,
            peer_owner_id=peer_account_id,
        )
        accept = cr.AwsCustomResource(
            self,
            'AcceptCrossRegionPeering',
            on_create=cr.AwsSdkCall(
                service='EC2',
                action='acceptVpcPeeringConnection',
                parameters={'VpcPeeringConnectionId': self.peering.ref},
                region=peer_region,
                physical_resource_id=cr.PhysicalResourceId.of(self.peering.ref),
                ignore_error_codes_matching='InvalidStateTransition',
            ),
            on_update=cr.AwsSdkCall(
                service='EC2',
                action='describeVpcPeeringConnections',
                parameters={'VpcPeeringConnectionIds': [self.peering.ref]},
                region=peer_region,
                physical_resource_id=cr.PhysicalResourceId.of(self.peering.ref),
            ),
            policy=cr.AwsCustomResourcePolicy.from_statements([
                iam.PolicyStatement(
                    actions=[
                        'ec2:AcceptVpcPeeringConnection',
                        'ec2:DescribeVpcPeeringConnections',
                    ],
                    resources=['*'],
                ),
            ]),
            timeout=Duration.minutes(2),
        )
        accept.node.add_dependency(self.peering)
        self.peering_accept = accept
        for i, subnet in enumerate(self.private_subnets):
            route = ec2.CfnRoute(
                self,
                f'PrimaryPeerRoute{i}',
                route_table_id=subnet.route_table.route_table_id,
                destination_cidr_block=peer_cidr,
                vpc_peering_connection_id=self.peering.ref,
            )
            route.node.add_dependency(accept)

        for i, rtbl_id in enumerate(secondary_rtbl_ids):
            secondary_route = cr.AwsCustomResource(
                self,
                f'SecondaryPeerRoute{i}',
                on_create=cr.AwsSdkCall(
                    service='EC2',
                    action='createRoute',
                    parameters={
                        'RouteTableId': rtbl_id,
                        'DestinationCidrBlock': placement.PRIMARY_VPC_CIDR,
                        'VpcPeeringConnectionId': self.peering.ref,
                    },
                    region=peer_region,
                    physical_resource_id=cr.PhysicalResourceId.of(
                        f'SecondaryPeerRoute{i}'
                    ),
                    ignore_error_codes_matching='RouteAlreadyExists',
                ),
                on_delete=cr.AwsSdkCall(
                    service='EC2',
                    action='deleteRoute',
                    parameters={
                        'RouteTableId': rtbl_id,
                        'DestinationCidrBlock': placement.PRIMARY_VPC_CIDR,
                    },
                    region=peer_region,
                    ignore_error_codes_matching='InvalidRoute.NotFound',
                ),
                policy=cr.AwsCustomResourcePolicy.from_statements([
                    iam.PolicyStatement(
                        actions=[
                            'ec2:CreateRoute',
                            'ec2:DeleteRoute',
                            'ec2:DescribeRouteTables',
                        ],
                        resources=['*'],
                    ),
                ]),
                timeout=Duration.minutes(2),
            )
            secondary_route.node.add_dependency(accept)

    def _lookup_remote_ssm(self, logical_id: str, *, param_name: str, region: str) -> str:
        lookup = cr.AwsCustomResource(
            self,
            logical_id,
            on_create=cr.AwsSdkCall(
                service='SSM',
                action='getParameter',
                parameters={'Name': param_name},
                region=region,
                physical_resource_id=cr.PhysicalResourceId.of(f'{logical_id}-{param_name}'),
            ),
            on_update=cr.AwsSdkCall(
                service='SSM',
                action='getParameter',
                parameters={'Name': param_name},
                region=region,
                physical_resource_id=cr.PhysicalResourceId.of(f'{logical_id}-{param_name}'),
            ),
            policy=cr.AwsCustomResourcePolicy.from_statements([
                iam.PolicyStatement(
                    actions=['ssm:GetParameter', 'ssm:GetParameters'],
                    resources=['*'],
                ),
            ]),
            timeout=Duration.minutes(2),
        )
        return lookup.get_response_field('Parameter.Value')
