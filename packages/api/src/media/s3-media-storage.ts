import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_UPLOAD_BYTES } from "@pstephenwille/poker-timer-contracts";
import type { Clock } from "../clock.ts";
import {
  DOWNLOAD_URL_LIFETIME_SECONDS,
  type MediaStorage,
  UPLOAD_GRANT_LIFETIME_SECONDS,
  type UploadRequest,
} from "./media-storage.ts";

const MIN_UPLOAD_BYTES = 1;
const MILLIS_PER_SECOND = 1000;
const NOT_FOUND_STATUS = 404;

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    error.$metadata.httpStatusCode === NOT_FOUND_STATUS
  );
}

/**
 * Size and type are conditions of the signed policy, so S3 itself rejects an
 * oversized file or a different content type; the API never sees the bytes.
 */
export function createS3MediaStorage(
  bucket: string,
  clock: Clock,
): MediaStorage {
  const client = new S3Client({});

  async function presignUpload({ key, contentType }: UploadRequest) {
    const { url, fields } = await createPresignedPost(client, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ["content-length-range", MIN_UPLOAD_BYTES, MAX_UPLOAD_BYTES],
        ["eq", "$Content-Type", contentType],
      ],
      Fields: { "Content-Type": contentType },
      Expires: UPLOAD_GRANT_LIFETIME_SECONDS,
    });
    return {
      url,
      fields,
      expiresAt:
        clock.now().getTime() +
        UPLOAD_GRANT_LIFETIME_SECONDS * MILLIS_PER_SECOND,
    };
  }

  function presignDownload(key: string): Promise<string> {
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      {
        expiresIn: DOWNLOAD_URL_LIFETIME_SECONDS,
      },
    );
  }

  async function exists(key: string): Promise<boolean> {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async function remove(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })) },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(
        `Deleting media objects failed: ${result.Errors.map((error) => `${error.Key}: ${error.Code}`).join(", ")}`,
      );
    }
  }

  return { presignUpload, presignDownload, exists, remove };
}
