import type { MiddlewareHandler } from "hono";
import { ApiError } from "./api-error.ts";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const JSON_MEDIA_TYPE = "application/json";

function isJsonContentType(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === JSON_MEDIA_TYPE;
}

/**
 * Browsers send `Origin` on every cross-site write and cannot send a JSON body
 * cross-site without a CORS preflight, which this API never grants, so these
 * two checks block cross-site writes without CSRF tokens.
 */
export function csrfProtection(appOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.includes(c.req.method)) {
      return next();
    }
    if (c.req.header("origin") !== appOrigin) {
      throw new ApiError(
        403,
        "forbidden_origin",
        "Requests that change data must come from the app's own origin",
      );
    }
    const hasBody = c.req.raw.body !== null;
    if (hasBody && !isJsonContentType(c.req.header("content-type"))) {
      throw new ApiError(
        415,
        "unsupported_media_type",
        `Request bodies must be ${JSON_MEDIA_TYPE}`,
      );
    }
    await next();
  };
}
