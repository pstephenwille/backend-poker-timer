import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE } from "./require-session.ts";
import { SESSION_ABSOLUTE_LIFETIME_SECONDS } from "./session-store.ts";

const SESSION_COOKIE_PATH = "/";

/**
 * Strict, host-only and script-unreadable. Max-Age matches the absolute session
 * lifetime so the cookie survives browser restarts but never outlives the session.
 */
export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: SESSION_COOKIE_PATH,
    maxAge: SESSION_ABSOLUTE_LIFETIME_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, {
    secure: true,
    path: SESSION_COOKIE_PATH,
  });
}
