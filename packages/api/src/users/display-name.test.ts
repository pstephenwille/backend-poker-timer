import { describe, expect, test } from "vitest";
import { resolveDisplayName } from "./display-name.ts";

describe("resolveDisplayName", () => {
  test("prefers the username", () => {
    expect(
      resolveDisplayName({
        username: "Mike.AllIn",
        googleName: "Mike Jones",
        email: "mike.j@example.com",
      }),
    ).toBe("Mike.AllIn");
  });

  test("falls back to the Google name when there is no username", () => {
    expect(
      resolveDisplayName({
        username: null,
        googleName: "Mike Jones",
        email: "mike.j@example.com",
      }),
    ).toBe("Mike Jones");
  });

  test("falls back to the email prefix when there is no username or Google name", () => {
    expect(
      resolveDisplayName({
        username: null,
        googleName: null,
        email: "mike.j@example.com",
      }),
    ).toBe("mike.j");
  });

  test("treats a blank Google name as missing", () => {
    expect(
      resolveDisplayName({
        username: null,
        googleName: "  ",
        email: "mike.j@example.com",
      }),
    ).toBe("mike.j");
  });

  test("shows an email prefix that breaks the username rules as is", () => {
    expect(
      resolveDisplayName({
        username: null,
        googleName: null,
        email: "mike_j@example.com",
      }),
    ).toBe("mike_j");
  });
});
