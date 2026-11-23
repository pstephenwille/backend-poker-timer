import { describe, expect, test } from "vitest";
import {
  authCallbackUrl,
  cognitoDomainPrefix,
  signOutReturnUrl,
} from "./auth-settings.ts";

const ACCOUNT_ID = "512808912517";
const CLOUDFRONT_URL = "https://d3qe36cyda6430.cloudfront.net";

describe("cognitoDomainPrefix", () => {
  test("combines app, stage and account so prefixes are unique per stage", () => {
    expect(cognitoDomainPrefix("poker-timer", "dev", ACCOUNT_ID)).toBe(
      "poker-timer-dev-512808912517",
    );
  });

  test("lowercases and replaces characters Cognito does not allow", () => {
    expect(cognitoDomainPrefix("poker-timer", "Ann_B", ACCOUNT_ID)).toBe(
      "poker-timer-ann-b-512808912517",
    );
  });

  test("rejects a stage name that makes the prefix too long", () => {
    expect(() =>
      cognitoDomainPrefix("poker-timer", "a".repeat(40), ACCOUNT_ID),
    ).toThrow(/exceeds 63 characters/);
  });

  test.each(["aws", "amazon", "cognito"])(
    "rejects a stage name containing the reserved word %s",
    (word) => {
      expect(() =>
        cognitoDomainPrefix("poker-timer", `my${word}`, ACCOUNT_ID),
      ).toThrow(new RegExp(`reserved word "${word}"`));
    },
  );
});

describe("auth URLs", () => {
  test("the callback is the API's callback route on the app host", () => {
    expect(authCallbackUrl(CLOUDFRONT_URL)).toBe(
      `${CLOUDFRONT_URL}/api/auth/callback`,
    );
  });

  test("signing out returns to the app root", () => {
    expect(signOutReturnUrl(CLOUDFRONT_URL)).toBe(`${CLOUDFRONT_URL}/`);
  });

  test("ignores a trailing slash on the app URL", () => {
    expect(authCallbackUrl(`${CLOUDFRONT_URL}/`)).toBe(
      `${CLOUDFRONT_URL}/api/auth/callback`,
    );
  });
});
