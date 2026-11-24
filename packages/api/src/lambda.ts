import { handle } from "hono/aws-lambda";
import { Resource } from "sst";
import { createApp } from "./app.ts";
import { createCognitoIdentityProvider } from "./auth/cognito-identity-provider.ts";
import { systemClock } from "./clock.ts";
import { createDatabase } from "./db/database.ts";
import { createS3MediaStorage } from "./media/s3-media-storage.ts";

/** Created at module load so each Lambda container reuses one connection pool across requests. */
const database = createDatabase(Resource.DatabaseUrl.value);

const identityProvider = createCognitoIdentityProvider({
  issuer: Resource.Auth.issuer,
  hostedDomainUrl: Resource.Auth.hostedDomainUrl,
  clientId: Resource.Auth.clientId,
  clientSecret: Resource.Auth.clientSecret,
  callbackUrl: Resource.Auth.callbackUrl,
  signOutReturnUrl: Resource.Auth.signOutReturnUrl,
});

export const handler = handle(
  createApp({
    database,
    clock: systemClock,
    appOrigin: new URL(Resource.Router.url).origin,
    auth: {
      identityProvider,
      signinCookieKey: Resource.SigninCookieKey.value,
      adminGroup: Resource.Auth.adminGroup,
    },
    storage: createS3MediaStorage(Resource.Media.name, systemClock),
  }),
);
