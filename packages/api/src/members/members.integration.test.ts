import {
  ErrorEnvelope,
  MemberProfile,
  Members,
} from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const database = useTestDatabase();
const app = createTestApp(database);

describe("GET /api/members", () => {
  test("lists every member, including deactivated ones, by display name", async () => {
    const { user: ann, headers } = await signInTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob", {
      googleName: "Bob Jones",
      googleAvatarUrl: "https://lh3.googleusercontent.com/a/bob",
    });
    const cal = await insertTestUser(database, "cal", {
      deactivatedAt: new Date(),
    });

    const response = await app.request("/api/members", { headers });

    expect(response.status).toBe(200);
    expect(Members.parse(await response.json())).toEqual([
      { id: ann.id, displayName: "ann", avatarUrl: null, active: true },
      {
        id: bob.id,
        displayName: "Bob Jones",
        avatarUrl: "https://lh3.googleusercontent.com/a/bob",
        active: true,
      },
      { id: cal.id, displayName: "cal", avatarUrl: null, active: false },
    ]);
  });

  test("includes no email address, not even the reader's own", async () => {
    const { headers } = await signInTestUser(database, "ann");
    await insertTestUser(database, "bob");

    const response = await app.request("/api/members", { headers });

    expect(await response.text()).not.toContain("@example.com");
  });
});

describe("GET /api/members/{id}", () => {
  test("returns another member's profile without their email", async () => {
    const { headers } = await signInTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob", {
      username: "Bob.Bluff",
    });

    const response = await app.request(`/api/members/${bob.id}`, { headers });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("@example.com");
    expect(MemberProfile.parse(JSON.parse(text))).toEqual({
      id: bob.id,
      displayName: "Bob.Bluff",
      username: "Bob.Bluff",
      avatarUrl: null,
      active: true,
      tournamentsPlayed: 0,
      wins: 0,
      winRate: null,
      totalWinnings: 0,
      handBreakdown: [],
    });
  });

  test("shows stats from recorded tournaments", async () => {
    const { user: ann, headers } = await signInTestUser(database, "ann");
    const bob = await insertTestUser(database, "bob");
    const results: { winnerId: string; winningHand: string; pot: number }[] = [
      { winnerId: ann.id, winningHand: "flush", pot: 120 },
      { winnerId: bob.id, winningHand: "pair", pot: 40 },
      { winnerId: bob.id, winningHand: "straight", pot: 60 },
      { winnerId: bob.id, winningHand: "pair", pot: 80 },
    ];
    for (const [daysAgo, result] of results.entries()) {
      const recorded = await app.request("/api/tournaments", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          playedOn: Date.now() - (daysAgo + 1) * DAY_MS,
          participantIds: [ann.id, bob.id],
          ...result,
        }),
      });
      expect(recorded.status).toBe(201);
    }

    const annProfile = MemberProfile.parse(
      await (await app.request(`/api/members/${ann.id}`, { headers })).json(),
    );
    const bobProfile = MemberProfile.parse(
      await (await app.request(`/api/members/${bob.id}`, { headers })).json(),
    );

    expect(annProfile).toMatchObject({
      tournamentsPlayed: 4,
      wins: 1,
      winRate: 0.25,
      totalWinnings: 120,
      handBreakdown: [{ hand: "flush", wins: 1 }],
    });
    expect(bobProfile).toMatchObject({
      tournamentsPlayed: 4,
      wins: 3,
      winRate: 0.75,
      totalWinnings: 180,
      handBreakdown: [
        { hand: "straight", wins: 1 },
        { hand: "pair", wins: 2 },
      ],
    });
  });

  test("answers 404 for an unknown member", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request(
      "/api/members/0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b",
      { headers },
    );

    expect(response.status).toBe(404);
    expect(ErrorEnvelope.parse(await response.json()).error.code).toBe(
      "member_not_found",
    );
  });

  test("answers 400 for an id that is not a UUID", async () => {
    const { headers } = await signInTestUser(database, "ann");

    const response = await app.request("/api/members/not-a-uuid", {
      headers,
    });

    expect(response.status).toBe(400);
  });
});
