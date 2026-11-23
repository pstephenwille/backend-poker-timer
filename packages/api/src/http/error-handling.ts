import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApiError } from "./api-error.ts";

function toApiError(err: Error): ApiError {
  if (err instanceof ApiError) {
    return err;
  }
  if (err instanceof HTTPException) {
    return new ApiError(err.status, "bad_request", err.message);
  }
  console.error("Unhandled error", err);
  return new ApiError(500, "internal_error", "Internal server error");
}

export function installErrorHandling<T extends Hono>(app: T): T {
  app.notFound((c) => {
    const notFound = new ApiError(
      404,
      "not_found",
      `No route for ${c.req.method} ${c.req.path}`,
    );
    return c.json(notFound.toEnvelope(), notFound.status);
  });
  app.onError((err, c) => {
    const apiError = toApiError(err);
    return c.json(apiError.toEnvelope(), apiError.status);
  });
  return app;
}
