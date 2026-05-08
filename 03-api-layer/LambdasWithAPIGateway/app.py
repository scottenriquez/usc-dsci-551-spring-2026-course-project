#!/usr/bin/env python3
import os

import aws_cdk as cdk

from lambdas_with_api_gateway.lambdas_with_api_gateway_stack import LambdasWithApiGatewayStack


app = cdk.App()
LambdasWithApiGatewayStack(
    app, 'LambdasWithApiGatewayStack',
    env=cdk.Environment(
        account=os.getenv('CDK_DEFAULT_ACCOUNT'),
        region=os.getenv('CDK_DEFAULT_REGION'),
    ),
)

app.synth()
