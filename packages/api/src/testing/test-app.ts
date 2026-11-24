import { createApp } from "../app.ts";
import type { IdentityProvider } from "../auth/identity-provider.ts";
import { type Clock, systemClock } from "../clock.ts";
import type { Database } from "../db/database.ts";
import type { MediaStorage } from "../media/media-storage.ts";
import { SESSION_COOKIE } from "../sessions/require-session.ts";
import { createSessionStore } from "../sessions/session-store.ts";
import { FakeIdentityProvider } from "./fake-identity-provider.ts";
import { InMemoryMediaStorage } from "./in-memory-media-storage.ts";
import { insertTestUser } from "./test-users.ts";

export const TEST_APP_ORIGIN = "https://poker-timer.test";
export const TEST_SIGNIN_COOKIE_KEY = Buffer.alloc(32, 1).toString("base64");
export const TEST_ADMIN_GROUP = "admin";

interface TestAppOptions {
  identityProvider?: IdentityProvider;
  clock?: Clock;
  storage?: MediaStorage;
}

export function createTestApp(
  database: Database,
  {
    identityProvider = new FakeIdentityProvider(),
    clock = systemClock,
    storage = new InMemoryMediaStorage(clock),
  }: TestAppOptions = {},
) {
  return createApp({
    database,
    clock,
    appOrigin: TEST_APP_ORIGIN,
    auth: {
      identityProvider,
      signinCookieKey: TEST_SIGNIN_COOKIE_KEY,
      adminGroup: TEST_ADMIN_GROUP,
    },
    storage,
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
