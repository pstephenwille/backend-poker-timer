/// <reference path="./.sst/platform/config.d.ts" />

const AWS_REGION = "us-east-1";
const LAMBDA_RUNTIME = "nodejs24.x";
const GOOGLE_PROVIDER_NAME = "Google";
const ADMIN_GROUP_NAME = "admin";
const OIDC_SCOPES = ["openid", "email", "profile"];
/** Abandoned originals may still carry GPS data, so they never outlive a day. */
const UPLOAD_RETENTION = "1 day";
const UPLOADS_PREFIX = "uploads/";
/** Decoding a 12-megapixel HEIC through WASM needs a full RGBA frame in memory. */
const PROCESSOR_MEMORY = "1536 MB";
const PROCESSOR_TIMEOUT = "60 seconds";

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
    const { authCallbackUrl, cognitoDomainPrefix, signOutReturnUrl } =
      await import("./infra/auth-settings.ts");
    const settings = stageSettings($app.stage);

    const databaseUrl = new sst.Secret("DatabaseUrl");
    const googleClientId = new sst.Secret("GoogleClientId");
    const googleClientSecret = new sst.Secret("GoogleClientSecret");
    const signinCookieKey = new sst.Secret("SigninCookieKey");

    const api = new sst.aws.ApiGatewayV2("Api");

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

    const callbackUrl = router.url.apply(authCallbackUrl);
    const signOutUrl = router.url.apply(signOutReturnUrl);
    const userPool = new aws.cognito.UserPool("UserPool", {
      adminCreateUserConfig: { allowAdminCreateUserOnly: true },
    });
    const google = new aws.cognito.IdentityProvider("Google", {
      userPoolId: userPool.id,
      providerName: GOOGLE_PROVIDER_NAME,
      providerType: GOOGLE_PROVIDER_NAME,
      providerDetails: {
        client_id: googleClientId.value,
        client_secret: googleClientSecret.value,
        authorize_scopes: OIDC_SCOPES.join(" "),
      },
      attributeMapping: {
        username: "sub",
        email: "email",
        name: "name",
        picture: "picture",
      },
    });
    new aws.cognito.UserGroup("AdminGroup", {
      userPoolId: userPool.id,
      name: ADMIN_GROUP_NAME,
    });
    const accountId = aws.getCallerIdentityOutput().accountId;
    const hostedDomain = new aws.cognito.UserPoolDomain("HostedDomain", {
      userPoolId: userPool.id,
      domain: accountId.apply((id) =>
        cognitoDomainPrefix($app.name, $app.stage, id),
      ),
    });
    const appClient = new aws.cognito.UserPoolClient("AppClient", {
      userPoolId: userPool.id,
      generateSecret: true,
      allowedOauthFlowsUserPoolClient: true,
      allowedOauthFlows: ["code"],
      allowedOauthScopes: OIDC_SCOPES,
      supportedIdentityProviders: [google.providerName],
      callbackUrls: [callbackUrl],
      logoutUrls: [signOutUrl],
      explicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH"],
      preventUserExistenceErrors: "ENABLED",
    });
    const auth = new sst.Linkable("Auth", {
      properties: {
        issuer: $interpolate`https://cognito-idp.${AWS_REGION}.amazonaws.com/${userPool.id}`,
        hostedDomainUrl: $interpolate`https://${hostedDomain.domain}.auth.${AWS_REGION}.amazoncognito.com`,
        clientId: appClient.id,
        clientSecret: appClient.clientSecret,
        adminGroup: ADMIN_GROUP_NAME,
        callbackUrl,
        signOutReturnUrl: signOutUrl,
      },
    });

    const media = new sst.aws.Bucket("Media", {
      cors: {
        allowOrigins: [router.url.apply((url) => new URL(url).origin)],
        allowMethods: ["POST"],
        allowHeaders: ["*"],
      },
      lifecycle: [
        {
          id: "expire-abandoned-uploads",
          prefix: UPLOADS_PREFIX,
          expiresIn: UPLOAD_RETENTION,
        },
      ],
    });

    /**
     * Defined on its own rather than inline in notify(): SST's generated names for an
     * inline function exceed AWS's 64-character limit and get truncated to "po-…",
     * which the deploy role's poker-timer-* permissions do not cover.
     */
    const imageProcessor = new sst.aws.Function("ImageProcessor", {
      handler: "packages/api/src/media/processor-lambda.handler",
      architecture: "arm64",
      runtime: LAMBDA_RUNTIME,
      memory: PROCESSOR_MEMORY,
      timeout: PROCESSOR_TIMEOUT,
      link: [databaseUrl, media],
      nodejs: { install: ["sharp", "libheif-js"] },
    });
    media.notify({
      notifications: [
        {
          name: "ProcessUploads",
          function: imageProcessor.arn,
          events: ["s3:ObjectCreated:*"],
          filterPrefix: UPLOADS_PREFIX,
        },
      ],
    });

    api.route("$default", {
      handler: "packages/api/src/lambda.handler",
      architecture: "arm64",
      runtime: LAMBDA_RUNTIME,
      link: [databaseUrl, router, auth, signinCookieKey, media],
    });

    return {
      url: router.url,
      frontendBucket: frontend.name,
      distributionId: router.distributionID,
      cognitoHostedDomain: auth.properties.hostedDomainUrl,
    };
  },
});
