import { createHash, randomBytes } from "node:crypto";
import {
  type IdentityClaims,
  type IdentityProvider,
  IdentityProviderError,
  type PendingSignin,
  type SigninStart,
} from "../auth/identity-provider.ts";

const AUTHORIZE_URL = "https://identity-provider.test/authorize";
const SIGN_OUT_URL = "https://identity-provider.test/logout";
const RANDOM_VALUE_BYTES = 32;

export const FIXED_CLAIMS: IdentityClaims = {
  subject: "fake-sub-ann",
  email: "ann@example.com",
  name: "Ann Example",
  picture: "https://lh3.googleusercontent.test/ann.png",
  groups: [],
};

interface IssuedCode {
  claims: IdentityClaims;
  nonce: string;
  codeChallenge: string;
}

function randomValue(): string {
  return randomBytes(RANDOM_VALUE_BYTES).toString("base64url");
}

function pkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function requiredParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`Authorization URL ${url.href} has no ${name}`);
  }
  return value;
}

/**
 * Behaves like an OIDC provider without a network: codes are single use and
 * bound to the request's nonce and PKCE challenge, so tests exercise the same
 * failure paths as the real provider.
 */
export class FakeIdentityProvider implements IdentityProvider {
  private readonly issuedCodes = new Map<string, IssuedCode>();

  async startSignin(): Promise<SigninStart> {
    const pending: PendingSignin = {
      state: randomValue(),
      nonce: randomValue(),
      codeVerifier: randomValue(),
    };
    const authorizationUrl = new URL(AUTHORIZE_URL);
    authorizationUrl.searchParams.set("state", pending.state);
    authorizationUrl.searchParams.set("nonce", pending.nonce);
    authorizationUrl.searchParams.set(
      "code_challenge",
      pkceChallenge(pending.codeVerifier),
    );
    return { authorizationUrl, pending };
  }

  /** Simulates the user approving sign-in; returns the callback's query parameters. */
  approve(
    authorizationUrl: URL,
    claims: IdentityClaims = FIXED_CLAIMS,
  ): URLSearchParams {
    const code = randomValue();
    this.issuedCodes.set(code, {
      claims,
      nonce: requiredParam(authorizationUrl, "nonce"),
      codeChallenge: requiredParam(authorizationUrl, "code_challenge"),
    });
    return new URLSearchParams({
      code,
      state: requiredParam(authorizationUrl, "state"),
    });
  }

  /** Simulates the user cancelling at the provider. */
  deny(authorizationUrl: URL): URLSearchParams {
    return new URLSearchParams({
      error: "access_denied",
      state: requiredParam(authorizationUrl, "state"),
    });
  }

  async completeSignin(
    callbackParams: URLSearchParams,
    pending: PendingSignin,
  ): Promise<IdentityClaims> {
    const error = callbackParams.get("error");
    if (error === "access_denied") {
      throw new IdentityProviderError("access_denied", "User cancelled");
    }
    if (error) {
      throw new IdentityProviderError("rejected", `Provider error ${error}`);
    }
    if (callbackParams.get("state") !== pending.state) {
      throw new IdentityProviderError("rejected", "State mismatch");
    }
    const code = callbackParams.get("code") ?? "";
    const issued = this.issuedCodes.get(code);
    if (!issued) {
      throw new IdentityProviderError("rejected", "Unknown or used code");
    }
    this.issuedCodes.delete(code);
    if (issued.nonce !== pending.nonce) {
      throw new IdentityProviderError("rejected", "Nonce mismatch");
    }
    if (issued.codeChallenge !== pkceChallenge(pending.codeVerifier)) {
      throw new IdentityProviderError("rejected", "PKCE verifier mismatch");
    }
    return issued.claims;
  }

  signOutUrl(): URL {
    return new URL(SIGN_OUT_URL);
  }
}
