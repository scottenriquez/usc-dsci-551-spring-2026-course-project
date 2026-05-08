import os
import shutil
import subprocess
from typing import Any

import jsii
from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    BundlingOptions,
    DockerImage,
    ILocalBundling,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
)
from constructs import Construct

FRONTEND_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend'))


@jsii.implements(ILocalBundling)
class FrontendLocalBundling:
    """Runs `npm ci && npm run build` on the host when npm is available.

    CDK invokes `try_bundle()` first; returning False falls through to the
    Docker image declared in `BundlingOptions` so CI machines without Node
    installed still work.
    """

    def __init__(self, source_dir: str) -> None:
        self.source_dir = source_dir

    def try_bundle(self, output_dir: str, _options: Any) -> bool:
        try:
            subprocess.check_call(['npm', '--version'], cwd=self.source_dir)
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False
        try:
            subprocess.check_call(['npm', 'ci'], cwd=self.source_dir)
            subprocess.check_call(['npm', 'run', 'build'], cwd=self.source_dir)
        except subprocess.CalledProcessError:
            return False

        dist_dir = os.path.join(self.source_dir, 'dist')
        if not os.path.isdir(dist_dir):
            return False
        for item in os.listdir(dist_dir):
            src = os.path.join(dist_dir, item)
            dst = os.path.join(output_dir, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        return True


class CloudFrontAppStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = s3.Bucket(
            self, 'FrontendBucket',
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        oai = cloudfront.OriginAccessIdentity(self, 'OAI')
        bucket.grant_read(oai)

        distribution = cloudfront.Distribution(
            self, 'Distribution',
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(bucket, origin_access_identity=oai),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            default_root_object='index.html',
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path='/index.html',
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path='/index.html',
                ),
            ],
        )

        frontend_source = s3deploy.Source.asset(
            FRONTEND_SRC,
            exclude=['node_modules', 'dist', '.vite', 'coverage', '*.log'],
            bundling=BundlingOptions(
                image=DockerImage.from_registry('public.ecr.aws/docker/library/node:20'),
                command=[
                    'bash', '-c',
                    'npm ci && npm run build && cp -r dist/. /asset-output/',
                ],
                local=FrontendLocalBundling(FRONTEND_SRC),
            ),
        )

        s3deploy.BucketDeployment(
            self, 'DeployFrontend',
            sources=[frontend_source],
            destination_bucket=bucket,
            distribution=distribution,
            distribution_paths=['/*'],
        )

        CfnOutput(
            self, 'DistributionDomainName',
            value=distribution.distribution_domain_name,
            description='CloudFront distribution domain name',
        )

        CfnOutput(
            self, 'CloudFrontURL',
            value=f'https://{distribution.distribution_domain_name}',
            description='Frontend URL',
        )
