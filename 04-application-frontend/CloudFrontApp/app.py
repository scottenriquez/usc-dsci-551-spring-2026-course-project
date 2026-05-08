#!/usr/bin/env python3
import os

import aws_cdk as cdk

from cloudfront_app.cloudfront_app_stack import CloudFrontAppStack


app = cdk.App()
CloudFrontAppStack(
    app, 'CloudFrontAppStack',
    env=cdk.Environment(
        account=os.getenv('CDK_DEFAULT_ACCOUNT'),
        region=os.getenv('CDK_DEFAULT_REGION'),
    ),
)

app.synth()
