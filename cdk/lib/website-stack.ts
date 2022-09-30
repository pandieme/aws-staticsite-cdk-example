import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { aws_cloudfront as cloudfront, aws_cloudfront_origins as origins } from "aws-cdk-lib";
import { Pipeline, Artifact } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeStarConnectionsSourceAction, S3DeployAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";

interface WebsiteStackProps extends StackProps {
    domainName: string;
    github: {
        connectionArn: string;
        owner: string;
        repo: string;
        rootDirectory: string;
    };
    branch: string;
    certificateArn: string;
}

export class WebsiteStack extends Stack {

    constructor(scope: Construct, id: string, props: WebsiteStackProps) {
        super(scope, id, props);

        const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, "cloudfront-OAI", {
            comment: `OAI for ${id}`
        });

        // Website source
        const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
            bucketName: props.domainName,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: "404.html"
        });

        const grantPublicAccess = websiteBucket.grantPublicAccess("*", "s3:GetObject");
        grantPublicAccess.resourceStatement!.addResources(websiteBucket.bucketArn);
        grantPublicAccess.resourceStatement!.addCondition("StringEquals", {
            "aws:Referer": cloudfrontOAI.originAccessIdentityId
        });

        websiteBucket.addToResourcePolicy(
            new iam.PolicyStatement({
                actions: ["s3:PutObject"],
                resources: [websiteBucket.arnForObjects("*")],
                principals: [new iam.ServicePrincipal("codedeploy.amazonaws.com")]
            })
        );

        const certificate = acm.Certificate.fromCertificateArn(this, "SiteCertificate", props.certificateArn);

        const distribution = new cloudfront.Distribution(this, "WebsiteDistribution", {
            certificate,
            defaultRootObject: "index.html",
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 404,
                    responsePagePath: "/404.html"
                }
            ],
            domainNames: [props.domainName],
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            defaultBehavior: {
                origin: new origins.S3Origin(websiteBucket, {
                    originAccessIdentity: cloudfrontOAI,
                    customHeaders: {
                        Referer: cloudfrontOAI.originAccessIdentityId
                    }
                }),
                compress: true,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
            }
        });
        new CfnOutput(this, "DistributionId", { value: distribution.distributionId });

        //Website pipeline
        const buildProject = new PipelineProject(this, "WebsiteBuildProject", {
            buildSpec: BuildSpec.fromObject({
                version: "0.2",
                // phases: {
                //     build: {
                //         commands: [`cd ${props.github.rootDirectory}`, "npm i", "npm run build"]
                //     }
                // },
                artifacts: {
                    name: "artifact",
                    files: ["**/*"],
                    // "base-directory": `${props.github.rootDirectory}/public`
                    "base-directory": `${props.github.rootDirectory}`
                }
            }),
            environment: { buildImage: LinuxBuildImage.STANDARD_5_0 }
        });

        const sourceOutput = new Artifact();
        const buildOutput = new Artifact();

        const sourceAction = new CodeStarConnectionsSourceAction({
            actionName: "Github_Source",
            connectionArn: props.github.connectionArn,
            output: sourceOutput,
            owner: props.github.owner,
            repo: props.github.repo,
            branch: props.branch
        });

        const buildAction = new CodeBuildAction({
            actionName: "Build_Static_Website",
            input: sourceOutput,
            project: buildProject,
            outputs: [buildOutput]
        });

        const deployAction = new S3DeployAction({
            actionName: "S3_Deploy",
            bucket: websiteBucket,
            input: buildOutput,
            runOrder: 1
        });

        // Create the build project that will invalidate the cache
        const invalidateBuildProject = new PipelineProject(this, `InvalidateProject`, {
            buildSpec: BuildSpec.fromObject({
                version: "0.2",
                phases: {
                    build: {
                        commands: [
                            `aws cloudfront create-invalidation --distribution-id ${distribution.distributionId} --paths "/*"`
                        ]
                    }
                }
            })
        });

        // Add Cloudfront invalidation permissions to the project
        const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`;
        invalidateBuildProject.addToRolePolicy(
            new iam.PolicyStatement({
                resources: [distributionArn],
                actions: ["cloudfront:CreateInvalidation"]
            })
        );

        const invalidateAction = new CodeBuildAction({
            actionName: "InvalidateCache",
            project: invalidateBuildProject,
            input: buildOutput,
            runOrder: 2
        });

        new Pipeline(this, "WebsitePipeline", {
            pipelineName: `${this.stackName}_Pipeline`,
            stages: [
                {
                    stageName: "Source",
                    actions: [sourceAction]
                },
                {
                    stageName: "Build",
                    actions: [buildAction]
                },
                {
                    stageName: "Deploy",
                    actions: [deployAction, invalidateAction]
                }
            ]
        });
    }
}
