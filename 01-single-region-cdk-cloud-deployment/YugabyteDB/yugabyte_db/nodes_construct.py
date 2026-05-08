from pathlib import Path
from typing import List
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
        secret_arn: str,
    ) -> None:
        super().__init__(scope, construct_id)
        stack = Stack.of(self)
        node_count = 3
        node_role = iam.Role(
            self,
            'YugabyteNodeRole',
            assumed_by=iam.ServicePrincipal('ec2.amazonaws.com'),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    'AmazonSSMManagedInstanceCore'
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    'CloudWatchAgentServerPolicy'
                ),
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
                group_set=[
                    master_security_group.security_group_id,
                    tserver_security_group.security_group_id,
                ],
            )
            network_interfaces.append(eni)
        private_ips_join = Fn.join(
            ' ', [eni.attr_primary_private_ip_address for eni in network_interfaces]
        )
        az_join = Fn.join(
            ' ', [subnet.availability_zone for subnet in private_subnets[:node_count]]
        )
        region = stack.region
        stack_name = stack.stack_name
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
                tags=[CfnTag(key='Name', value=f'{stack_name}Node-{node_index}')],
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
            node.cfn_options.creation_policy = CfnCreationPolicy(
                resource_signal=CfnResourceSignal(
                    count=1,
                    timeout='PT20M' if node_index == 2 else 'PT15M',
                )
            )
            install_command = f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/install_software.sh {db_version}"'
            node_az = private_subnets[node_index].availability_zone
            create_command = Fn.join(
                '',
                [
                    f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/create_universe.sh',
                    f' AWS {region} {rf_factor}',
                    " '",
                    private_ips_join,
                    "'",
                    " '",
                    az_join,
                    "'",
                    f' {node_az}',
                    f' {ssh_user}"',
                ],
            )
            cloudwatch_command = f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/setup_cloudwatch_agent.sh {stack_name} {node_index}"'
            set_password_command = Fn.join(
                '',
                [
                    f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/set_password.sh',
                    f' {secret_arn}',
                    f' {region}',
                    ' ',
                    network_interfaces[0].attr_primary_private_ip_address,
                    f' {ssh_user}"',
                ],
            )
            apply_schema_command = Fn.join(
                '',
                [
                    f'bash -c "sudo -u {ssh_user} /home/{ssh_user}/apply_schema.sh',
                    f' {secret_arn}',
                    f' {region}',
                    ' ',
                    network_interfaces[0].attr_primary_private_ip_address,
                    f' {ssh_user}"',
                ],
            )
            files_metadata = {}
            for script_name in SCRIPT_FILES:
                script_content = (SCRIPTS_DIR / script_name).read_text()
                remote_path = f'/home/ec2-user/{script_name}'
                files_metadata[remote_path] = {
                    'content': script_content,
                    'mode': '000755',
                    'owner': ssh_user,
                    'group': ssh_user,
                }
            schema_content = (SCHEMA_DIR / 'schema.sql').read_text()
            files_metadata[f'/home/ec2-user/schema.sql'] = {
                'content': schema_content,
                'mode': '000644',
                'owner': ssh_user,
                'group': ssh_user,
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
                                **(
                                    {
                                        '04_Set_Password': {'command': set_password_command},
                                        '05_Apply_Schema': {'command': apply_schema_command},
                                    }
                                    if node_index == 2
                                    else {}
                                ),
                            },
                        },
                    }
                },
            )
            self.nodes.append(node)
        self.nodes[2].add_dependency(self.nodes[0])
        self.nodes[2].add_dependency(self.nodes[1])
