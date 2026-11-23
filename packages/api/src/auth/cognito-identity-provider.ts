import * as oidc from "openid-client";
import {
  type IdentityProvider,
  IdentityProviderError,
  type PendingSignin,
  type SigninStart,
  toIdentityClaims,
} from "./identity-provider.ts";

const OIDC_SCOPES = "openid email profile";
const PKCE_METHOD = "S256";
const FEDERATED_PROVIDER = "Google";
const USER_CANCELLED_ERROR = "access_denied";

export interface CognitoSettings {
  issuer: string;
  hostedDomainUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  signOutReturnUrl: string;
}

/**
 * Endpoints are derived from the hosted domain rather than discovered, so a cold
 * start needs no extra round trip to Cognito before the first sign-in.
 */
function cognitoConfiguration(settings: CognitoSettings): oidc.Configuration {
  return new oidc.Configuration(
    {
      issuer: settings.issuer,
      authorization_endpoint: `${settings.hostedDomainUrl}/oauth2/authorize`,
      token_endpoint: `${settings.hostedDomainUrl}/oauth2/token`,
      jwks_uri: `${settings.issuer}/.well-known/jwks.json`,
    },
    settings.clientId,
    undefined,
    oidc.ClientSecretBasic(settings.clientSecret),
  );
}

function toProviderError(error: unknown): IdentityProviderError {
  if (
    error instanceof oidc.AuthorizationResponseError &&
    error.error === USER_CANCELLED_ERROR
  ) {
    return new IdentityProviderError(
      "access_denied",
      "The user cancelled sign-in at the identity provider",
      { cause: error },
    );
  }
  if (error instanceof IdentityProviderError) {
    return error;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new IdentityProviderError(
    "rejected",
    `Code exchange or ID token verification failed: ${detail}`,
    { cause: error },
  );
}

export function createCognitoIdentityProvider(
  settings: CognitoSettings,
): IdentityProvider {
  const configuration = cognitoConfiguration(settings);

  async function startSignin(): Promise<SigninStart> {
    const pending: PendingSignin = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
    };
    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: settings.callbackUrl,
      scope: OIDC_SCOPES,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(
        pending.codeVerifier,
      ),
      code_challenge_method: PKCE_METHOD,
      identity_provider: FEDERATED_PROVIDER,
    });
    return { authorizationUrl, pending };
  }

  async function completeSignin(
    callbackParams: URLSearchParams,
    pending: PendingSignin,
  ) {
    const callbackUrl = new URL(settings.callbackUrl);
    callbackUrl.search = callbackParams.toString();
    try {
      const tokens = await oidc.authorizationCodeGrant(
        configuration,
        callbackUrl,
        {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        },
      );
      return toIdentityClaims(tokens.claims());
    } catch (error) {
      throw toProviderError(error);
    }
  }

  function signOutUrl(): URL {
    const url = new URL(`${settings.hostedDomainUrl}/logout`);
    url.searchParams.set("client_id", settings.clientId);
    url.searchParams.set("logout_uri", settings.signOutReturnUrl);
    return url;
  }

  return { startSignin, completeSignin, signOutUrl };
}
