import type { ImageContentType } from "@pstephenwille/poker-timer-contracts";
import libheif from "libheif-js/wasm-bundle.js";
import sharp, { type Sharp } from "sharp";
import type { MediaKind } from "./media-store.ts";

/** Avatars are only ever shown small, so a smaller variant keeps downloads light. */
export const MAX_DISPLAY_DIMENSION: Record<MediaKind, number> = {
  tournament_photo: 1600,
  avatar: 512,
};
export const DISPLAY_CONTENT_TYPE = "image/webp";
const DISPLAY_QUALITY = 80;
const RGBA_CHANNELS = 4;

/** Thrown when the bytes are not a decodable image, so retrying can never succeed. */
export class UnreadableImageError extends Error {}

function decodeHeicPixels(original: Buffer): Promise<{
  pixels: Buffer;
  width: number;
  height: number;
}> {
  const [image] = new libheif.HeifDecoder().decode(original);
  if (!image) {
    return Promise.reject(
      new UnreadableImageError("HEIC file contains no image"),
    );
  }
  const width = image.get_width();
  const height = image.get_height();
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  return new Promise((resolve, reject) => {
    image.display({ data, width, height }, (result) => {
      if (!result) {
        reject(new UnreadableImageError("HEIC image could not be decoded"));
        return;
      }
      resolve({ pixels: Buffer.from(result.data.buffer), width, height });
    });
  });
}

/**
 * sharp's prebuilt binaries cannot decode HEVC, so HEIC goes through libheif's
 * WASM build to raw pixels first.
 */
async function openImage(
  original: Buffer,
  contentType: ImageContentType,
): Promise<Sharp> {
  if (contentType !== "image/heic") {
    return sharp(original, { failOn: "error" });
  }
  const { pixels, width, height } = await decodeHeicPixels(original);
  return sharp(pixels, { raw: { width, height, channels: RGBA_CHANNELS } });
}

/**
 * Re-encoding from pixels drops every metadata block, GPS included; sharp keeps
 * none unless asked. Rotation is applied first so the output still looks upright
 * once its orientation tag is gone.
 */
export async function toDisplayWebp(
  original: Buffer,
  contentType: ImageContentType,
  kind: MediaKind,
): Promise<Buffer> {
  const maxDimension = MAX_DISPLAY_DIMENSION[kind];
  try {
    const image = await openImage(original, contentType);
    return await image
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: DISPLAY_QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof UnreadableImageError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new UnreadableImageError(`Image could not be processed: ${detail}`, {
      cause: error,
    });
  }
}
