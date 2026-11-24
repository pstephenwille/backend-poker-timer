import {
  ErrorEnvelope,
  Leaderboard,
  MemberProfile,
  Tournament,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { tournamentParticipants, tournaments } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_ID = "0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b";

const database = useTestDatabase();
const app = createTestApp(database);

type SignedIn = Awaited<ReturnType<typeof signInTestUser>>;
let recorder: SignedIn;
let participant: SignedIn;
let admin: SignedIn;
let tournamentId: string;

function send(method: string, path: string, as: SignedIn, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      ...as.headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  recorder = await signInTestUser(database, "ann");
  participant = await signInTestUser(database, "bob");
  admin = await signInTestUser(database, "cal", { isAdmin: true });
  const created = await send("POST", "/api/tournaments", recorder, {
    playedOn: Date.now() - 2 * DAY_MS,
    participantIds: [recorder.user.id, participant.user.id],
    winnerId: recorder.user.id,
    winningHand: "flush",
    pot: 120,
  });
  tournamentId = Tournament.parse(await created.json()).id;
});

function edit(changes: unknown, as = recorder) {
  return send("PATCH", `/api/tournaments/${tournamentId}`, as, changes);
}

async function errorOf(response: Response) {
  return ErrorEnvelope.parse(await response.json()).error;
}

async function storedUpdatedAt() {
  const [row] = await database
    .select({ updatedAt: tournaments.updatedAt })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  return row?.updatedAt.getTime();
}

describe("PATCH /api/tournaments/{id}", () => {
  test("the recorder can change fields, keeping the rest as stored", async () => {
    const response = await edit({ pot: 200, note: "Recount" });
    const tournament = Tournament.parse(await response.json());

    expect(response.status).toBe(200);
    expect(tournament).toMatchObject({
      pot: 200,
      note: "Recount",
      winningHand: "flush",
      winnerId: recorder.user.id,
      recordedById: recorder.user.id,
    });
  });

  test("bumps updatedAt", async () => {
    await database
      .update(tournaments)
      .set({ updatedAt: new Date(Date.now() - DAY_MS) })
      .where(eq(tournaments.id, tournamentId));
    const before = await storedUpdatedAt();

    const tournament = Tournament.parse(await (await edit({ pot: 5 })).json());

    expect(tournament.updatedAt).toBeGreaterThan(before ?? 0);
    expect(tournament.createdAt).toBeLessThan(tournament.updatedAt);
  });

  test("replaces participants and opponents together", async () => {
    const dee = await signInTestUser(database, "dee");

    const response = await edit({
      participantIds: [recorder.user.id, participant.user.id, dee.user.id],
      opponentIds: [dee.user.id],
    });
    const tournament = Tournament.parse(await response.json());

    expect(tournament.participants.map((p) => p.id)).toEqual([
      recorder.user.id,
      participant.user.id,
      dee.user.id,
    ]);
    expect(tournament.opponentIds).toEqual([dee.user.id]);
    expect(
      await database
        .select()
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, tournamentId)),
    ).toHaveLength(3);
  });

  test("a participant who did not record it is refused", async () => {
    const response = await edit({ pot: 1 }, participant);

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("not_recorder");
  });

  test("an admin can edit any tournament", async () => {
    const response = await edit({ pot: 300 }, admin);

    expect(response.status).toBe(200);
    expect(Tournament.parse(await response.json()).pot).toBe(300);
  });

  test("an edit that removes the recorder is refused", async () => {
    const dee = await signInTestUser(database, "dee");

    const response = await edit({
      participantIds: [participant.user.id, dee.user.id],
      winnerId: participant.user.id,
    });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe(
      "recorder_must_remain_participant",
    );
  });

  test("an edit that breaks a cross-field rule is refused", async () => {
    const response = await edit({ opponentIds: [recorder.user.id] });

    expect(response.status).toBe(400);
    expect((await errorOf(response)).details).toContainEqual({
      path: "opponentIds",
      message: "the winner cannot be an opponent",
    });
  });

  test("an edit naming a non-member is refused", async () => {
    const response = await edit({
      participantIds: [recorder.user.id, UNKNOWN_ID],
    });

    expect((await errorOf(response)).code).toBe("unknown_participants");
  });

  test("an edit with an invalid field is refused before anything is stored", async () => {
    const response = await edit({ pot: -1 });

    expect(response.status).toBe(400);
    const stored = await app.request(
      `/api/tournaments/${tournamentId}`,
      recorder,
    );
    expect(Tournament.parse(await stored.json()).pot).toBe(120);
  });

  test("answers 404 for a tournament that does not exist", async () => {
    const response = await send(
      "PATCH",
      `/api/tournaments/${UNKNOWN_ID}`,
      recorder,
      { pot: 1 },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/tournaments/{id}", () => {
  test("a participant who did not record it is refused", async () => {
    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}`,
      participant,
    );

    expect(response.status).toBe(403);
    expect(await database.select().from(tournaments)).toHaveLength(1);
  });

  test("an admin can delete any tournament, and it stops counting", async () => {
    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}`,
      admin,
    );

    expect(response.status).toBe(204);
    expect(await database.select().from(tournaments)).toHaveLength(0);
    expect(await database.select().from(tournamentParticipants)).toHaveLength(
      0,
    );
    const profile = MemberProfile.parse(
      await (
        await app.request(`/api/members/${recorder.user.id}`, recorder)
      ).json(),
    );
    expect(profile).toMatchObject({
      tournamentsPlayed: 0,
      wins: 0,
      totalWinnings: 0,
    });
    const leaderboard = Leaderboard.parse(
      await (await app.request("/api/leaderboard")).json(),
    );
    expect(leaderboard.every((entry) => entry.wins === 0)).toBe(true);
  });

  test("the recorder can delete their own tournament", async () => {
    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}`,
      recorder,
    );

    expect(response.status).toBe(204);
  });

  test("answers 404 afterwards", async () => {
    await send("DELETE", `/api/tournaments/${tournamentId}`, recorder);

    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}`,
      recorder,
    );

    expect(response.status).toBe(404);
  });
});
