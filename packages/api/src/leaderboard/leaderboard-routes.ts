import type { Leaderboard } from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";
import {
  byDisplayName,
  profileColumns,
  toPublicProfile,
} from "../users/user-profile.ts";

/** With no tournaments recorded yet, every member has zero wins and so shares the only rank. */
const SHARED_RANK_WITHOUT_WINS = 1;

export function leaderboardRoutes(database: Database) {
  return new Hono().get("/", async (c) => {
    const rows = await database
      .select(profileColumns)
      .from(users)
      .where(eq(users.groupId, HOME_GROUP_ID));

    const leaderboard: Leaderboard = rows
      .map(toPublicProfile)
      .sort(byDisplayName)
      .map(({ id, displayName, avatarUrl }) => ({
        userId: id,
        displayName,
        avatarUrl,
        rank: SHARED_RANK_WITHOUT_WINS,
        wins: 0,
        tournamentsPlayed: 0,
      }));
    return c.json(leaderboard);
  });
}
