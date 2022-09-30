#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();

const githubArn: string = '';

const github = {
    connectionArn: githubArn,
    repo: "aws-staticsite-cdk-example",
    owner: "runtooctober",
    rootDirectory: "website"
};

const env = {
    region: 'ap-southeast-2' /* Sydney */,
    account: '' /* Your AWS Account Number */
};

new WebsiteStack(app, "StaticWebsiteExampleDev", {
    env: env,
    branch: 'develop',
    certificateArn: '' /* Create in Certificate Manager in us-east-1 (Certificate only MUST be us-east-1 region) */,
    domainName: 'dev.runtooctober.com',
    github: github
});

new WebsiteStack(app, "StaticWebsiteExampleProd", {
    env: env,
    branch: 'main',
    certificateArn: '' /* Create in Certificate Manager in us-east-1 (Certificate only MUST be us-east-1 region) */,
    domainName: 'runtooctober.com',
    github: github
});
