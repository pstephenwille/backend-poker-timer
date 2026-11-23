/// <reference path="./.sst/platform/config.d.ts" />

const AWS_REGION = "us-east-1";
/**
 * SST v3 bundles an AWS provider that rejects nodejs24.x, so Lambdas run on Node 22
 * until SST is upgraded; the code itself targets both.
 */
const LAMBDA_RUNTIME = "nodejs22.x";

export default $config({
  async app(input) {
    const { stageSettings } = await import("./infra/stage-settings.ts");
    const settings = stageSettings(input.stage);
    return {
      name: "poker-timer",
      home: "aws",
      removal: settings.removal,
      protect: settings.protect,
      providers: { aws: { region: AWS_REGION } },
    };
  },
  async run() {
    const { stageSettings } = await import("./infra/stage-settings.ts");
    const { spaFallbackUri } = await import("./infra/spa-fallback.ts");
    const settings = stageSettings($app.stage);

    const databaseUrl = new sst.Secret("DatabaseUrl");

    const api = new sst.aws.ApiGatewayV2("Api");
    api.route("$default", {
      handler: "packages/api/src/lambda.handler",
      architecture: "arm64",
      runtime: LAMBDA_RUNTIME,
      link: [databaseUrl],
    });

    const frontend = new sst.aws.Bucket("Frontend", { access: "cloudfront" });
    new aws.s3.BucketObjectv2("FrontendPlaceholder", {
      bucket: frontend.name,
      key: "index.html",
      source: $asset("infra/placeholder/index.html"),
      contentType: "text/html; charset=utf-8",
    });

    const router = new sst.aws.Router("Router", {
      ...(settings.domain ? { domain: settings.domain } : {}),
      edge: {
        viewerRequest: {
          injection: `event.request.uri = (${spaFallbackUri.toString()})(event.request.uri);`,
        },
      },
    });
    router.route("/api", api.url);
    router.routeBucket("/", frontend);

    return {
      url: router.url,
      frontendBucket: frontend.name,
      distributionId: router.distributionID,
    };
  },
});
