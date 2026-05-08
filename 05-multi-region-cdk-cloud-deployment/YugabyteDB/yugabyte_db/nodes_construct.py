from pathlib import Path
from typing import List, Optional
from aws_cdk import (
    CfnCreationPolicy,
    CfnResourceSignal,
    CfnTag,
    Fn,
    Stack,
    aws_ec2 as ec2,
    aws_iam as iam,
)
from constructs import Construct, IDependable

from yugabyte_db import placement

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / 'node-scripts'
SCHEMA_DIR = Path(__file__).resolve().parent.parent.parent.parent / '02-application-schema'

SCRIPT_FILES = [
    'install_software.sh',
    'create_universe.sh',
    'start_master.sh',
    'start_tserver.sh',
    'setup_cloudwatch_agent.sh',
    'set_password.sh',
    'apply_schema.sh',
]


class NodesConstruct(Construct):
    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            *,
            role: str,
            private_subnets: List[ec2.ISubnet],
            master_security_group: ec2.ISecurityGroup,
            tserver_security_group: ec2.ISecurityGroup,
            key_name: str,
            db_version: str,
            rf_factor: str,
            instance_type: str,
            ssh_user: str,
            ami_id: str,
            nat_connectivity: IDependable,
            peering_dependency: Optional[IDependable],
            secret_arn: str,
    ) -> None:
        super().__init__(scope, construct_id)
        if role not in ('primary', 'secondary'):
            raise ValueError(f"role must be 'primary' or 'secondary', got {role!r}")
        stack = Stack.of(self)
        is_primary = role == 'primary'
        own_ips = placement.PRIMARY_NODE_IPS if is_primary else placement.SECONDARY_NODE_IPS
        node_count = len(own_ips)
        node_role = iam.Role(
            self,
            'YugabyteNodeRole',
            assumed_by=iam.ServicePrincipal('ec2.amazonaws.com'),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.from_aws_managed_policy_name('CloudWatchAgentServerPolicy'),
            ],
        )
        node_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    'cloudformation:DescribeStackResource',
                    'cloudformation:SignalResource',
                ],
                resources=[
                    f'arn:aws:cloudformation:{stack.region}:{stack.account}:stack/{stack.stack_name}/*'
                ],
            )
        )
        node_role.add_to_policy(
            iam.PolicyStatement(
                actions=['secretsmanager:GetSecretValue'],
                resources=[secret_arn],
            )
        )
        instance_profile = iam.CfnInstanceProfile(
            self,
            'YugabyteNodeInstanceProfile',
            roles=[node_role.role_name],
        )
        network_interfaces: List[ec2.CfnNetworkInterface] = []
        for node_index in range(node_count):
            eni = ec2.CfnNetworkInterface(
                self,
                f'Node{node_index}NetInt',
                subnet_id=private_subnets[node_index].subnet_id,
                private_ip_address=own_ips[node_index],
                group_set=[
                    master_security_group.security_group_id,
                    tserver_security_group.security_group_id,
                ],
            )
            network_interfaces.append(eni)

        all_ips = list(placement.ALL_NODE_IPS)
        own_zones = [s.availability_zone for s in private_subnets[:node_count]]
        peer_zone_placeholders = (
            [f'{placement.SECONDARY_REGION}-z1', f'{placement.SECONDARY_REGION}-z2', f'{placement.SECONDARY_REGION}-z3']
            if is_primary
            else [f'{placement.PRIMARY_REGION}-z1', f'{placement.PRIMARY_REGION}-z2', f'{placement.PRIMARY_REGION}-z3']
        )
        all_zones = (
            own_zones + peer_zone_placeholders
            if is_primary
            else peer_zone_placeholders + own_zones
        )

        all_ips_join = ' '.join(all_ips)
        all_zones_join = ' '.join(all_zones)

        local_node0_ip = own_ips[0]

        region = stack.region
        stack_name = stack.stack_name
        rf = rf_factor

        self.nodes: List[ec2.CfnInstance] = []
        for node_index in range(node_count):
            logical_id = f'ComputeYugabyteNode{node_index}'
            user_data_script = Fn.base64(
                '#!/bin/bash -xe\n'
                'yum update -y aws-cfn-bootstrap\n'
                f'/opt/aws/bin/cfn-init -v --stack {stack_name} --resource {logical_id} --configsets InstallAndRun --region {region}\n'
                f'/opt/aws/bin/cfn-signal -e $? --stack {stack_name} --resource {logical_id} --region {region}\n'
            )
            node = ec2.CfnInstance(
                self,
                f'YugabyteNode{node_index}',
                image_id=ami_id,
                instance_type=instance_type,
                key_name=key_name,
                iam_instance_profile=instance_profile.ref,
                network_interfaces=[
                    ec2.CfnInstance.NetworkInterfaceProperty(
                        network_interface_id=network_interfaces[node_index].ref,
                        device_index='0',
                    )
                ],
                tags=[CfnTag(key='Name', value=f'{stack_name}-Node-{node_index}')],
                user_data=user_data_script,
                block_device_mappings=[
                    ec2.CfnInstance.BlockDeviceMappingProperty(
                        device_name='/dev/xvda',
                        ebs=ec2.CfnInstance.EbsProperty(
                            volume_size=1000,
                            delete_on_termination=True,
                            volume_type='gp3',
                        ),
                    )
                ],
            )
            node.override_logical_id(logical_id)
            node.node.add_dependency(nat_connectivity)
            if peering_dependency is not None:
                node.node.add_dependency(peering_dependency)
            timeout = 'PT15M' if node_index == 0 else 'PT10M'
            node.cfn_options.creation_policy = CfnCreationPolicy(
                resource_signal=CfnResourceSignal(count=1, timeout=timeout),
            )
            install_command = (
                f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/install_software.sh {db_version}"'
            )
            node_az = private_subnets[node_index].availability_zone
            create_command = (
                f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/create_universe.sh '
                f"AWS {region} {rf} '{all_ips_join}' '{all_zones_join}' {node_az} {ssh_user}\""
            )
            cloudwatch_command = (
                f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/setup_cloudwatch_agent.sh '
                f'{stack_name} {node_index}"'
            )
            set_password_command = (
                f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/set_password.sh '
                f'{secret_arn} {placement.SECONDARY_REGION} {local_node0_ip} {ssh_user}"'
            )
            apply_schema_command = (
                f'/usr/bin/systemd-run --unit=apply-schema-node-{node_index} '
                f'/bin/bash -c "sudo -u {ssh_user} /home/{ssh_user}/apply_schema.sh '
                f'{secret_arn} {placement.SECONDARY_REGION} {local_node0_ip} {ssh_user} '
                f'> /tmp/apply_schema.log 2>&1"'
            )
            files_metadata = {}
            for script_name in SCRIPT_FILES:
                script_content = (SCRIPTS_DIR / script_name).read_text()
                files_metadata[f'/home/ec2-user/{script_name}'] = {
                    'content': script_content,
                    'mode': '000755',
                    'owner': ssh_user,
                    'group': ssh_user,
                }
            schema_content = (SCHEMA_DIR / 'schema.sql').read_text()
            files_metadata['/home/ec2-user/schema.sql'] = {
                'content': schema_content,
                'mode': '000644',
                'owner': ssh_user,
                'group': ssh_user,
            }
            extra_commands = {}
            if node_index == 0:
                if is_primary:
                    extra_commands = {
                        '04_Set_Password': {'command': set_password_command},
                        '05_Apply_Schema': {'command': apply_schema_command},
                    }
                else:
                    extra_commands = {
                        '04_Apply_Schema': {'command': apply_schema_command},
                    }

            node.add_override(
                'Metadata',
                {
                    'AWS::CloudFormation::Init': {
                        'configSets': {
                            'InstallAndRun': ['Install', 'Configure'],
                        },
                        'Install': {
                            'packages': {'yum': {'git': []}},
                        },
                        'Configure': {
                            'files': files_metadata,
                            'commands': {
                                '01_Install_Yugabyte_DB': {'command': install_command},
                                '02_Create_Universe': {'command': create_command},
                                '03_Setup_CloudWatch': {'command': cloudwatch_command},
                                **extra_commands,
                            },
                        },
                    }
                },
            )
            self.nodes.append(node)

        if node_count >= 3:
            self.nodes[0].add_dependency(self.nodes[1])
            self.nodes[0].add_dependency(self.nodes[2])
