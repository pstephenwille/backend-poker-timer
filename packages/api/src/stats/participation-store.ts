import { and, eq, type SQL } from "drizzle-orm";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { tournamentParticipants, tournaments, users } from "../db/schema.ts";
import { type ProfileRow, profileColumns } from "../users/user-profile.ts";
import type { Participation } from "./member-stats.ts";

export interface MemberParticipations {
  profile: ProfileRow;
  participations: Participation[];
}

/**
 * One query for every member and every tournament they played: left joins keep
 * members who have played nothing, so the leaderboard still lists them.
 */
async function loadParticipations(
  database: Database,
  memberFilter?: SQL,
): Promise<MemberParticipations[]> {
  const rows = await database
    .select({
      profile: profileColumns,
      tournament: {
        id: tournaments.id,
        winnerId: tournaments.winnerId,
        pot: tournaments.pot,
        winningHand: tournaments.winningHand,
        playedOn: tournaments.playedOn,
        createdAt: tournaments.createdAt,
      },
    })
    .from(users)
    .leftJoin(
      tournamentParticipants,
      eq(tournamentParticipants.userId, users.id),
    )
    .leftJoin(
      tournaments,
      eq(tournaments.id, tournamentParticipants.tournamentId),
    )
    .where(and(eq(users.groupId, HOME_GROUP_ID), memberFilter));

  const byMember = new Map<string, MemberParticipations>();
  for (const { profile, tournament } of rows) {
    const member = byMember.get(profile.id) ?? { profile, participations: [] };
    byMember.set(profile.id, member);
    if (tournament) {
      member.participations.push({
        tournamentId: tournament.id,
        won: tournament.winnerId === profile.id,
        pot: tournament.pot,
        winningHand: tournament.winningHand,
        playedOn: tournament.playedOn.getTime(),
        createdAt: tournament.createdAt.getTime(),
      });
    }
  }
  return [...byMember.values()];
}

export function loadAllMemberParticipations(
  database: Database,
): Promise<MemberParticipations[]> {
  return loadParticipations(database);
}

export async function loadMemberParticipations(
  database: Database,
  userId: string,
): Promise<MemberParticipations | null> {
  const [member] = await loadParticipations(database, eq(users.id, userId));
  return member ?? null;
}
