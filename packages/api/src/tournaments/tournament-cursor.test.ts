import { describe, expect, test } from "vitest";
import { decodeCursor, encodeCursor } from "./tournament-cursor.ts";

const CURSOR = {
  playedOn: 1_781_380_800_000,
  createdAt: 1_781_406_600_123,
  id: "3c8e1f4a-5b6d-4a7e-9f0c-2b4d6e8f0a1c",
};

describe("tournament cursor", () => {
  test("round-trips through an opaque URL-safe string", () => {
    const encoded = encodeCursor(CURSOR);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(CURSOR);
  });

  test.each([
    ["not base64 JSON", "%%%"],
    [
      "JSON of the wrong shape",
      Buffer.from('{"page":2}').toString("base64url"),
    ],
    [
      "a fractional timestamp",
      Buffer.from(JSON.stringify({ ...CURSOR, playedOn: 1.5 })).toString(
        "base64url",
      ),
    ],
  ])("rejects %s", (_label, encoded) => {
    expect(decodeCursor(encoded)).toBeNull();
  });
});
