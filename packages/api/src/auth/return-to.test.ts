import { describe, expect, test } from "vitest";
import { sanitizeReturnTo } from "./return-to.ts";

describe("sanitizeReturnTo", () => {
  test.each([
    ["/", "/"],
    ["/tournaments/42", "/tournaments/42"],
    ["/members?sort=wins#top", "/members?sort=wins#top"],
  ])("keeps the relative path %s", (returnTo, expected) => {
    expect(sanitizeReturnTo(returnTo)).toBe(expected);
  });

  test.each([
    ["missing", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example"],
    ["protocol-relative URL", "//evil.example/path"],
    ["backslash host", "/\\evil.example"],
    ["javascript URL", "javascript:alert(1)"],
    ["path without leading slash", "tournaments"],
  ])("falls back to the app root for a %s", (_label, returnTo) => {
    expect(sanitizeReturnTo(returnTo)).toBe("/");
  });
});
