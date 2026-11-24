import {
  ConfirmUpload,
  RequestUpload,
  type UploadGrant,
} from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { MediaStorage } from "../media/media-storage.ts";
import type { MediaRow, MediaStore } from "../media/media-store.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import type { SessionPrincipal } from "../sessions/session-store.ts";
import { requireEditor, requireTournament } from "./tournament-access.ts";
import type { TournamentStore } from "./tournament-store.ts";

const TournamentIdParam = z.object({ id: z.uuid() });

export interface TournamentPhotoDependencies {
  tournamentStore: TournamentStore;
  mediaStore: MediaStore;
  storage: MediaStorage;
}

/** Only the member who requested the grant may attach that upload, so nobody can claim another's image. */
function requireOwnPhotoUpload(
  row: MediaRow | null,
  userId: string,
  mediaId: string,
): MediaRow {
  if (row?.kind !== "tournament_photo" || row.ownerUserId !== userId) {
    throw new ApiError(
      400,
      "unknown_media",
      `No tournament photo upload ${mediaId} was granted to you`,
    );
  }
  return row;
}

export function tournamentPhotoRoutes({
  tournamentStore,
  mediaStore,
  storage,
}: TournamentPhotoDependencies) {
  async function findEditableTournament(id: string, session: SessionPrincipal) {
    const tournament = requireTournament(
      await tournamentStore.findById(id),
      id,
    );
    requireEditor(tournament, session);
    return tournament;
  }

  return new Hono<SessionEnv>()
    .post(
      "/:id/photo/uploads",
      validate("param", TournamentIdParam),
      validate("json", RequestUpload),
      async (c) => {
        const session = c.get("session");
        await findEditableTournament(c.req.valid("param").id, session);
        const row = await mediaStore.createPending(
          session.userId,
          "tournament_photo",
        );
        const { url, fields, expiresAt } = await storage.presignUpload({
          key: row.uploadKey,
          contentType: c.req.valid("json").contentType,
        });
        const grant: UploadGrant = { mediaId: row.id, url, fields, expiresAt };
        return c.json(grant, 201);
      },
    )
    .post(
      "/:id/photo",
      validate("param", TournamentIdParam),
      validate("json", ConfirmUpload),
      async (c) => {
        const session = c.get("session");
        const { id } = c.req.valid("param");
        await findEditableTournament(id, session);
        const { mediaId } = c.req.valid("json");
        const row = requireOwnPhotoUpload(
          await mediaStore.find(mediaId),
          session.userId,
          mediaId,
        );
        if (!(await mediaStore.isUploaded(row))) {
          throw new ApiError(
            400,
            "upload_missing",
            "The photo has not been uploaded yet",
          );
        }
        await tournamentStore.setPhoto(id, mediaId);
        return c.json(
          requireTournament(await tournamentStore.findById(id), id),
        );
      },
    )
    .delete("/:id/photo", validate("param", TournamentIdParam), async (c) => {
      const { id } = c.req.valid("param");
      await findEditableTournament(id, c.get("session"));
      await tournamentStore.setPhoto(id, null);
      return c.body(null, 204);
    });
}
