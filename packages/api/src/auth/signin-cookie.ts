import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Clock } from "../clock.ts";

export const SIGNIN_COOKIE = "__Secure-signin";
export const SIGNIN_COOKIE_PATH = "/api/auth";
export const SIGNIN_LIFETIME_SECONDS = 10 * 60;

const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MILLIS_PER_SECOND = 1000;
const SIGNIN_LIFETIME_MILLIS = SIGNIN_LIFETIME_SECONDS * MILLIS_PER_SECOND;

const SigninCookiePayload = z.strictObject({
  state: z.string(),
  nonce: z.string(),
  codeVerifier: z.string(),
  returnTo: z.string(),
  issuedAt: z.number(),
});
export type SigninCookiePayload = z.infer<typeof SigninCookiePayload>;
export type PendingSigninCookie = Omit<SigninCookiePayload, "issuedAt">;

export type OpenedSigninCookie =
  | { ok: true; payload: SigninCookiePayload }
  | { ok: false; reason: string };

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SigninCookieKey must be base64 of ${KEY_BYTES} random bytes, got ${key.length} bytes`,
    );
  }
  return key;
}

function decrypt(key: Buffer, sealed: string): unknown {
  const bytes = Buffer.from(sealed, "base64url");
  const iv = bytes.subarray(0, IV_BYTES);
  const authTag = bytes.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(CIPHER, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

/**
 * AES-GCM both hides the PKCE verifier and nonce from the browser and detects any
 * tampering. Expiry is checked against the sealed issue time, because the cookie's
 * Max-Age is only a request to the browser.
 */
export function createSigninCookieSealer(keyBase64: string, clock: Clock) {
  const key = decodeKey(keyBase64);

  function seal(pending: PendingSigninCookie): string {
    const payload: SigninCookiePayload = {
      ...pending,
      issuedAt: clock.now().getTime(),
    };
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64url",
    );
  }

  function open(sealed: string | undefined): OpenedSigninCookie {
    if (!sealed) {
      return { ok: false, reason: "missing" };
    }
    let decrypted: unknown;
    try {
      decrypted = decrypt(key, sealed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `unreadable (${detail})` };
    }
    const payload = SigninCookiePayload.safeParse(decrypted);
    if (!payload.success) {
      return { ok: false, reason: "unreadable (unexpected payload shape)" };
    }
    const ageMillis = clock.now().getTime() - payload.data.issuedAt;
    if (ageMillis < 0 || ageMillis > SIGNIN_LIFETIME_MILLIS) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, payload: payload.data };
  }

  return { seal, open };
}

export type SigninCookieSealer = ReturnType<typeof createSigninCookieSealer>;
