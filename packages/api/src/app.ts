import { Hono } from "hono";
import { authRoutes } from "./auth/auth-routes.ts";
import type { IdentityProvider } from "./auth/identity-provider.ts";
import { createSigninCallback } from "./auth/signin-callback.ts";
import { createSigninCookieSealer } from "./auth/signin-cookie.ts";
import type { Clock } from "./clock.ts";
import type { Database } from "./db/database.ts";
import { csrfProtection } from "./http/csrf-protection.ts";
import { installErrorHandling } from "./http/error-handling.ts";
import { noStore } from "./http/no-store.ts";
import { leaderboardRoutes } from "./leaderboard/leaderboard-routes.ts";
import { meRoutes } from "./me/me-routes.ts";
import { memberRoutes } from "./members/member-routes.ts";
import { requireSession, type SessionEnv } from "./sessions/require-session.ts";
import { createSessionStore } from "./sessions/session-store.ts";

export interface AuthSettings {
  identityProvider: IdentityProvider;
  signinCookieKey: string;
  adminGroup: string;
}

export interface AppDependencies {
  database: Database;
  clock: Clock;
  appOrigin: string;
  auth: AuthSettings;
}

export function createApp({
  database,
  clock,
  appOrigin,
  auth,
}: AppDependencies) {
  const { identityProvider, signinCookieKey, adminGroup } = auth;
  const sessionStore = createSessionStore(database, clock);
  const signinCookies = createSigninCookieSealer(signinCookieKey, clock);
  const completeSignin = createSigninCallback({
    database,
    identityProvider,
    signinCookies,
    sessionStore,
    adminGroup,
  });
  const api = new Hono<SessionEnv>()
    .use(noStore)
    .use(csrfProtection(appOrigin))
    .use(requireSession(sessionStore))
    .route(
      "/auth",
      authRoutes({
        identityProvider,
        signinCookies,
        sessionStore,
        completeSignin,
      }),
    )
    .route("/leaderboard", leaderboardRoutes(database))
    .route("/me", meRoutes(database))
    .route("/members", memberRoutes(database));
  return installErrorHandling(new Hono().route("/api", api));
}
