import aws_cdk as core
import aws_cdk.assertions as assertions

from lambdas_with_api_gateway.lambdas_with_api_gateway_stack import LambdasWithApiGatewayStack

# example tests. To run these tests, uncomment this file along with the example
# resource in lambdas_with_api_gateway/lambdas_with_api_gateway_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = LambdasWithApiGatewayStack(app, "lambdas-with-api-gateway")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
