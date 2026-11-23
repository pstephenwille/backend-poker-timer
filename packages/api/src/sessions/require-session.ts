import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { ApiError } from "../http/api-error.ts";
import type { SessionPrincipal, SessionStore } from "./session-store.ts";

export const SESSION_COOKIE = "__Host-session";

/**
 * Routes are members-only unless listed here, so a route added without thought
 * fails closed instead of leaking data.
 */
const PUBLIC_ROUTES = [
  "GET /api/leaderboard",
  "GET /api/auth/login",
  "GET /api/auth/callback",
];

export interface SessionEnv {
  Variables: { session: SessionPrincipal };
}

function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.includes(`${method} ${path}`);
}

export function requireSession(
  sessionStore: SessionStore,
): MiddlewareHandler<SessionEnv> {
  return async (c, next) => {
    if (isPublicRoute(c.req.method, c.req.path)) {
      return next();
    }
    const sessionId = getCookie(c, SESSION_COOKIE);
    const session = sessionId ? await sessionStore.findActive(sessionId) : null;
    if (!session) {
      throw new ApiError(401, "unauthenticated", "Sign in to continue");
    }
    c.set("session", session);
    await next();
  };
}
