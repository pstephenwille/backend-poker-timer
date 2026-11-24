const UPLOADS_PREFIX = "uploads/";
const DISPLAY_PREFIX = "display/";
const DISPLAY_EXTENSION = ".webp";

/** Originals and display variants live under separate prefixes so only `uploads/` triggers processing and expires. */
export function uploadKeyFor(mediaId: string): string {
  return `${UPLOADS_PREFIX}${mediaId}`;
}

export function displayKeyFor(mediaId: string): string {
  return `${DISPLAY_PREFIX}${mediaId}${DISPLAY_EXTENSION}`;
}

export function mediaIdFromUploadKey(key: string): string | null {
  return key.startsWith(UPLOADS_PREFIX)
    ? key.slice(UPLOADS_PREFIX.length)
    : null;
}
