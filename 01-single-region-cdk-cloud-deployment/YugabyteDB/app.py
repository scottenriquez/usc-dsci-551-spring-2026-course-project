#!/usr/bin/env python3
import os

import aws_cdk as cdk

from yugabyte_db.yugabyte_db_stack import YugabyteDBStack

app = cdk.App()
YugabyteDBStack(
    app,
    'YugabyteDBStack',
    env=cdk.Environment(
        account=os.getenv('CDK_DEFAULT_ACCOUNT'),
        region=os.getenv('CDK_DEFAULT_REGION'),
    ),
)

app.synth()
