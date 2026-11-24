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
import type { AvatarUrls } from "../users/avatar-urls.ts";
import { resolveDisplayName } from "../users/display-name.ts";
import { toPublicProfile } from "../users/user-profile.ts";
import { rankLeaderboard } from "./rank-leaderboard.ts";

function toEntry(
  member: MemberParticipations,
  rank: number,
  avatarUrl: string | null,
): LeaderboardEntry {
  const { id, displayName } = toPublicProfile(member.profile, avatarUrl);
  const {
    wins,
    tournamentsPlayed,
    winRate,
    totalWinnings,
    latestWinningHand,
    lastWonAt,
  } = summarizeParticipations(member.participations);
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
    lastWonAt,
  };
}

/** Recomputed on every read: tens of members make one query and an in-memory sort trivially cheap. */
export function leaderboardRoutes(database: Database, avatarUrls: AvatarUrls) {
  return new Hono().get("/", async (c) => {
    const members = await loadAllMemberParticipations(database);
    const memberById = new Map(
      members.map((member) => [member.profile.id, member]),
    );
    const ranked = rankLeaderboard(
      members.map((member) => ({
        userId: member.profile.id,
        displayName: resolveDisplayName(member.profile),
        wins: winsOf(member.participations),
      })),
    );
    const avatars = await avatarUrls.forRows(
      members.map((member) => member.profile),
    );
    const leaderboard: Leaderboard = ranked.flatMap(({ userId, rank }) => {
      const member = memberById.get(userId);
      return member ? [toEntry(member, rank, avatars.get(userId) ?? null)] : [];
    });
    return c.json(leaderboard);
  });
}
