# Static Website Hosting

In this textual TubeYou video, we're going to deploy a static website featuring the following:

- AWS:
  - S3
  - CloudFront
  - CodePipeline
  - Link to GitHub Repository

When you push to your defined branch, CodePipeline will kick in and deploy the new code.

This example is just deploying HTML assets, but I'd usually build and deploy GatsbyJS.

Then finally, you create a CNAME pointing to the CloudFront endpoint.
