import { randomUUID } from "node:crypto";
import type { Photo } from "@pstephenwille/poker-timer-contracts";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/database.ts";
import { media } from "../db/schema.ts";
import { uploadKeyFor } from "./media-keys.ts";
import type { MediaStorage } from "./media-storage.ts";

export type MediaRow = typeof media.$inferSelect;
export type MediaKind = MediaRow["kind"];

export function createMediaStore(database: Database, storage: MediaStorage) {
  async function createPending(
    ownerUserId: string,
    kind: MediaKind,
  ): Promise<MediaRow> {
    const id = randomUUID();
    const [row] = await database
      .insert(media)
      .values({ id, ownerUserId, kind, uploadKey: uploadKeyFor(id) })
      .returning();
    if (!row) {
      throw new Error("Inserting a media row returned no row");
    }
    return row;
  }

  async function find(id: string): Promise<MediaRow | null> {
    const [row] = await database.select().from(media).where(eq(media.id, id));
    return row ?? null;
  }

  async function findMany(ids: string[]): Promise<MediaRow[]> {
    if (ids.length === 0) {
      return [];
    }
    return database.select().from(media).where(inArray(media.id, ids));
  }

  /** The processor may already have replaced the original with its display variant. */
  async function isUploaded(row: MediaRow): Promise<boolean> {
    if (await storage.exists(row.uploadKey)) {
      return true;
    }
    return row.displayKey !== null && storage.exists(row.displayKey);
  }

  /** Objects go first, so a failure leaves a row pointing at nothing rather than orphaned images. */
  async function remove(id: string): Promise<void> {
    const row = await find(id);
    if (!row) {
      return;
    }
    const keys = [row.uploadKey, row.displayKey].filter(
      (key): key is string => key !== null,
    );
    await storage.remove(keys);
    await database.delete(media).where(eq(media.id, id));
  }

  async function markReady(id: string, displayKey: string): Promise<void> {
    await database
      .update(media)
      .set({ status: "ready", displayKey })
      .where(eq(media.id, id));
  }

  async function toPhoto(row: MediaRow): Promise<Photo> {
    if (row.status !== "ready" || row.displayKey === null) {
      return { status: "processing" };
    }
    return {
      status: "ready",
      url: await storage.presignDownload(row.displayKey),
    };
  }

  return {
    createPending,
    find,
    findMany,
    isUploaded,
    remove,
    markReady,
    toPhoto,
  };
}

export type MediaStore = ReturnType<typeof createMediaStore>;
