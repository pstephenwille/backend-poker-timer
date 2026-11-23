import { ErrorEnvelope } from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { csrfProtection } from "./csrf-protection.ts";
import { installErrorHandling } from "./error-handling.ts";

const APP_ORIGIN = "https://poker-timer.test";
const JSON_HEADERS = { "content-type": "application/json" };

const protectedApp = installErrorHandling(
  new Hono()
    .use(csrfProtection(APP_ORIGIN))
    .get("/things", (c) => c.json({ read: true }))
    .post("/things", (c) => c.json({ written: true })),
);

function post(headers: Record<string, string>, body?: string) {
  return protectedApp.request("/things", {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

async function errorCode(response: Response) {
  return ErrorEnvelope.parse(await response.json()).error.code;
}

describe("csrfProtection", () => {
  test("accepts a same-origin JSON POST", async () => {
    const response = await post({ origin: APP_ORIGIN, ...JSON_HEADERS }, "{}");

    expect(response.status).toBe(200);
  });

  test("accepts a same-origin POST without a body", async () => {
    const response = await post({ origin: APP_ORIGIN });

    expect(response.status).toBe(200);
  });

  test("accepts JSON with a charset parameter", async () => {
    const response = await post(
      { origin: APP_ORIGIN, "content-type": "Application/JSON; charset=utf-8" },
      "{}",
    );

    expect(response.status).toBe(200);
  });

  test("rejects a cross-site POST with 403", async () => {
    const response = await post(
      { origin: "https://other.example", ...JSON_HEADERS },
      "{}",
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("forbidden_origin");
  });

  test("rejects a POST without an Origin header with 403", async () => {
    const response = await post(JSON_HEADERS, "{}");

    expect(response.status).toBe(403);
  });

  test("rejects a form-encoded body with 415", async () => {
    const response = await post(
      {
        origin: APP_ORIGIN,
        "content-type": "application/x-www-form-urlencoded",
      },
      "name=ann",
    );

    expect(response.status).toBe(415);
    expect(await errorCode(response)).toBe("unsupported_media_type");
  });

  test("rejects a body without a content type with 415", async () => {
    const response = await post({ origin: APP_ORIGIN }, "{}");

    expect(response.status).toBe(415);
  });

  test("lets reads through without an Origin header", async () => {
    const response = await protectedApp.request("/things");

    expect(response.status).toBe(200);
  });
});
