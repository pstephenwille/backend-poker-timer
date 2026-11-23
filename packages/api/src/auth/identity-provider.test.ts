import { describe, expect, test } from "vitest";
import { toIdentityClaims } from "./identity-provider.ts";

describe("toIdentityClaims", () => {
  test("maps Cognito ID token claims including admin group membership", () => {
    expect(
      toIdentityClaims({
        sub: "cognito-sub-1",
        email: "ann@example.com",
        name: "Ann Example",
        picture: "https://lh3.googleusercontent.com/ann",
        "cognito:groups": ["admin", "us-east-1_pool_Google"],
        aud: "client-id",
      }),
    ).toEqual({
      subject: "cognito-sub-1",
      email: "ann@example.com",
      name: "Ann Example",
      picture: "https://lh3.googleusercontent.com/ann",
      groups: ["admin", "us-east-1_pool_Google"],
    });
  });

  test("treats missing name, picture and groups as absent", () => {
    expect(
      toIdentityClaims({ sub: "cognito-sub-1", email: "ann@example.com" }),
    ).toEqual({
      subject: "cognito-sub-1",
      email: "ann@example.com",
      name: null,
      picture: null,
      groups: [],
    });
  });

  test("rejects a token without an email", () => {
    expect(() => toIdentityClaims({ sub: "cognito-sub-1" })).toThrow(
      expect.objectContaining({ reason: "rejected" }),
    );
  });
});
