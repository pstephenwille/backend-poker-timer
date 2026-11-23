import { createHash, randomBytes } from "node:crypto";
import { eq, lt, or } from "drizzle-orm";
import type { Clock } from "../clock.ts";
import type { Database } from "../db/database.ts";
import { sessions } from "../db/schema.ts";

const SESSION_ID_BYTES = 32;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IDLE_TIMEOUT_MS = 30 * DAY_MS;
const ABSOLUTE_TIMEOUT_MS = 90 * DAY_MS;
export const SESSION_ABSOLUTE_LIFETIME_SECONDS = ABSOLUTE_TIMEOUT_MS / 1000;
/** Bounds writes to one per session per hour; idle expiry is measured in days, so the lag is harmless. */
const LAST_SEEN_REFRESH_INTERVAL_MS = HOUR_MS;

export interface SessionPrincipal {
  userId: string;
  isAdmin: boolean;
}

interface SessionTimestamps {
  createdAt: Date;
  lastSeenAt: Date;
}

/** Only the hash is stored, so a leaked sessions table cannot be replayed as live sessions. */
export function hashSessionId(sessionId: string): Buffer {
  return createHash("sha256").update(sessionId).digest();
}

function millisSince(earlier: Date, now: Date): number {
  return now.getTime() - earlier.getTime();
}

function isExpired(session: SessionTimestamps, now: Date): boolean {
  return (
    millisSince(session.lastSeenAt, now) > IDLE_TIMEOUT_MS ||
    millisSince(session.createdAt, now) > ABSOLUTE_TIMEOUT_MS
  );
}

export function createSessionStore(database: Database, clock: Clock) {
  async function create(userId: string, isAdmin: boolean): Promise<string> {
    const sessionId = randomBytes(SESSION_ID_BYTES).toString("base64url");
    const now = clock.now();
    await database.insert(sessions).values({
      idHash: hashSessionId(sessionId),
      userId,
      isAdmin,
      createdAt: now,
      lastSeenAt: now,
    });
    return sessionId;
  }

  async function findActive(
    sessionId: string,
  ): Promise<SessionPrincipal | null> {
    const idHash = hashSessionId(sessionId);
    const [session] = await database
      .select()
      .from(sessions)
      .where(eq(sessions.idHash, idHash));
    if (!session) {
      return null;
    }
    const now = clock.now();
    if (isExpired(session, now)) {
      await database.delete(sessions).where(eq(sessions.idHash, idHash));
      return null;
    }
    if (millisSince(session.lastSeenAt, now) >= LAST_SEEN_REFRESH_INTERVAL_MS) {
      await database
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.idHash, idHash));
    }
    return { userId: session.userId, isAdmin: session.isAdmin };
  }

  async function remove(sessionId: string): Promise<void> {
    await database
      .delete(sessions)
      .where(eq(sessions.idHash, hashSessionId(sessionId)));
  }

  async function removeAllForUser(userId: string): Promise<void> {
    await database.delete(sessions).where(eq(sessions.userId, userId));
  }

  async function removeExpired(): Promise<void> {
    const now = clock.now().getTime();
    await database
      .delete(sessions)
      .where(
        or(
          lt(sessions.lastSeenAt, new Date(now - IDLE_TIMEOUT_MS)),
          lt(sessions.createdAt, new Date(now - ABSOLUTE_TIMEOUT_MS)),
        ),
      );
  }

  return { create, findActive, remove, removeAllForUser, removeExpired };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
