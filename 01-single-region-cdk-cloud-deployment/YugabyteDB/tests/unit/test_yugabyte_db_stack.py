import aws_cdk as core
import aws_cdk.assertions as assertions

from yugabyte_db.yugabyte_db_stack import YugabyteDBStack


def _create_stack() -> YugabyteDBStack:
    app = core.App()
    return YugabyteDBStack(
        app,
        'yugabyte-db',
        env=core.Environment(account='123456789012', region='us-west-2'),
    )


def test_vpc_created():
    stack = _create_stack()
    template = assertions.Template.from_stack(stack)
    template.resource_count_is('AWS::EC2::VPC', 1)


def test_security_group_created():
    stack = _create_stack()
    template = assertions.Template.from_stack(stack)
    template.resource_count_is('AWS::EC2::SecurityGroup', 1)


def test_three_instances_created():
    stack = _create_stack()
    template = assertions.Template.from_stack(stack)
    template.resource_count_is('AWS::EC2::Instance', 3)
