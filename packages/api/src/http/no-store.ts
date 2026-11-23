import type { MiddlewareHandler } from "hono";

/**
 * CloudFront honors origin Cache-Control and leaves cookies out of its cache key,
 * so every API response must forbid caching or one user's data could reach another.
 */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};
