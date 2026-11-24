import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ImageContentType } from "@pstephenwille/poker-timer-contracts";
import { Resource } from "sst";
import { systemClock } from "../clock.ts";
import { createDatabase } from "../db/database.ts";
import {
  DISPLAY_CONTENT_TYPE,
  toDisplayWebp,
  UnreadableImageError,
} from "./display-image.ts";
import { displayKeyFor, mediaIdFromUploadKey } from "./media-keys.ts";
import { createMediaStore } from "./media-store.ts";
import { createS3MediaStorage } from "./s3-media-storage.ts";

interface S3UploadEvent {
  Records: { s3: { object: { key: string } } }[];
}

interface Original {
  bytes: Buffer;
  contentType: ImageContentType;
}

const bucket = Resource.Media.name;
const s3 = new S3Client({});
const storage = createS3MediaStorage(bucket, systemClock);
/** Created at module load so each Lambda container reuses one connection pool across events. */
const mediaStore = createMediaStore(
  createDatabase(Resource.DatabaseUrl.value),
  storage,
);

/** S3 event keys are URL-encoded with spaces as plus signs. */
function decodeEventKey(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, " "));
}

async function readOriginal(key: string): Promise<Original | null> {
  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = Buffer.from(
      (await object.Body?.transformToByteArray()) ?? [],
    );
    const contentType = ImageContentType.safeParse(object.ContentType);
    if (!contentType.success) {
      throw new UnreadableImageError(
        `Upload ${key} has unsupported content type ${object.ContentType}`,
      );
    }
    return { bytes, contentType: contentType.data };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return null;
    }
    throw error;
  }
}

async function writeDisplay(mediaId: string, image: Buffer): Promise<string> {
  const displayKey = displayKeyFor(mediaId);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: displayKey,
      Body: image,
      ContentType: DISPLAY_CONTENT_TYPE,
    }),
  );
  return displayKey;
}

/**
 * Unreadable files are removed rather than retried, since retrying cannot help;
 * storage and database errors propagate so Lambda retries the event.
 */
async function processUpload(key: string): Promise<void> {
  const mediaId = mediaIdFromUploadKey(key);
  if (!mediaId) {
    console.warn(JSON.stringify({ event: "upload_ignored", key }));
    return;
  }
  const row = await mediaStore.find(mediaId);
  if (!row) {
    await storage.remove([key]);
    console.warn(JSON.stringify({ event: "upload_without_media", key }));
    return;
  }
  try {
    const original = await readOriginal(key);
    if (!original) {
      console.warn(JSON.stringify({ event: "upload_already_processed", key }));
      return;
    }
    const display = await toDisplayWebp(
      original.bytes,
      original.contentType,
      row.kind,
    );
    await mediaStore.markReady(mediaId, await writeDisplay(mediaId, display));
    await storage.remove([key]);
  } catch (error) {
    if (!(error instanceof UnreadableImageError)) {
      throw error;
    }
    await mediaStore.remove(mediaId);
    console.error(
      JSON.stringify({
        event: "upload_unreadable",
        key,
        reason: error.message,
      }),
    );
  }
}

export async function handler(event: S3UploadEvent): Promise<void> {
  for (const record of event.Records) {
    await processUpload(decodeEventKey(record.s3.object.key));
  }
}
