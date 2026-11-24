import {
  CreateTournament,
  type Tournament,
  type TournamentPage,
} from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
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

function requireTournament(
  tournament: Tournament | null,
  id: string,
): Tournament {
  if (!tournament) {
    throw new ApiError(
      404,
      "tournament_not_found",
      `No tournament with id ${id}`,
    );
  }
  return tournament;
}

export function tournamentRoutes(store: TournamentStore) {
  return new Hono<SessionEnv>()
    .post("/", validate("json", CreateTournament), async (c) => {
      const { userId } = c.get("session");
      const details = c.req.valid("json");
      if (!details.participantIds.includes(userId)) {
        throw new ApiError(
          403,
          "recorder_not_participant",
          "You can only record a tournament you played in",
        );
      }
      const unknownIds = await store.findUnknownMembers(details.participantIds);
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
      const id = await store.insert(details, userId);
      return c.json(requireTournament(await store.findById(id), id), 201);
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
      return c.json(requireTournament(await store.findById(id), id));
    });
}
