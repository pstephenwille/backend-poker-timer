import type { Leaderboard } from "@pstephenwille/poker-timer-contracts";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";

/** With no tournaments recorded yet, every member has zero wins and so shares the only rank. */
const SHARED_RANK_WITHOUT_WINS = 1;

export function leaderboardRoutes(database: Database) {
  return new Hono().get("/", async (c) => {
    const members = await database
      .select({ userId: users.id })
      .from(users)
      .where(eq(users.groupId, HOME_GROUP_ID))
      .orderBy(asc(users.createdAt), asc(users.id));

    const leaderboard: Leaderboard = members.map(({ userId }) => ({
      userId,
      rank: SHARED_RANK_WITHOUT_WINS,
      wins: 0,
      tournamentsPlayed: 0,
    }));
    return c.json(leaderboard);
  });
}
