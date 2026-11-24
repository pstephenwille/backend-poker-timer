import { MAX_UPLOAD_BYTES } from "@pstephenwille/poker-timer-contracts";
import type { Clock } from "../clock.ts";
import {
  DOWNLOAD_URL_LIFETIME_SECONDS,
  type MediaStorage,
  UPLOAD_GRANT_LIFETIME_SECONDS,
  type UploadGrant,
  type UploadRequest,
} from "../media/media-storage.ts";

const UPLOAD_URL = "https://storage.test/media";
const DOWNLOAD_URL = "https://storage.test/download";
const MILLIS_PER_SECOND = 1000;

export interface StoredObject {
  contentType: string;
  size: number;
}

export interface SimulatedUpload {
  contentType: string;
  size: number;
}

/**
 * Mirrors the conditions S3 enforces on a presigned POST, so tests can show
 * that an oversized or mistyped upload never lands.
 */
export class InMemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, StoredObject>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  async presignUpload({
    key,
    contentType,
  }: UploadRequest): Promise<UploadGrant> {
    return {
      url: UPLOAD_URL,
      fields: { key, "Content-Type": contentType },
      expiresAt:
        this.clock.now().getTime() +
        UPLOAD_GRANT_LIFETIME_SECONDS * MILLIS_PER_SECOND,
    };
  }

  /** Simulates the browser posting a file with the grant; throws where S3 would refuse it. */
  upload(grant: UploadGrant, { contentType, size }: SimulatedUpload): void {
    if (this.clock.now().getTime() > grant.expiresAt) {
      throw new Error("Storage refused the upload: the grant has expired");
    }
    if (size < 1 || size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Storage refused the upload: ${size} bytes is out of range`,
      );
    }
    if (contentType !== grant.fields["Content-Type"]) {
      throw new Error(
        `Storage refused the upload: ${contentType} does not match the grant`,
      );
    }
    const key = grant.fields.key;
    if (!key) {
      throw new Error("Upload grant has no key");
    }
    this.objects.set(key, { contentType, size });
  }

  put(key: string, object: StoredObject): void {
    this.objects.set(key, object);
  }

  async presignDownload(key: string): Promise<string> {
    const expiresAt =
      this.clock.now().getTime() +
      DOWNLOAD_URL_LIFETIME_SECONDS * MILLIS_PER_SECOND;
    return `${DOWNLOAD_URL}/${key}?expires=${expiresAt}`;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
    }
  }
}
