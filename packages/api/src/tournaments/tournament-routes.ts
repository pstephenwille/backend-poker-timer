import {
  CreateTournament,
  type Tournament,
  TournamentDetails,
  type TournamentPage,
  UpdateTournament,
} from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/api-error.ts";
import { toErrorDetails, validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import { requireEditor, requireTournament } from "./tournament-access.ts";
import {
  decodeCursor,
  encodeCursor,
  type PageCursor,
} from "./tournament-cursor.ts";
import type { TournamentStore } from "./tournament-store.ts";

const PAGE_SIZE = 20;

const TournamentIdParam = z.object({ id: z.uuid() });
const ListQuery = z.object({ cursor: z.string().optional() });

function parseCursor(encoded: string | undefined): PageCursor | null {
  if (encoded === undefined) {
    return null;
  }
  const cursor = decodeCursor(encoded);
  if (!cursor) {
    throw new ApiError(400, "invalid_cursor", "The page cursor is not valid");
  }
  return cursor;
}

function cursorAfter(tournament: Tournament): string {
  return encodeCursor({
    playedOn: tournament.playedOn,
    createdAt: tournament.createdAt,
    id: tournament.id,
  });
}

function detailsOf(tournament: Tournament): TournamentDetails {
  return {
    playedOn: tournament.playedOn,
    participantIds: tournament.participants.map(
      (participant) => participant.id,
    ),
    winnerId: tournament.winnerId,
    winningHand: tournament.winningHand,
    pot: tournament.pot,
    finalHandOpponentIds: tournament.finalHandOpponentIds,
    note: tournament.note,
  };
}

/** Edits are partial, so the cross-field rules are checked on the tournament as it will be stored. */
function mergeChanges(
  stored: Tournament,
  changes: UpdateTournament,
): TournamentDetails {
  const merged = TournamentDetails.safeParse({
    ...detailsOf(stored),
    ...changes,
  });
  if (!merged.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Request validation failed",
      toErrorDetails(merged.error.issues),
    );
  }
  return merged.data;
}

/**
 * Any member may record a tournament, played or not, and the recorder may leave its participants.
 * The participant checkboxes are the only record of who played, so requiring the recorder among
 * them verified nothing and only blocked a host who sat out.
 */
export function tournamentRoutes(store: TournamentStore) {
  async function requireMembers(participantIds: string[]) {
    const unknownIds = await store.findUnknownMembers(participantIds);
    if (unknownIds.length > 0) {
      throw new ApiError(
        400,
        "unknown_participants",
        "Every participant must be a group member",
        unknownIds.map((id) => ({
          path: "participantIds",
          message: `${id} is not a group member`,
        })),
      );
    }
  }

  async function findTournament(id: string): Promise<Tournament> {
    return requireTournament(await store.findById(id), id);
  }

  return new Hono<SessionEnv>()
    .post("/", validate("json", CreateTournament), async (c) => {
      const { userId } = c.get("session");
      const details = c.req.valid("json");
      await requireMembers(details.participantIds);
      const id = await store.insert(details, userId);
      return c.json(await findTournament(id), 201);
    })
    .get("/", validate("query", ListQuery), async (c) => {
      const cursor = parseCursor(c.req.valid("query").cursor);
      const { tournaments, hasMore } = await store.listPage(cursor, PAGE_SIZE);
      const lastOnPage = tournaments.at(-1);
      const page: TournamentPage = {
        items: tournaments,
        nextCursor: hasMore && lastOnPage ? cursorAfter(lastOnPage) : null,
      };
      return c.json(page);
    })
    .get("/:id", validate("param", TournamentIdParam), async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await findTournament(id));
    })
    .patch(
      "/:id",
      validate("param", TournamentIdParam),
      validate("json", UpdateTournament),
      async (c) => {
        const { id } = c.req.valid("param");
        const stored = await findTournament(id);
        requireEditor(stored, c.get("session"));
        const details = mergeChanges(stored, c.req.valid("json"));
        await requireMembers(details.participantIds);
        await store.update(id, details);
        return c.json(await findTournament(id));
      },
    )
    .delete("/:id", validate("param", TournamentIdParam), async (c) => {
      const { id } = c.req.valid("param");
      requireEditor(await findTournament(id), c.get("session"));
      await store.remove(id);
      return c.body(null, 204);
    });
}
