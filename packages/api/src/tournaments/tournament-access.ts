import type { Tournament } from "@pstephenwille/poker-timer-contracts";
import { ApiError } from "../http/api-error.ts";
import type { SessionPrincipal } from "../sessions/session-store.ts";

export function requireTournament(
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

export function requireEditor(
  tournament: Tournament,
  session: SessionPrincipal,
): void {
  if (!session.isAdmin && tournament.recordedById !== session.userId) {
    throw new ApiError(
      403,
      "not_recorder",
      "Only the member who recorded this tournament or an admin can change it",
    );
  }
}
