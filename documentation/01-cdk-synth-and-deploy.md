## One-Time Setup

- Ensure that [AWS CLI credentials have been configured](00-aws-access-credentials.md)
- Ensure that Node.js and Python are installed
- Install the [CDK CLI](https://www.npmjs.com/package/aws-cdk) using NPM
    - `npm i -g aws-cdk`
- Navigate to the numbered folder where the CDK application lives
    - `cd 01-single-region-cdk-cloud-deployment/YugabyteDB/`
- Create a Python virtual environment and install dependencies
    - `python3 -m venv '.venv'`
    - `. .venv/bin/activate`
    - `pip install -r requirements.txt`
    - `pip install -r requirements-dev.txt`
- Verify that all dependencies are installed correctly
    - `cdk synth`

## Deploying the Application

- From the CDK folder (i.e., where you ran `cdk synth`), simply run `cdk deploy`
- Type `y` and press enter
- Note that this will take several minutes

## Viewing the Outputs

- To view useful information such as the URL, navigate to CloudFormation
  in [the AWS Console](00-aws-access-credentials.md)
- Find the Stack named `YugabyteDB`
- Navigate to
  the [Outputs tab](https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/outputs?filteringText=&filteringStatus=active&viewNested=true&stackId=arn%3Aaws%3Acloudformation%3Aus-west-2%3A639418629871%3Astack%2FYugabyteDBStack%2F9be67a10-32d2-11f1-8e23-024171b637dd)
- Note that the deployment must first successfully complete before the outputs are shown

## Destroying the Application

- From the CDK folder (i.e., where you ran `cdk synth`), simply run `cdk destroy`