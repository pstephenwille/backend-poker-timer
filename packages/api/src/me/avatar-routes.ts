import {
  ConfirmUpload,
  RequestUpload,
  type UploadGrant,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "../db/database.ts";
import { users } from "../db/schema.ts";
import { ApiError } from "../http/api-error.ts";
import { validate } from "../http/validate.ts";
import type { MediaStorage } from "../media/media-storage.ts";
import type { MediaRow, MediaStore } from "../media/media-store.ts";
import type { SessionEnv } from "../sessions/require-session.ts";
import type { AvatarUrls } from "../users/avatar-urls.ts";
import { loadMe } from "./me-view.ts";

export interface AvatarRouteDependencies {
  database: Database;
  mediaStore: MediaStore;
  storage: MediaStorage;
  avatarUrls: AvatarUrls;
}

function requireOwnAvatarUpload(
  row: MediaRow | null,
  userId: string,
  mediaId: string,
): MediaRow {
  if (row?.kind !== "avatar" || row.ownerUserId !== userId) {
    throw new ApiError(
      400,
      "unknown_media",
      `No avatar upload ${mediaId} was granted to you`,
    );
  }
  return row;
}

/** Avatars are always the caller's own, so these routes need no further authorization. */
export function avatarRoutes({
  database,
  mediaStore,
  storage,
  avatarUrls,
}: AvatarRouteDependencies) {
  async function setAvatar(userId: string, mediaId: string | null) {
    const [current] = await database
      .select({ avatarMediaId: users.avatarMediaId })
      .from(users)
      .where(eq(users.id, userId));
    await database
      .update(users)
      .set({ avatarMediaId: mediaId })
      .where(eq(users.id, userId));
    const previous = current?.avatarMediaId;
    if (previous && previous !== mediaId) {
      await mediaStore.remove(previous);
    }
  }

  return new Hono<SessionEnv>()
    .post("/avatar/uploads", validate("json", RequestUpload), async (c) => {
      const { userId } = c.get("session");
      const row = await mediaStore.createPending(userId, "avatar");
      const { url, fields, expiresAt } = await storage.presignUpload({
        key: row.uploadKey,
        contentType: c.req.valid("json").contentType,
      });
      const grant: UploadGrant = { mediaId: row.id, url, fields, expiresAt };
      return c.json(grant, 201);
    })
    .post("/avatar", validate("json", ConfirmUpload), async (c) => {
      const session = c.get("session");
      const { mediaId } = c.req.valid("json");
      const row = requireOwnAvatarUpload(
        await mediaStore.find(mediaId),
        session.userId,
        mediaId,
      );
      if (!(await mediaStore.isUploaded(row))) {
        throw new ApiError(
          400,
          "upload_missing",
          "The avatar has not been uploaded yet",
        );
      }
      await setAvatar(session.userId, mediaId);
      return c.json(await loadMe(database, session, avatarUrls));
    })
    .delete("/avatar", async (c) => {
      await setAvatar(c.get("session").userId, null);
      return c.body(null, 204);
    });
}
