import { z } from "zod";
import { HandCategory, WinRate } from "./tournament.ts";

export const LeaderboardEntry = z.strictObject({
  userId: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  rank: z.int().positive(),
  wins: z.int().nonnegative(),
  tournamentsPlayed: z.int().nonnegative(),
  winRate: WinRate,
  totalWinnings: z.int().nonnegative(),
  latestWinningHand: HandCategory.nullable(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const Leaderboard = z.array(LeaderboardEntry);
export type Leaderboard = z.infer<typeof Leaderboard>;
