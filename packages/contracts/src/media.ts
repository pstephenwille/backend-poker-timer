import { z } from "zod";

export const ImageContentType = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);
export type ImageContentType = z.infer<typeof ImageContentType>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const RequestUpload = z.strictObject({
  contentType: ImageContentType,
});
export type RequestUpload = z.infer<typeof RequestUpload>;

/** Post `fields` and then the file as multipart form data to `url` before `expiresAt`. */
export const UploadGrant = z.strictObject({
  mediaId: z.uuid(),
  url: z.url(),
  fields: z.record(z.string(), z.string()),
  expiresAt: z.int().nonnegative(),
});
export type UploadGrant = z.infer<typeof UploadGrant>;

export const ConfirmUpload = z.strictObject({
  mediaId: z.uuid(),
});
export type ConfirmUpload = z.infer<typeof ConfirmUpload>;

/** No URL until processing has stripped metadata, so an original is never served. */
export const Photo = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("processing") }),
  z.strictObject({ status: z.literal("ready"), url: z.url() }),
]);
export type Photo = z.infer<typeof Photo>;
