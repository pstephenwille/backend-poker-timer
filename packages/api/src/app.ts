import { Hono } from "hono";
import type { Clock } from "./clock.ts";
import type { Database } from "./db/database.ts";
import { csrfProtection } from "./http/csrf-protection.ts";
import { installErrorHandling } from "./http/error-handling.ts";
import { noStore } from "./http/no-store.ts";
import { leaderboardRoutes } from "./leaderboard/leaderboard-routes.ts";
import { meRoutes } from "./me/me-routes.ts";
import { requireSession, type SessionEnv } from "./sessions/require-session.ts";
import { createSessionStore } from "./sessions/session-store.ts";

export interface AppDependencies {
  database: Database;
  clock: Clock;
  appOrigin: string;
}

export function createApp({ database, clock, appOrigin }: AppDependencies) {
  const sessionStore = createSessionStore(database, clock);
  const api = new Hono<SessionEnv>()
    .use(noStore)
    .use(csrfProtection(appOrigin))
    .use(requireSession(sessionStore))
    .route("/leaderboard", leaderboardRoutes(database))
    .route("/me", meRoutes(database));
  return installErrorHandling(new Hono().route("/api", api));
}
