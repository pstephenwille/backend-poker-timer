import {
  type HandCategory,
  Leaderboard,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { users } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_FIELDS = [
  "avatarUrl",
  "displayName",
  "lastWonAt",
  "latestWinningHand",
  "rank",
  "tournamentsPlayed",
  "totalWinnings",
  "userId",
  "winRate",
  "wins",
];

const database = useTestDatabase();
const app = createTestApp(database);

let headers: Record<string, string>;
let annId: string;
let bobId: string;
let calId: string;

beforeEach(async () => {
  const ann = await signInTestUser(database, "ann");
  headers = ann.headers;
  annId = ann.user.id;
  bobId = (await insertTestUser(database, "bob")).id;
  calId = (await insertTestUser(database, "cal")).id;
});

async function recordWin(
  winnerId: string,
  winningHand: HandCategory,
  daysAgo: number,
  pot = 100,
) {
  const playedOn = Date.now() - daysAgo * DAY_MS;
  const response = await app.request("/api/tournaments", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      playedOn,
      participantIds: [annId, bobId, calId],
      winnerId,
      winningHand,
      pot,
    }),
  });
  if (response.status !== 201) {
    throw new Error(
      `Recording a test tournament failed: ${await response.text()}`,
    );
  }
  return playedOn;
}

async function readLeaderboard(requestHeaders: Record<string, string> = {}) {
  const response = await app.request("/api/leaderboard", {
    headers: requestHeaders,
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    entries: Leaderboard.parse(JSON.parse(text)),
  };
}

function ranking(entries: Leaderboard) {
  return entries.map((entry) => `${entry.rank} ${entry.displayName}`);
}

describe("GET /api/leaderboard", () => {
  test("lists every member with zero stats before any tournament", async () => {
    const { status, entries } = await readLeaderboard();

    expect(status).toBe(200);
    expect(ranking(entries)).toEqual(["1 ann", "1 bob", "1 cal"]);
    expect(entries[0]).toMatchObject({
      wins: 0,
      tournamentsPlayed: 0,
      winRate: null,
      totalWinnings: 0,
      latestWinningHand: null,
      lastWonAt: null,
    });
  });

  test("a recorded tournament counts immediately", async () => {
    const playedOn = await recordWin(bobId, "flush", 1, 120);

    const { entries } = await readLeaderboard();

    expect(entries[0]).toMatchObject({
      userId: bobId,
      rank: 1,
      wins: 1,
      tournamentsPlayed: 1,
      winRate: 1,
      totalWinnings: 120,
      latestWinningHand: "flush",
      lastWonAt: playedOn,
    });
    expect(ranking(entries)).toEqual(["1 bob", "2 ann", "2 cal"]);
  });

  test("ranks by wins, then by the most recent winning hands", async () => {
    await recordWin(annId, "pair", 6);
    await recordWin(annId, "full_house", 5);
    await recordWin(bobId, "royal_flush", 4);
    await recordWin(bobId, "flush", 3);
    await recordWin(calId, "four_of_a_kind", 2);

    const { entries } = await readLeaderboard();

    expect(ranking(entries)).toEqual(["1 ann", "2 bob", "3 cal"]);
    expect(entries.map((entry) => entry.tournamentsPlayed)).toEqual([5, 5, 5]);
    expect(entries.map((entry) => entry.winRate)).toEqual([0.4, 0.4, 0.2]);
  });

  test("identical records go to the most recent winner, each with their own rank", async () => {
    await recordWin(annId, "flush", 6);
    await recordWin(bobId, "flush", 5);
    await recordWin(annId, "flush", 4);
    await recordWin(bobId, "flush", 3);

    const { entries } = await readLeaderboard();

    expect(ranking(entries)).toEqual(["1 bob", "2 ann", "3 cal"]);
  });

  test("each entry has exactly the specified fields and no email", async () => {
    await recordWin(annId, "straight", 1);

    const { text, entries } = await readLeaderboard();

    expect(text).not.toContain("@example.com");
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([...ENTRY_FIELDS].sort());
    }
  });

  test("a deactivated member keeps their place", async () => {
    await recordWin(bobId, "flush", 2);
    await database
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, bobId));

    const { entries } = await readLeaderboard();

    expect(entries[0]).toMatchObject({ userId: bobId, rank: 1, wins: 1 });
  });

  test("anonymous and signed-in readers get the same entries", async () => {
    await recordWin(calId, "two_pair", 1);

    const anonymous = await readLeaderboard();
    const signedIn = await readLeaderboard(headers);

    expect(anonymous.status).toBe(200);
    expect(signedIn.entries).toEqual(anonymous.entries);
  });

  test("members sharing a rank are listed by display name, ignoring case", async () => {
    await database
      .update(users)
      .set({ googleName: "Zed" })
      .where(eq(users.id, annId));
    await database
      .update(users)
      .set({ googleName: "amy" })
      .where(eq(users.id, bobId));

    const { entries } = await readLeaderboard();

    expect(entries.map((entry) => entry.displayName)).toEqual([
      "amy",
      "cal",
      "Zed",
    ]);
  });
});
