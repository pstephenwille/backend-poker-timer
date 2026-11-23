import { createApp } from "../app.ts";
import { systemClock } from "../clock.ts";
import type { Database } from "../db/database.ts";
import { SESSION_COOKIE } from "../sessions/require-session.ts";
import { createSessionStore } from "../sessions/session-store.ts";
import { insertTestUser } from "./test-users.ts";

export const TEST_APP_ORIGIN = "https://poker-timer.test";

export function createTestApp(database: Database) {
  return createApp({
    database,
    clock: systemClock,
    appOrigin: TEST_APP_ORIGIN,
  });
}

interface SignInOptions {
  isAdmin?: boolean;
}

/**
 * Signs in the way the design prescribes for tests: insert a session row and
 * send its cookie together with the app's own origin.
 */
export async function signInTestUser(
  database: Database,
  name: string,
  { isAdmin = false }: SignInOptions = {},
) {
  const user = await insertTestUser(database, name);
  const sessionId = await createSessionStore(database, systemClock).create(
    user.id,
    isAdmin,
  );
  const headers = {
    cookie: `${SESSION_COOKIE}=${sessionId}`,
    origin: TEST_APP_ORIGIN,
  };
  return { user, headers };
}
