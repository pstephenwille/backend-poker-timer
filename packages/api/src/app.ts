import { Hono } from "hono";
import { installErrorHandling } from "./http/error-handling.ts";
import { noStore } from "./http/no-store.ts";

export const app = installErrorHandling(
  new Hono().basePath("/api").use(noStore),
);
