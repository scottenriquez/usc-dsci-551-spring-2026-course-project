from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_ssm as ssm,
)
from aws_cdk.aws_lambda_python_alpha import PythonFunction
from constructs import Construct


class LambdasWithApiGatewayStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        nlb_dns_name = ssm.StringParameter.value_for_string_parameter(
            self, '/yugabytedb/nlb-dns-name'
        )
        ysql_port = ssm.StringParameter.value_for_string_parameter(
            self, '/yugabytedb/ysql-port'
        )
        credentials_secret_arn = ssm.StringParameter.value_for_string_parameter(
            self, '/yugabytedb/credentials-secret-arn'
        )
        lambda_env = {
            'DB_HOST': nlb_dns_name,
            'DB_PORT': ysql_port,
            'CREDENTIALS_SECRET_ARN': credentials_secret_arn,
        }
        secrets_policy = iam.PolicyStatement(
            actions=['secretsmanager:GetSecretValue'],
            resources=[credentials_secret_arn],
        )

        log_group_prefix = '/yugabytedb/YugabyteDBStack'

        cloudwatch_logs_function = PythonFunction(
            self, 'CloudWatchLogsFunction',
            entry='lambda/cloudwatch_logs',
            index='index.py',
            handler='handler',
            runtime=_lambda.Runtime.PYTHON_3_13,
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                'LOG_GROUP_PREFIX': log_group_prefix,
            },
        )
        cloudwatch_logs_function.add_to_role_policy(iam.PolicyStatement(
            actions=['logs:DescribeLogGroups'],
            resources=['*'],
        ))
        cloudwatch_logs_function.add_to_role_policy(iam.PolicyStatement(
            actions=[
                'logs:DescribeLogStreams',
                'logs:GetLogEvents',
            ],
            resources=[
                f'arn:aws:logs:{self.region}:{self.account}:log-group:{log_group_prefix}*:*',
            ],
        ))

        crud_function = PythonFunction(
            self, 'CrudFunction',
            entry='lambda/crud',
            index='index.py',
            handler='handler',
            runtime=_lambda.Runtime.PYTHON_3_13,
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=lambda_env,
        )
        crud_function.add_to_role_policy(secrets_policy)

        crud_integration = apigw.LambdaIntegration(crud_function)

        api = apigw.RestApi(
            self, 'YugabyteDbApi',
            rest_api_name='YugabyteDB API',
            description='CRUD API for YugabyteDB banking application',
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=['Content-Type'],
            ),
        )

        # /users
        users_resource = api.root.add_resource('users')
        users_resource.add_method('GET', crud_integration)
        users_resource.add_method('POST', crud_integration)

        user_by_id = users_resource.add_resource('{id}')
        user_by_id.add_method('GET', crud_integration)
        user_by_id.add_method('PUT', crud_integration)
        user_by_id.add_method('DELETE', crud_integration)

        # /accounts
        accounts_resource = api.root.add_resource('accounts')
        accounts_resource.add_method('GET', crud_integration)
        accounts_resource.add_method('POST', crud_integration)

        account_by_id = accounts_resource.add_resource('{id}')
        account_by_id.add_method('GET', crud_integration)
        account_by_id.add_method('PUT', crud_integration)
        account_by_id.add_method('DELETE', crud_integration)

        account_balance = account_by_id.add_resource('balance')
        account_balance.add_method('GET', crud_integration)

        # /transactions
        transactions_resource = api.root.add_resource('transactions')
        transactions_resource.add_method('GET', crud_integration)
        transactions_resource.add_method('POST', crud_integration)

        transaction_by_id = transactions_resource.add_resource('{id}')
        transaction_by_id.add_method('GET', crud_integration)
        transaction_by_id.add_method('DELETE', crud_integration)

        # /logs
        logs_integration = apigw.LambdaIntegration(cloudwatch_logs_function)
        logs_resource = api.root.add_resource('logs')

        logs_groups = logs_resource.add_resource('groups')
        logs_groups.add_method('GET', logs_integration)

        logs_streams = logs_resource.add_resource('streams')
        logs_streams.add_method('GET', logs_integration)

        logs_events = logs_resource.add_resource('events')
        logs_events.add_method('GET', logs_integration)

        # Strip trailing slash so frontend doesn't double up
        api_url_no_slash = api.url[:-1] if api.url.endswith('/') else api.url

        api_url_param = ssm.StringParameter(
            self,
            'SSMApiUrl',
            parameter_name='/yugabytedb/api-url',
            string_value=api_url_no_slash,
            description='API Gateway base URL for the YugabyteDB frontend',
        )
        api_url_param.apply_removal_policy(RemovalPolicy.DESTROY)

        CfnOutput(
            self, 'ApiUrl',
            value=api.url,
            description='Base URL for the API Gateway',
        )
