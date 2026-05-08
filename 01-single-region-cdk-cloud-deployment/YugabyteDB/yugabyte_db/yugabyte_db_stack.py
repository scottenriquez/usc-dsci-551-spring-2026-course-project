from aws_cdk import (
    CfnOutput,
    CfnParameter,
    Fn,
    RemovalPolicy,
    Stack,
    aws_secretsmanager as secretsmanager,
    aws_ssm as ssm,
)
from constructs import Construct
from yugabyte_db.networking_construct import NetworkingConstruct
from yugabyte_db.security_construct import SecurityConstruct
from yugabyte_db.nodes_construct import NodesConstruct
from yugabyte_db.load_balancer_construct import LoadBalancerConstruct


class YugabyteDBStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        db_version = CfnParameter(
            self,
            'DBVersion',
            type='String',
            default='2.1.6.0-b17',
            description='Default YugabyteDB version is 2.1.6.0-b17',
        )
        rf_factor = CfnParameter(
            self,
            'RFFactor',
            type='String',
            default='3',
            description='Replication factor to create YugabyteDB cluster by default it is set to 3.',
        )
        key_name = CfnParameter(
            self,
            'KeyName',
            type='AWS::EC2::KeyPair::KeyName',
            default='yugabyte-db-key-pair',
            description='Name of Key which is required for ssh to YugabyteDB node',
            constraint_description='must be the name of an existing EC2 KeyPair.',
        )
        instance_type = CfnParameter(
            self,
            'InstanceType',
            type='String',
            default='t3.medium',
            allowed_values=['t3.medium', 't3.large', 'c5.xlarge', 'c5.2xlarge'],
            description='Type of Instance for YugaByte DB cluster node',
            constraint_description='must be a valid EC2 instance type.',
        )
        latest_ami_id = CfnParameter(
            self,
            'LatestAmiId',
            type='AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
            default='/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
        )
        ssh_user = CfnParameter(
            self,
            'SshUser',
            type='String',
            default='ec2-user',
        )
        db_username = CfnParameter(
            self,
            'DBUsername',
            type='String',
            default='ybadmin',
            description='Custom username for the YugabyteDB superuser',
        )
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
        networking = NetworkingConstruct(self, 'Networking')
        security = SecurityConstruct(
            self,
            'Security',
            vpc=networking.vpc,
        )
        nodes = NodesConstruct(
            self,
            'Nodes',
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
            secret_arn=db_credential_secret.secret_arn,
        )
        load_balancer = LoadBalancerConstruct(
            self,
            'LoadBalancer',
            vpc=networking.vpc,
            nodes=nodes.nodes,
            tserver_security_group=security.tserver_security_group,
        )
        nlb_dns = load_balancer.nlb.load_balancer_dns_name
        CfnOutput(
            self,
            'VPC',
            description='YugabyteDB VPC',
            value=networking.vpc.vpc_id,
            export_name=f'{self.region}-{self.stack_name}-VPC',
        )
        CfnOutput(
            self,
            'MasterSecurityGroup',
            description='YugabyteDB master security group',
            value=security.master_security_group.security_group_id,
        )
        CfnOutput(
            self,
            'TServerSecurityGroup',
            description='YugabyteDB TServer Security Group',
            value=security.tserver_security_group.security_group_id,
        )
        CfnOutput(
            self,
            'NLBDNSName',
            description='Network Load Balancer DNS name',
            value=nlb_dns,
        )
        CfnOutput(
            self,
            'YugabyteDBCredentialsSecretArn',
            description='Secrets Manager ARN for YugabyteDB credentials (username and password)',
            value=db_credential_secret.secret_arn,
        )
        CfnOutput(
            self,
            'JDBC',
            description='JDBC Connect string for YugabyteDB (retrieve password from Secrets Manager)',
            value=Fn.join('', ['postgresql://', db_username.value_as_string, '@', nlb_dns, ':5433']),
        )
        CfnOutput(
            self,
            'YSQL',
            description='YSQL connect string for YugabyteDB (retrieve password from Secrets Manager)',
            value=Fn.join(' ', ['ysqlsh -U', db_username.value_as_string, '-h', nlb_dns, '-p 5433']),
        )
        CfnOutput(
            self,
            'YCQL',
            description='YCQL connect string for YugabyteDB',
            value=Fn.join(' ', ['ycqlsh', nlb_dns, '9042']),
        )
        CfnOutput(
            self,
            'YEDIS',
            description='YEDIS connect string for YugabyteDB',
            value=Fn.join(' ', ['redis-cli -h', nlb_dns, '-p 6379']),
        )
        ssm_prefix = '/yugabytedb'
        for logical_id, name, value, desc in [
            ('SSMVpcId', 'vpc-id', networking.vpc.vpc_id, 'YugabyteDB VPC ID'),
            ('SSMPrivateSubnetIds', 'private-subnet-ids',
             Fn.join(',', [s.subnet_id for s in networking.private_subnets]),
             'Comma-separated private subnet IDs for YugabyteDB VPC'),
            ('SSMTServerSecurityGroupId', 'tserver-security-group-id',
             security.tserver_security_group.security_group_id, 'YugabyteDB TServer security group ID'),
            ('SSMNlbDnsName', 'nlb-dns-name', nlb_dns, 'Network Load Balancer DNS name for YugabyteDB'),
            ('SSMSecretArn', 'credentials-secret-arn', db_credential_secret.secret_arn,
             'Secrets Manager ARN for YugabyteDB credentials'),
            ('SSMYsqlPort', 'ysql-port', '5433', 'YSQL port for YugabyteDB'),
        ]:
            param = ssm.StringParameter(
                self,
                logical_id,
                parameter_name=f'{ssm_prefix}/{name}',
                string_value=value,
                description=desc,
            )
            param.apply_removal_policy(RemovalPolicy.DESTROY)
