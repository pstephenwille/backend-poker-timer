import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { sessions } from "../db/schema.ts";
import { TestClock } from "../testing/test-clock.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";
import { createSessionStore, hashSessionId } from "./session-store.ts";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SESSION_ID_BITS = 256;

const database = useTestDatabase();
let clock: TestClock;
let store: ReturnType<typeof createSessionStore>;

beforeEach(() => {
  clock = new TestClock();
  store = createSessionStore(database, clock);
});

async function storedSession(sessionId: string) {
  const [row] = await database
    .select()
    .from(sessions)
    .where(eq(sessions.idHash, hashSessionId(sessionId)));
  return row;
}

describe("creating a session", () => {
  test("returns a 256-bit random identifier that resolves to the user", async () => {
    const user = await insertTestUser(database, "ann");

    const sessionId = await store.create(user.id, true);

    expect(Buffer.from(sessionId, "base64url").length * 8).toBe(
      SESSION_ID_BITS,
    );
    expect(await store.findActive(sessionId)).toEqual({
      userId: user.id,
      isAdmin: true,
    });
  });

  test("stores only the SHA-256 hash of the identifier", async () => {
    const user = await insertTestUser(database, "ann");

    const sessionId = await store.create(user.id, false);
    const [row] = await database.select().from(sessions);

    expect(row?.idHash.toString("base64url")).not.toBe(sessionId);
    expect(row?.idHash).toEqual(hashSessionId(sessionId));
  });

  test("issues a different identifier every time", async () => {
    const user = await insertTestUser(database, "ann");

    const first = await store.create(user.id, false);
    const second = await store.create(user.id, false);

    expect(first).not.toBe(second);
  });
});

describe("looking up a session", () => {
  test("returns nothing for an unknown identifier", async () => {
    expect(await store.findActive("not-a-session")).toBeNull();
  });

  test("stays active after 29 days without use", async () => {
    const user = await insertTestUser(database, "ann");
    const sessionId = await store.create(user.id, false);

    clock.advance(29 * DAY_MS);

    expect(await store.findActive(sessionId)).not.toBeNull();
  });

  test("expires and is deleted after more than 30 days without use", async () => {
    const user = await insertTestUser(database, "ann");
    const sessionId = await store.create(user.id, false);

    clock.advance(30 * DAY_MS + MINUTE_MS);

    expect(await store.findActive(sessionId)).toBeNull();
    expect(await storedSession(sessionId)).toBeUndefined();
  });

  test("expires 90 days after sign-in even when used daily", async () => {
    const user = await insertTestUser(database, "ann");
    const sessionId = await store.create(user.id, false);

    for (let day = 1; day <= 90; day++) {
      clock.advance(DAY_MS);
      expect(await store.findActive(sessionId)).not.toBeNull();
    }
    clock.advance(MINUTE_MS);

    expect(await store.findActive(sessionId)).toBeNull();
    expect(await storedSession(sessionId)).toBeUndefined();
  });

  test("records use at most once per hour", async () => {
    const user = await insertTestUser(database, "ann");
    const sessionId = await store.create(user.id, false);
    const createdAt = clock.now();

    clock.advance(59 * MINUTE_MS);
    await store.findActive(sessionId);
    expect((await storedSession(sessionId))?.lastSeenAt).toEqual(createdAt);

    clock.advance(MINUTE_MS);
    await store.findActive(sessionId);
    expect((await storedSession(sessionId))?.lastSeenAt).toEqual(clock.now());
  });
});

describe("deleting sessions", () => {
  test("deleting one session leaves the user's other sessions active", async () => {
    const user = await insertTestUser(database, "ann");
    const laptop = await store.create(user.id, false);
    const phone = await store.create(user.id, false);

    await store.remove(laptop);

    expect(await store.findActive(laptop)).toBeNull();
    expect(await store.findActive(phone)).not.toBeNull();
  });

  test("deleting all of a user's sessions leaves other users signed in", async () => {
    const ann = await insertTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob");
    const annLaptop = await store.create(ann.id, false);
    const annPhone = await store.create(ann.id, false);
    const bobLaptop = await store.create(bob.id, false);

    await store.removeAllForUser(ann.id);

    expect(await store.findActive(annLaptop)).toBeNull();
    expect(await store.findActive(annPhone)).toBeNull();
    expect(await store.findActive(bobLaptop)).not.toBeNull();
  });

  test("cleanup removes every user's expired sessions and keeps active ones", async () => {
    const ann = await insertTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob");
    const bobIdle = await store.create(bob.id, false);
    clock.advance(31 * DAY_MS);
    const annActive = await store.create(ann.id, false);

    await store.removeExpired();

    expect(await storedSession(bobIdle)).toBeUndefined();
    expect(await storedSession(annActive)).toBeDefined();
  });
});
