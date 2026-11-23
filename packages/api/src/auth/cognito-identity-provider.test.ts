import { describe, expect, test } from "vitest";
import {
  type CognitoSettings,
  createCognitoIdentityProvider,
} from "./cognito-identity-provider.ts";

const SETTINGS: CognitoSettings = {
  issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool",
  hostedDomainUrl: "https://poker-timer-dev-1.auth.us-east-1.amazoncognito.com",
  clientId: "client-id",
  clientSecret: "client-secret",
  callbackUrl: "https://app.test/api/auth/callback",
  signOutReturnUrl: "https://app.test/",
};

const provider = createCognitoIdentityProvider(SETTINGS);

describe("Cognito identity provider", () => {
  test("sends the browser straight to Google through Cognito with PKCE", async () => {
    const { authorizationUrl, pending } = await provider.startSignin();
    const params = authorizationUrl.searchParams;

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      `${SETTINGS.hostedDomainUrl}/oauth2/authorize`,
    );
    expect(Object.fromEntries(params)).toMatchObject({
      client_id: SETTINGS.clientId,
      response_type: "code",
      redirect_uri: SETTINGS.callbackUrl,
      scope: "openid email profile",
      identity_provider: "Google",
      code_challenge_method: "S256",
      state: pending.state,
      nonce: pending.nonce,
    });
    expect(params.get("code_challenge")).not.toBe(pending.codeVerifier);
  });

  test("generates fresh state, nonce and verifier for every sign-in", async () => {
    const first = await provider.startSignin();
    const second = await provider.startSignin();

    expect(second.pending.state).not.toBe(first.pending.state);
    expect(second.pending.nonce).not.toBe(first.pending.nonce);
    expect(second.pending.codeVerifier).not.toBe(first.pending.codeVerifier);
  });

  test("reports a cancelled sign-in as access_denied", async () => {
    const { pending } = await provider.startSignin();
    const callbackParams = new URLSearchParams({
      error: "access_denied",
      state: pending.state,
    });

    await expect(
      provider.completeSignin(callbackParams, pending),
    ).rejects.toMatchObject({ reason: "access_denied" });
  });

  test("rejects a state mismatch before contacting Cognito", async () => {
    const { pending } = await provider.startSignin();
    const callbackParams = new URLSearchParams({
      code: "code",
      state: "forged-state",
    });

    await expect(
      provider.completeSignin(callbackParams, pending),
    ).rejects.toMatchObject({ reason: "rejected" });
  });

  test("signs out through Cognito's logout endpoint back to the app", () => {
    const url = provider.signOutUrl();

    expect(url.origin + url.pathname).toBe(
      `${SETTINGS.hostedDomainUrl}/logout`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: SETTINGS.clientId,
      logout_uri: SETTINGS.signOutReturnUrl,
    });
  });
});
