import { describe, expect, test } from "vitest";
import { createDatabase } from "./db/database.ts";
import { createTestApp } from "./testing/test-app.ts";

/** The pool connects lazily, so requests rejected before any query need no running database. */
const UNUSED_DATABASE_URL = "postgres://unused.invalid/unused";

const app = createTestApp(createDatabase(UNUSED_DATABASE_URL));

describe("unknown routes", () => {
  test("are members-only, answering 401 with the error envelope without a session", async () => {
    const response = await app.request("/api/does-not-exist");

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({
      error: { code: "unauthenticated", message: "Sign in to continue" },
    });
  });
});

describe("caching", () => {
  test("every API response forbids caching", async () => {
    const response = await app.request("/api/does-not-exist");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
