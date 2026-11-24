import { describe, expect, test } from "vitest";
import { UpdateMe, Username } from "./username.ts";

function accepts(username: string): boolean {
  return Username.safeParse(username).success;
}

describe("Username", () => {
  test.each(["mike.j", "Mike.AllIn", "mikej1", "a1b2c3", "a".repeat(30)])(
    "accepts %s",
    (username) => {
      expect(accepts(username)).toBe(true);
    },
  );

  test.each([
    ["shorter than 6 characters", "mikej"],
    ["longer than 30 characters", "a".repeat(31)],
    ["an underscore", "mike_jones"],
    ["a space", "mike jones"],
    ["a hyphen", "mike-jones"],
    ["a non-ASCII letter", "miké.jones"],
    ["a leading period", ".mikejones"],
    ["a trailing period", "mikejones."],
    ["consecutive periods", "mike..jones"],
  ])("rejects a username with %s", (_rule, username) => {
    expect(accepts(username)).toBe(false);
  });

  test("keeps the casing and periods exactly as entered", () => {
    expect(Username.parse("Mike.AllIn")).toBe("Mike.AllIn");
  });

  test("explains the allowed format when rejecting", () => {
    const result = Username.safeParse("mike_j");

    expect(result.error?.issues[0]?.message).toMatch(
      /6–30 letters, digits or periods/,
    );
  });
});

describe("UpdateMe", () => {
  test("accepts null to clear the username", () => {
    expect(UpdateMe.parse({ username: null })).toEqual({ username: null });
  });

  test("requires the username field", () => {
    expect(UpdateMe.safeParse({}).success).toBe(false);
  });

  test("rejects unknown fields", () => {
    expect(
      UpdateMe.safeParse({ username: "mike.j", email: "x@example.com" })
        .success,
    ).toBe(false);
  });
});
