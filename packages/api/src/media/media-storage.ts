import type { ImageContentType } from "@pstephenwille/poker-timer-contracts";

export const UPLOAD_GRANT_LIFETIME_SECONDS = 15 * 60;
export const DOWNLOAD_URL_LIFETIME_SECONDS = 60 * 60;

export interface UploadRequest {
  key: string;
  contentType: ImageContentType;
}

/** A browser form POST straight to storage: every field must be sent with the file. */
export interface UploadGrant {
  url: string;
  fields: Record<string, string>;
  expiresAt: number;
}

/**
 * Object storage behind one seam, so routes can be tested with an in-memory store
 * that enforces the same upload constraints as S3.
 */
export interface MediaStorage {
  presignUpload(request: UploadRequest): Promise<UploadGrant>;
  presignDownload(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
  remove(keys: string[]): Promise<void>;
}
