import type {
  Leaderboard,
  LeaderboardEntry,
} from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { summarizeParticipations, winsOf } from "../stats/member-stats.ts";
import {
  loadAllMemberParticipations,
  type MemberParticipations,
} from "../stats/participation-store.ts";
import { toPublicProfile } from "../users/user-profile.ts";
import { rankLeaderboard } from "./rank-leaderboard.ts";

function toEntry(member: MemberParticipations, rank: number): LeaderboardEntry {
  const { id, displayName, avatarUrl } = toPublicProfile(member.profile);
  const { wins, tournamentsPlayed, winRate, totalWinnings, latestWinningHand } =
    summarizeParticipations(member.participations);
  return {
    userId: id,
    displayName,
    avatarUrl,
    rank,
    wins,
    tournamentsPlayed,
    winRate,
    totalWinnings,
    latestWinningHand,
  };
}

/** Recomputed on every read: tens of members make one query and an in-memory sort trivially cheap. */
export function leaderboardRoutes(database: Database) {
  return new Hono().get("/", async (c) => {
    const members = await loadAllMemberParticipations(database);
    const memberById = new Map(
      members.map((member) => [member.profile.id, member]),
    );
    const ranked = rankLeaderboard(
      members.map((member) => ({
        userId: member.profile.id,
        displayName: toPublicProfile(member.profile).displayName,
        wins: winsOf(member.participations),
      })),
    );
    const leaderboard: Leaderboard = ranked.flatMap(({ userId, rank }) => {
      const member = memberById.get(userId);
      return member ? [toEntry(member, rank)] : [];
    });
    return c.json(leaderboard);
  });
}
