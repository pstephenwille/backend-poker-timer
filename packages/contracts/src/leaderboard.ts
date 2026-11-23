import { z } from "zod";

export const LeaderboardEntry = z.strictObject({
  userId: z.uuid(),
  rank: z.int().positive(),
  wins: z.int().nonnegative(),
  tournamentsPlayed: z.int().nonnegative(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const Leaderboard = z.array(LeaderboardEntry);
export type Leaderboard = z.infer<typeof Leaderboard>;
