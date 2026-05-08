from aws_cdk import (
    CfnOutput,
    CfnParameter,
    Duration,
    Fn,
    RemovalPolicy,
    Stack,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
    aws_ssm as ssm,
    custom_resources as cr,
)
from constructs import Construct

from yugabyte_db import placement
from yugabyte_db.networking_construct import NetworkingConstruct
from yugabyte_db.security_construct import SecurityConstruct
from yugabyte_db.nodes_construct import NodesConstruct
from yugabyte_db.load_balancer_construct import LoadBalancerConstruct


class YugabyteDBStack(Stack):
    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            *,
            role: str,
            peer_account_id: str,
            **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        if role not in ('primary', 'secondary'):
            raise ValueError(f"role must be 'primary' or 'secondary', got {role!r}")
        is_primary = role == 'primary'

        db_version = CfnParameter(
            self, 'DBVersion', type='String', default='2.1.6.0-b17',
            description='YugabyteDB version',
        )
        rf_factor = CfnParameter(
            self, 'RFFactor', type='String', default='3',
            description='Replication factor (3 or 5)',
        )
        key_name = CfnParameter(
            self, 'KeyName', type='AWS::EC2::KeyPair::KeyName',
            default='yugabyte-db-key-pair',
            description='EC2 key pair name (must exist in BOTH regions with the same name)',
        )
        instance_type = CfnParameter(
            self, 'InstanceType', type='String', default='t3.medium',
            allowed_values=['t3.medium', 't3.large', 'c5.xlarge', 'c5.2xlarge'],
        )
        latest_ami_id = CfnParameter(
            self, 'LatestAmiId',
            type='AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
            default='/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
        )
        ssh_user = CfnParameter(self, 'SshUser', type='String', default='ec2-user')
        db_username = CfnParameter(
            self, 'DBUsername', type='String', default='ybadmin',
            description='Custom YugabyteDB superuser name',
        )
        if not is_primary:
            db_credential_secret = secretsmanager.Secret(
                self,
                'YugabyteDBCredentials',
                description='Credentials for the YugabyteDB custom superuser',
                generate_secret_string=secretsmanager.SecretStringGenerator(
                    exclude_punctuation=True,
                    password_length=32,
                    generate_string_key='password',
                    secret_string_template=Fn.sub(
                        '{"username":"${Username}"}',
                        {'Username': db_username.value_as_string},
                    ),
                ),
            )
            secret_arn = db_credential_secret.secret_arn

            arn_param = ssm.StringParameter(
                self, 'SecretArnParameter',
                parameter_name=placement.SSM_SECONDARY_SECRET_ARN,
                string_value=secret_arn,
                description='YugabyteDB credentials secret ARN (multi-region)',
            )
            arn_param.apply_removal_policy(RemovalPolicy.DESTROY)
        else:
            secret_arn = self._lookup_remote_secret_arn(placement.SECONDARY_REGION)

        networking = NetworkingConstruct(
            self, 'Networking',
            role=role,
            peer_account_id=peer_account_id,
        )
        security = SecurityConstruct(
            self, 'Security',
            vpc=networking.vpc,
            role=role,
        )
        peering_dep = getattr(networking, 'peering_accept', None)

        nodes = NodesConstruct(
            self, 'Nodes',
            role=role,
            private_subnets=networking.private_subnets,
            master_security_group=security.master_security_group,
            tserver_security_group=security.tserver_security_group,
            key_name=key_name.value_as_string,
            db_version=db_version.value_as_string,
            rf_factor=rf_factor.value_as_string,
            instance_type=instance_type.value_as_string,
            ssh_user=ssh_user.value_as_string,
            ami_id=latest_ami_id.value_as_string,
            nat_connectivity=networking.nat_connectivity,
            peering_dependency=peering_dep,
            secret_arn=secret_arn,
        )
        load_balancer = LoadBalancerConstruct(
            self, 'LoadBalancer',
            vpc=networking.vpc,
            nodes=nodes.nodes,
            tserver_security_group=security.tserver_security_group,
            role=role,
        )
        nlb_dns = load_balancer.nlb.load_balancer_dns_name

        CfnOutput(self, 'VPC', value=networking.vpc.vpc_id, description=f'{role} VPC')
        CfnOutput(self, 'Region', value=self.region, description='AWS region')
        CfnOutput(self, 'NLBDNSName', value=nlb_dns, description=f'{role} NLB DNS name')
        CfnOutput(
            self, 'YSQL',
            value=Fn.join(' ', ['ysqlsh -U', db_username.value_as_string, '-h', nlb_dns, '-p 5433']),
        )
        if not is_primary:
            CfnOutput(
                self, 'YugabyteDBCredentialsSecretArn',
                value=secret_arn,
                description='Secret lives in secondary region (us-east-2)',
            )

    def _lookup_remote_secret_arn(self, peer_region: str) -> str:
        """Cross-region SSM read for the secret ARN written by secondary."""
        lookup = cr.AwsCustomResource(
            self,
            'GetSecretArn',
            on_create=cr.AwsSdkCall(
                service='SSM',
                action='getParameter',
                parameters={'Name': placement.SSM_SECONDARY_SECRET_ARN},
                region=peer_region,
                physical_resource_id=cr.PhysicalResourceId.of(
                    f'GetSecretArn-{placement.SSM_SECONDARY_SECRET_ARN}'
                ),
            ),
            on_update=cr.AwsSdkCall(
                service='SSM',
                action='getParameter',
                parameters={'Name': placement.SSM_SECONDARY_SECRET_ARN},
                region=peer_region,
                physical_resource_id=cr.PhysicalResourceId.of(
                    f'GetSecretArn-{placement.SSM_SECONDARY_SECRET_ARN}'
                ),
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
