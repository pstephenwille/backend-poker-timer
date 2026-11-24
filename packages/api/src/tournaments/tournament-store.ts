import type {
  Tournament,
  TournamentDetails,
  TournamentParticipant,
} from "@pstephenwille/poker-timer-contracts";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { tournamentParticipants, tournaments, users } from "../db/schema.ts";
import { resolveDisplayName } from "../users/display-name.ts";
import { byDisplayName } from "../users/user-profile.ts";
import type { PageCursor } from "./tournament-cursor.ts";

type TournamentRow = typeof tournaments.$inferSelect;

interface ParticipantRow extends TournamentParticipant {
  tournamentId: string;
  isOpponent: boolean;
}

export interface TournamentPageResult {
  tournaments: Tournament[];
  hasMore: boolean;
}

function toTournament(
  row: TournamentRow,
  participants: ParticipantRow[],
): Tournament {
  const ordered = [...participants].sort(byDisplayName);
  return {
    id: row.id,
    playedOn: row.playedOn.getTime(),
    participants: ordered.map(({ id, displayName }) => ({ id, displayName })),
    winnerId: row.winnerId,
    opponentIds: ordered.filter((p) => p.isOpponent).map((p) => p.id),
    winningHand: row.winningHand,
    pot: row.pot,
    note: row.note,
    recordedById: row.recordedById,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function startsAfter(cursor: PageCursor): SQL {
  return sql`(${tournaments.playedOn}, ${tournaments.createdAt}, ${tournaments.id}) < (${new Date(cursor.playedOn).toISOString()}::timestamptz, ${new Date(cursor.createdAt).toISOString()}::timestamptz, ${cursor.id}::uuid)`;
}

export function createTournamentStore(database: Database) {
  async function loadParticipants(
    tournamentIds: string[],
  ): Promise<ParticipantRow[]> {
    if (tournamentIds.length === 0) {
      return [];
    }
    const rows = await database
      .select({
        tournamentId: tournamentParticipants.tournamentId,
        isOpponent: tournamentParticipants.isOpponent,
        id: users.id,
        username: users.username,
        googleName: users.googleName,
        email: users.email,
      })
      .from(tournamentParticipants)
      .innerJoin(users, eq(users.id, tournamentParticipants.userId))
      .where(inArray(tournamentParticipants.tournamentId, tournamentIds));
    return rows.map((row) => ({
      tournamentId: row.tournamentId,
      isOpponent: row.isOpponent,
      id: row.id,
      displayName: resolveDisplayName(row),
    }));
  }

  async function withParticipants(
    rows: TournamentRow[],
  ): Promise<Tournament[]> {
    const participants = await loadParticipants(rows.map((row) => row.id));
    return rows.map((row) =>
      toTournament(
        row,
        participants.filter((p) => p.tournamentId === row.id),
      ),
    );
  }

  async function findUnknownMembers(userIds: string[]): Promise<string[]> {
    const known = await database
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.groupId, HOME_GROUP_ID)));
    const knownIds = new Set(known.map((member) => member.id));
    return userIds.filter((id) => !knownIds.has(id));
  }

  async function insert(
    details: TournamentDetails,
    recordedById: string,
  ): Promise<string> {
    return database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(tournaments)
        .values({
          groupId: HOME_GROUP_ID,
          playedOn: new Date(details.playedOn),
          winnerId: details.winnerId,
          winningHand: details.winningHand,
          pot: details.pot,
          note: details.note,
          recordedById,
        })
        .returning({ id: tournaments.id });
      if (!row) {
        throw new Error("Inserting a tournament returned no row");
      }
      await transaction.insert(tournamentParticipants).values(
        details.participantIds.map((userId) => ({
          tournamentId: row.id,
          userId,
          isOpponent: details.opponentIds.includes(userId),
        })),
      );
      return row.id;
    });
  }

  async function findById(id: string): Promise<Tournament | null> {
    const rows = await database
      .select()
      .from(tournaments)
      .where(
        and(eq(tournaments.id, id), eq(tournaments.groupId, HOME_GROUP_ID)),
      );
    const [tournament] = await withParticipants(rows);
    return tournament ?? null;
  }

  /** Fetches one row beyond the page size to learn whether another page exists. */
  async function listPage(
    cursor: PageCursor | null,
    pageSize: number,
  ): Promise<TournamentPageResult> {
    const rows = await database
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.groupId, HOME_GROUP_ID),
          cursor ? startsAfter(cursor) : undefined,
        ),
      )
      .orderBy(
        desc(tournaments.playedOn),
        desc(tournaments.createdAt),
        desc(tournaments.id),
      )
      .limit(pageSize + 1);
    return {
      tournaments: await withParticipants(rows.slice(0, pageSize)),
      hasMore: rows.length > pageSize,
    };
  }

  return { findUnknownMembers, insert, findById, listPage };
}

export type TournamentStore = ReturnType<typeof createTournamentStore>;
