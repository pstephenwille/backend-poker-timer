import { Hono } from "hono";
import type { Database } from "./db/database.ts";
import { installErrorHandling } from "./http/error-handling.ts";
import { noStore } from "./http/no-store.ts";
import { leaderboardRoutes } from "./leaderboard/leaderboard-routes.ts";

export interface AppDependencies {
  database: Database;
}

export function createApp({ database }: AppDependencies) {
  const api = new Hono()
    .basePath("/api")
    .use(noStore)
    .route("/leaderboard", leaderboardRoutes(database));
  return installErrorHandling(api);
}
