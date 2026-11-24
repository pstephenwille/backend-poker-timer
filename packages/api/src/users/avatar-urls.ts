import type { MediaStore } from "../media/media-store.ts";
import type { ProfileRow } from "./user-profile.ts";

/**
 * An uploaded avatar is shown once it is processed; until then, or without one,
 * the Google avatar stands in, so no response ever points at an unprocessed original.
 */
export function createAvatarUrls(mediaStore: MediaStore) {
  async function forRows(
    rows: ProfileRow[],
  ): Promise<Map<string, string | null>> {
    const mediaIds = rows
      .map((row) => row.avatarMediaId)
      .filter((id): id is string => id !== null);
    const signedByMediaId = new Map<string, string>();
    for (const mediaRow of await mediaStore.findMany(mediaIds)) {
      const photo = await mediaStore.toPhoto(mediaRow);
      if (photo.status === "ready") {
        signedByMediaId.set(mediaRow.id, photo.url);
      }
    }
    return new Map(
      rows.map((row) => [
        row.id,
        (row.avatarMediaId && signedByMediaId.get(row.avatarMediaId)) ||
          row.googleAvatarUrl,
      ]),
    );
  }

  async function forRow(row: ProfileRow): Promise<string | null> {
    return (await forRows([row])).get(row.id) ?? null;
  }

  return { forRows, forRow };
}

export type AvatarUrls = ReturnType<typeof createAvatarUrls>;
