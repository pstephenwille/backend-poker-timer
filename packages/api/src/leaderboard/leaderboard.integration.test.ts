import { Leaderboard } from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { createTestApp } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const database = useTestDatabase();
const app = createTestApp(database);

async function readLeaderboard() {
  const response = await app.request("/api/leaderboard");
  return { status: response.status, body: await response.json() };
}

describe("GET /api/leaderboard", () => {
  test("is readable without a session and empty before anyone signs in", async () => {
    const { status, body } = await readLeaderboard();

    expect(status).toBe(200);
    expect(Leaderboard.parse(body)).toEqual([]);
  });

  test("lists every member with display name, avatar, zero stats and no email", async () => {
    const ann = await insertTestUser(database, "ann", {
      googleName: "Ann Example",
      googleAvatarUrl: "https://lh3.googleusercontent.com/a/ann",
    });
    const bob = await insertTestUser(database, "bob", {
      username: "Bob.Bluff",
    });

    const { status, body } = await readLeaderboard();

    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("@example.com");
    expect(Leaderboard.parse(body)).toEqual([
      {
        userId: ann.id,
        displayName: "Ann Example",
        avatarUrl: "https://lh3.googleusercontent.com/a/ann",
        rank: 1,
        wins: 0,
        tournamentsPlayed: 0,
      },
      {
        userId: bob.id,
        displayName: "Bob.Bluff",
        avatarUrl: null,
        rank: 1,
        wins: 0,
        tournamentsPlayed: 0,
      },
    ]);
  });

  test("lists members sharing a rank by display name, ignoring case", async () => {
    await insertTestUser(database, "zed");
    await insertTestUser(database, "amy", { googleName: "amy" });
    await insertTestUser(database, "Bea", { googleName: "Bea" });

    const { body } = await readLeaderboard();

    expect(Leaderboard.parse(body).map((entry) => entry.displayName)).toEqual([
      "amy",
      "Bea",
      "zed",
    ]);
  });

  test("keeps deactivated members on the board", async () => {
    await insertTestUser(database, "cal", { deactivatedAt: new Date() });

    const { body } = await readLeaderboard();

    expect(Leaderboard.parse(body).map((entry) => entry.displayName)).toEqual([
      "cal",
    ]);
  });
});
