import { describe, expect, test } from "vitest";
import { SigninErrorCode } from "./signin-error-code.ts";

describe("SigninErrorCode", () => {
  test.each(["cancelled", "expired", "deactivated", "failed"])(
    "accepts %s",
    (code) => {
      expect(SigninErrorCode.safeParse(code).success).toBe(true);
    },
  );

  test("rejects a value outside the enum so the frontend can ignore it", () => {
    expect(
      SigninErrorCode.safeParse("Your account is locked, call 555-0100")
        .success,
    ).toBe(false);
  });
});
