import type {
  Photo,
  Tournament,
  TournamentDetails,
  TournamentParticipant,
} from "@pstephenwille/poker-timer-contracts";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/database.ts";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { tournamentParticipants, tournaments, users } from "../db/schema.ts";
import type { MediaStore } from "../media/media-store.ts";
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
  photo: Photo | null,
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
    photo,
    recordedById: row.recordedById,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function tournamentValues(details: TournamentDetails) {
  return {
    playedOn: new Date(details.playedOn),
    winnerId: details.winnerId,
    winningHand: details.winningHand,
    pot: details.pot,
    note: details.note,
  };
}

function participantRows(tournamentId: string, details: TournamentDetails) {
  return details.participantIds.map((userId) => ({
    tournamentId,
    userId,
    isOpponent: details.opponentIds.includes(userId),
  }));
}

function startsAfter(cursor: PageCursor): SQL {
  return sql`(${tournaments.playedOn}, ${tournaments.createdAt}, ${tournaments.id}) < (${new Date(cursor.playedOn).toISOString()}::timestamptz, ${new Date(cursor.createdAt).toISOString()}::timestamptz, ${cursor.id}::uuid)`;
}

export function createTournamentStore(
  database: Database,
  mediaStore: MediaStore,
) {
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

  async function loadPhotos(
    rows: TournamentRow[],
  ): Promise<Map<string, Photo>> {
    const mediaIds = rows
      .map((row) => row.photoMediaId)
      .filter((id): id is string => id !== null);
    const photos = new Map<string, Photo>();
    for (const mediaRow of await mediaStore.findMany(mediaIds)) {
      photos.set(mediaRow.id, await mediaStore.toPhoto(mediaRow));
    }
    return photos;
  }

  async function withParticipants(
    rows: TournamentRow[],
  ): Promise<Tournament[]> {
    const participants = await loadParticipants(rows.map((row) => row.id));
    const photos = await loadPhotos(rows);
    return rows.map((row) =>
      toTournament(
        row,
        participants.filter((p) => p.tournamentId === row.id),
        row.photoMediaId ? (photos.get(row.photoMediaId) ?? null) : null,
      ),
    );
  }

  async function photoMediaIdOf(id: string): Promise<string | null> {
    const [row] = await database
      .select({ photoMediaId: tournaments.photoMediaId })
      .from(tournaments)
      .where(eq(tournaments.id, id));
    return row?.photoMediaId ?? null;
  }

  async function setPhoto(id: string, mediaId: string | null): Promise<void> {
    const previous = await photoMediaIdOf(id);
    await database
      .update(tournaments)
      .set({ photoMediaId: mediaId, updatedAt: sql`now()` })
      .where(eq(tournaments.id, id));
    if (previous && previous !== mediaId) {
      await mediaStore.remove(previous);
    }
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
          ...tournamentValues(details),
          recordedById,
        })
        .returning({ id: tournaments.id });
      if (!row) {
        throw new Error("Inserting a tournament returned no row");
      }
      await transaction
        .insert(tournamentParticipants)
        .values(participantRows(row.id, details));
      return row.id;
    });
  }

  /** Replaces the participant rows wholesale, so removed players and changed opponent flags never linger. */
  async function update(id: string, details: TournamentDetails): Promise<void> {
    await database.transaction(async (transaction) => {
      await transaction
        .update(tournaments)
        .set({ ...tournamentValues(details), updatedAt: sql`now()` })
        .where(eq(tournaments.id, id));
      await transaction
        .delete(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, id));
      await transaction
        .insert(tournamentParticipants)
        .values(participantRows(id, details));
    });
  }

  /** Participant rows go with it through ON DELETE CASCADE; the photo's images and row are removed explicitly. */
  async function remove(id: string): Promise<void> {
    const photoMediaId = await photoMediaIdOf(id);
    await database.delete(tournaments).where(eq(tournaments.id, id));
    if (photoMediaId) {
      await mediaStore.remove(photoMediaId);
    }
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

  return {
    findUnknownMembers,
    insert,
    update,
    remove,
    setPhoto,
    findById,
    listPage,
  };
}

export type TournamentStore = ReturnType<typeof createTournamentStore>;
