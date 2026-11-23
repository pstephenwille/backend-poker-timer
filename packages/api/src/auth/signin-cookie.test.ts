import { describe, expect, test } from "vitest";
import { TestClock } from "../testing/test-clock.ts";
import {
  createSigninCookieSealer,
  type PendingSigninCookie,
} from "./signin-cookie.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const MINUTE_MS = 60 * 1000;

const PENDING: PendingSigninCookie = {
  state: "state-1",
  nonce: "nonce-1",
  codeVerifier: "verifier-1",
  returnTo: "/tournaments",
};

function sealerAt(clock = new TestClock(), key = KEY) {
  return { clock, sealer: createSigninCookieSealer(key, clock) };
}

describe("sign-in cookie sealer", () => {
  test("opens what it sealed", () => {
    const { clock, sealer } = sealerAt();

    expect(sealer.open(sealer.seal(PENDING))).toEqual({
      ok: true,
      payload: { ...PENDING, issuedAt: clock.now().getTime() },
    });
  });

  test("hides the verifier and nonce from the browser", () => {
    const { sealer } = sealerAt();

    const sealed = sealer.seal(PENDING);

    expect(sealed).not.toContain("verifier-1");
    expect(Buffer.from(sealed, "base64url").toString("latin1")).not.toContain(
      "verifier-1",
    );
  });

  test("still opens at the end of the 10-minute lifetime", () => {
    const { clock, sealer } = sealerAt();
    const sealed = sealer.seal(PENDING);

    clock.advance(10 * MINUTE_MS);

    expect(sealer.open(sealed).ok).toBe(true);
  });

  test("reports expiry after 10 minutes even if the browser still sends it", () => {
    const { clock, sealer } = sealerAt();
    const sealed = sealer.seal(PENDING);

    clock.advance(10 * MINUTE_MS + 1);

    expect(sealer.open(sealed)).toEqual({ ok: false, reason: "expired" });
  });

  test("reports a missing cookie", () => {
    const { sealer } = sealerAt();

    expect(sealer.open(undefined)).toEqual({ ok: false, reason: "missing" });
  });

  test("rejects a tampered cookie", () => {
    const { sealer } = sealerAt();
    const bytes = Buffer.from(sealer.seal(PENDING), "base64url");
    bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;

    const opened = sealer.open(bytes.toString("base64url"));

    expect(opened.ok).toBe(false);
  });

  test("rejects a cookie sealed with another key", () => {
    const sealed = sealerAt(new TestClock(), OTHER_KEY).sealer.seal(PENDING);

    expect(sealerAt().sealer.open(sealed).ok).toBe(false);
  });

  test("refuses a key that is not 32 bytes", () => {
    expect(() =>
      createSigninCookieSealer(
        Buffer.alloc(16).toString("base64"),
        new TestClock(),
      ),
    ).toThrow(/32 random bytes, got 16/);
  });
});
