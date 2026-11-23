import type { SigninErrorCode } from "@pstephenwille/poker-timer-contracts";
import type { Database } from "../db/database.ts";
import type { SessionStore } from "../sessions/session-store.ts";
import { provisionUser } from "../users/provision-user.ts";
import {
  type IdentityClaims,
  type IdentityProvider,
  IdentityProviderError,
} from "./identity-provider.ts";
import type { SigninCookieSealer } from "./signin-cookie.ts";

export interface SigninFailure {
  ok: false;
  code: SigninErrorCode;
  reason: string;
}

interface VerifiedIdentity {
  ok: true;
  claims: IdentityClaims;
  returnTo: string;
}

export type SigninOutcome =
  | { ok: true; sessionId: string; returnTo: string }
  | SigninFailure;

export interface SigninCallbackDependencies {
  database: Database;
  identityProvider: IdentityProvider;
  signinCookies: SigninCookieSealer;
  sessionStore: SessionStore;
  adminGroup: string;
}

export function signinFailure(
  code: SigninErrorCode,
  reason: string,
): SigninFailure {
  return { ok: false, code, reason };
}

function providerFailure(error: IdentityProviderError): SigninFailure {
  const code = error.reason === "access_denied" ? "cancelled" : "failed";
  return signinFailure(code, error.message);
}

export function createSigninCallback({
  database,
  identityProvider,
  signinCookies,
  sessionStore,
  adminGroup,
}: SigninCallbackDependencies) {
  async function verifyIdentity(
    callbackParams: URLSearchParams,
    sealedCookie: string | undefined,
  ): Promise<VerifiedIdentity | SigninFailure> {
    const opened = signinCookies.open(sealedCookie);
    if (!opened.ok) {
      return signinFailure("expired", `Sign-in cookie ${opened.reason}`);
    }
    const { state, nonce, codeVerifier, returnTo } = opened.payload;
    try {
      const claims = await identityProvider.completeSignin(callbackParams, {
        state,
        nonce,
        codeVerifier,
      });
      return { ok: true, claims, returnTo };
    } catch (error) {
      if (error instanceof IdentityProviderError) {
        return providerFailure(error);
      }
      throw error;
    }
  }

  return async function completeSignin(
    callbackParams: URLSearchParams,
    sealedCookie: string | undefined,
  ): Promise<SigninOutcome> {
    const verified = await verifyIdentity(callbackParams, sealedCookie);
    if (!verified.ok) {
      return verified;
    }
    const { claims, returnTo } = verified;
    const user = await provisionUser(database, claims);
    if (user.deactivatedAt) {
      return signinFailure("deactivated", `User ${user.id} is deactivated`);
    }
    await sessionStore.removeExpired();
    const isAdmin = claims.groups.includes(adminGroup);
    const sessionId = await sessionStore.create(user.id, isAdmin);
    return { ok: true, sessionId, returnTo };
  };
}
