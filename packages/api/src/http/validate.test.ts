import { ErrorEnvelope } from "@pstephenwille/poker-timer-contracts";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { installErrorHandling } from "./error-handling.ts";
import { validate } from "./validate.ts";

const EchoBody = z.object({
  name: z.string().min(1),
  seats: z.int().positive(),
});

const echoApp = installErrorHandling(
  new Hono().post("/echo", validate("json", EchoBody), (c) =>
    c.json(c.req.valid("json")),
  ),
);

function postJson(body: string) {
  return echoApp.request("/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("validate", () => {
  test("passes a valid body through to the handler", async () => {
    const response = await postJson(JSON.stringify({ name: "Ann", seats: 9 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Ann", seats: 9 });
  });

  test("responds 400 naming every failing field", async () => {
    const response = await postJson(JSON.stringify({ name: "", seats: 1.5 }));
    const { error } = ErrorEnvelope.parse(await response.json());

    expect(response.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.details?.map((detail) => detail.path)).toEqual([
      "name",
      "seats",
    ]);
    expect(error.details?.every((detail) => detail.message.length > 0)).toBe(
      true,
    );
  });

  test("responds 400 with the error envelope for malformed JSON", async () => {
    const response = await postJson("{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "bad_request", message: expect.any(String) },
    });
  });
});
