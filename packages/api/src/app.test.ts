import { describe, expect, test } from "vitest";
import { app } from "./app.ts";

describe("unknown routes", () => {
  test("respond with a JSON 404 error envelope", async () => {
    const response = await app.request("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "No route for GET /api/does-not-exist",
      },
    });
  });
});

describe("caching", () => {
  test("every API response forbids caching", async () => {
    const response = await app.request("/api/does-not-exist");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
