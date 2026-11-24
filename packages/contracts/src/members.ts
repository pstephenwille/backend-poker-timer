import { z } from "zod";
import { HandBreakdown, WinRate } from "./tournament.ts";

export const MemberSummary = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  active: z.boolean(),
});
export type MemberSummary = z.infer<typeof MemberSummary>;

export const Members = z.array(MemberSummary);
export type Members = z.infer<typeof Members>;

export const MemberProfile = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  active: z.boolean(),
  tournamentsPlayed: z.int().nonnegative(),
  wins: z.int().nonnegative(),
  winRate: WinRate,
  totalWinnings: z.int().nonnegative(),
  handBreakdown: HandBreakdown,
});
export type MemberProfile = z.infer<typeof MemberProfile>;
