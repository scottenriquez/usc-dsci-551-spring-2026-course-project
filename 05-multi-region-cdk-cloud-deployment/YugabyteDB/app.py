#!/usr/bin/env python3
import os

import aws_cdk as cdk

from yugabyte_db import placement
from yugabyte_db.yugabyte_db_stack import YugabyteDBStack

app = cdk.App()
account = os.getenv('CDK_DEFAULT_ACCOUNT')
if not account:
    raise SystemExit(
        'CDK_DEFAULT_ACCOUNT is not set. Run `aws sts get-caller-identity` to '
        'confirm credentials, then `export CDK_DEFAULT_ACCOUNT=<id>`.'
    )
secondary = YugabyteDBStack(
    app,
    'YugabyteDBSecondaryStack',
    role='secondary',
    peer_account_id=account,
    env=cdk.Environment(account=account, region=placement.SECONDARY_REGION),
    cross_region_references=True,
)
primary = YugabyteDBStack(
    app,
    'YugabyteDBPrimaryStack',
    role='primary',
    peer_account_id=account,
    env=cdk.Environment(account=account, region=placement.PRIMARY_REGION),
    cross_region_references=True,
)
primary.add_dependency(secondary)
app.synth()
