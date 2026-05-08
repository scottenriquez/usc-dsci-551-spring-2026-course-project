## Web Login

- [SSO URL](https://REDACTED.awsapps.com/start/)

## Configuring AWS CLI

- Install the [AWS CLI](https://aws.amazon.com/cli/)
- Run `aws configure sso`
    - SSO session name: `dsci-551`
    - SSO start URL: `https://REDACTED.awsapps.com/start/`
    - SSO region: `us-east-1`
    - SSO registration scopes: Leave blank and press enter
    - Sign in via the web browser
    - Select the `DSCI-551` account and use admin credentials
    - Default client Region: `us-west-2`
    - CLI default output format: Leave blank and press enter
    - Profile name: `default`
        - Note that changing the name to `default` here simplifies commands later
        - Please be sure to use this name specifically
- Test access by running `aws s3 ls`
    - If this does not error, then the credentials are configured correctly