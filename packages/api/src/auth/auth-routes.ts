import { randomUUID } from "node:crypto";
import type { Logout } from "@pstephenwille/poker-timer-contracts";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../sessions/require-session.ts";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../sessions/session-cookie.ts";
import type { SessionStore } from "../sessions/session-store.ts";
import type { IdentityProvider } from "./identity-provider.ts";
import { sanitizeReturnTo } from "./return-to.ts";
import {
  type SigninFailure,
  type SigninOutcome,
  signinFailure,
} from "./signin-callback.ts";
import {
  SIGNIN_COOKIE,
  SIGNIN_COOKIE_PATH,
  SIGNIN_LIFETIME_SECONDS,
  type SigninCookieSealer,
} from "./signin-cookie.ts";

const APP_ROOT = "/";

export interface AuthRouteDependencies {
  identityProvider: IdentityProvider;
  signinCookies: SigninCookieSealer;
  sessionStore: SessionStore;
  completeSignin: (
    callbackParams: URLSearchParams,
    sealedCookie: string | undefined,
  ) => Promise<SigninOutcome>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Only the code and a reference travel in the URL; the reason stays in the log
 * under that reference, so no attacker-chosen text can appear in the app.
 */
function redirectAfterFailure(c: Context, failure: SigninFailure) {
  const ref = randomUUID();
  console.warn(
    JSON.stringify({
      event: "signin_failed",
      ref,
      code: failure.code,
      reason: failure.reason,
    }),
  );
  const query = new URLSearchParams({ signinError: failure.code, ref });
  return c.redirect(`${APP_ROOT}?${query}`, 303);
}

/**
 * The sign-in cookie must be SameSite=Lax: the callback is a top-level navigation
 * from Cognito's domain, which browsers treat as cross-site, so a Strict cookie
 * would never come back.
 */
export function authRoutes({
  identityProvider,
  signinCookies,
  sessionStore,
  completeSignin,
}: AuthRouteDependencies) {
  return new Hono()
    .get("/login", async (c) => {
      const { authorizationUrl, pending } =
        await identityProvider.startSignin();
      const returnTo = sanitizeReturnTo(c.req.query("returnTo"));
      setCookie(
        c,
        SIGNIN_COOKIE,
        signinCookies.seal({ ...pending, returnTo }),
        {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: SIGNIN_COOKIE_PATH,
          maxAge: SIGNIN_LIFETIME_SECONDS,
        },
      );
      return c.redirect(authorizationUrl.href, 302);
    })
    .get("/callback", async (c) => {
      const sealedCookie = getCookie(c, SIGNIN_COOKIE);
      deleteCookie(c, SIGNIN_COOKIE, {
        secure: true,
        path: SIGNIN_COOKIE_PATH,
      });
      const callbackParams = new URL(c.req.url).searchParams;
      let outcome: SigninOutcome;
      try {
        outcome = await completeSignin(callbackParams, sealedCookie);
      } catch (error) {
        console.error("Unexpected sign-in error", error);
        outcome = signinFailure("failed", describeError(error));
      }
      if (!outcome.ok) {
        return redirectAfterFailure(c, outcome);
      }
      setSessionCookie(c, outcome.sessionId);
      return c.redirect(outcome.returnTo, 303);
    })
    .post("/logout", async (c) => {
      const sessionId = getCookie(c, SESSION_COOKIE);
      if (sessionId) {
        await sessionStore.remove(sessionId);
      }
      clearSessionCookie(c);
      const logout: Logout = {
        signOutUrl: identityProvider.signOutUrl().href,
      };
      return c.json(logout);
    });
}
