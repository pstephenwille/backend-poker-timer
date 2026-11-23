import { Leaderboard } from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { users } from "../db/schema.ts";
import { createTestApp } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";

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

  test("lists every member with zero stats and no email", async () => {
    const inserted = await database
      .insert(users)
      .values([
        {
          groupId: HOME_GROUP_ID,
          cognitoSub: "google_ann",
          email: "ann@example.com",
        },
        {
          groupId: HOME_GROUP_ID,
          cognitoSub: "google_bob",
          email: "bob@example.com",
        },
      ])
      .returning({ id: users.id });

    const { status, body } = await readLeaderboard();

    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("@example.com");
    expect(Leaderboard.parse(body)).toEqual(
      expect.arrayContaining(
        inserted.map(({ id }) => ({
          userId: id,
          rank: 1,
          wins: 0,
          tournamentsPlayed: 0,
        })),
      ),
    );
    expect(body).toHaveLength(2);
  });
});
