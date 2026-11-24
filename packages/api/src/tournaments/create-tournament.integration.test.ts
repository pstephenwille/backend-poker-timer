import {
  ErrorEnvelope,
  Tournament,
} from "@pstephenwille/poker-timer-contracts";
import { beforeEach, describe, expect, test } from "vitest";
import { tournamentParticipants, tournaments } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const MINUTE_MS = 60 * 1000;
const UNKNOWN_ID = "0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b";

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
  bobId = (await insertTestUser(database, "bob", { googleName: "Bob Jones" }))
    .id;
  calId = (await insertTestUser(database, "cal")).id;
});

function minimalTournament() {
  return {
    playedOn: Date.now() - 60 * MINUTE_MS,
    participantIds: [annId, bobId, calId],
    winnerId: annId,
    winningHand: "flush",
    pot: 120,
  };
}

function record(body: unknown, requestHeaders = headers) {
  return app.request("/api/tournaments", {
    method: "POST",
    headers: { ...requestHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function errorOf(response: Response) {
  return ErrorEnvelope.parse(await response.json()).error;
}

async function storedTournamentCount() {
  return (await database.select().from(tournaments)).length;
}

describe("POST /api/tournaments", () => {
  test("stores a minimal tournament and returns the server-set fields", async () => {
    const before = Date.now();
    const input = minimalTournament();

    const response = await record(input);
    const tournament = Tournament.parse(await response.json());

    expect(response.status).toBe(201);
    expect(tournament).toMatchObject({
      playedOn: input.playedOn,
      winnerId: annId,
      winningHand: "flush",
      pot: 120,
      finalHandOpponentIds: [],
      note: null,
      recordedById: annId,
    });
    expect(tournament.participants).toEqual([
      { id: annId, displayName: "ann" },
      { id: bobId, displayName: "Bob Jones" },
      { id: calId, displayName: "cal" },
    ]);
    expect(tournament.createdAt).toBeGreaterThanOrEqual(before - 1000);
    expect(tournament.updatedAt).toBe(tournament.createdAt);
  });

  test("stores participants and Final Hand Opponents in one transaction", async () => {
    const response = await record({
      ...minimalTournament(),
      finalHandOpponentIds: [bobId, calId],
      note: "Everyone busted on the river.",
    });
    const { id } = Tournament.parse(await response.json());

    const rows = await database.select().from(tournamentParticipants);
    expect(rows).toHaveLength(3);
    expect(
      rows.map(({ tournamentId, userId, isFinalHandOpponent }) => ({
        tournamentId,
        userId,
        isFinalHandOpponent,
      })),
    ).toEqual(
      expect.arrayContaining([
        { tournamentId: id, userId: annId, isFinalHandOpponent: false },
        { tournamentId: id, userId: bobId, isFinalHandOpponent: true },
        { tournamentId: id, userId: calId, isFinalHandOpponent: true },
      ]),
    );
  });

  test("accepts a tournament played years ago", async () => {
    const response = await record({
      ...minimalTournament(),
      playedOn: Date.UTC(2019, 0, 5),
    });

    expect(response.status).toBe(201);
  });

  test("accepts a deactivated member as a participant", async () => {
    const dan = await insertTestUser(database, "dan", {
      deactivatedAt: new Date(),
    });

    const response = await record({
      ...minimalTournament(),
      participantIds: [annId, dan.id],
    });

    expect(response.status).toBe(201);
  });

  test("answers 400 stating playedOn is required", async () => {
    const { playedOn: _, ...withoutDate } = minimalTournament();

    const response = await record(withoutDate);

    expect(response.status).toBe(400);
    expect((await errorOf(response)).details).toEqual([
      { path: "playedOn", message: "playedOn is required" },
    ]);
  });

  test("answers 400 for a date more than 5 minutes in the future", async () => {
    const response = await record({
      ...minimalTournament(),
      playedOn: Date.now() + 10 * MINUTE_MS,
    });

    expect((await errorOf(response)).details).toEqual([
      { path: "playedOn", message: "playedOn cannot be in the future" },
    ]);
  });

  test.each([1.5, -1, "yesterday"])(
    "answers 400 for playedOn %s",
    async (playedOn) => {
      const response = await record({ ...minimalTournament(), playedOn });

      expect(response.status).toBe(400);
    },
  );

  test("answers 400 listing the allowed hands for an unknown hand", async () => {
    const response = await record({
      ...minimalTournament(),
      winningHand: "five_aces",
    });
    const [detail] = (await errorOf(response)).details ?? [];

    expect(response.status).toBe(400);
    expect(detail?.path).toBe("winningHand");
    expect(detail?.message).toMatch(/high_card.*royal_flush/);
  });

  test("answers 400 for a single participant", async () => {
    const response = await record({
      ...minimalTournament(),
      participantIds: [annId],
    });

    expect(response.status).toBe(400);
  });

  test("answers 400 when the winner is not a participant", async () => {
    const response = await record({
      ...minimalTournament(),
      participantIds: [annId, bobId],
      winnerId: calId,
    });

    expect((await errorOf(response)).details).toContainEqual({
      path: "winnerId",
      message: "the winner must be a participant",
    });
  });

  test.each([120.5, -5])("answers 400 for a pot of %s", async (pot) => {
    const response = await record({ ...minimalTournament(), pot });

    expect((await errorOf(response)).details).toEqual([
      {
        path: "pot",
        message: "pot must be a whole number of dollars of at least 0",
      },
    ]);
  });

  test("answers 400 when the winner is listed as a Final Hand Opponent", async () => {
    const response = await record({
      ...minimalTournament(),
      finalHandOpponentIds: [annId],
    });

    expect(response.status).toBe(400);
  });

  test("accepts every other participant as a Final Hand Opponent", async () => {
    const response = await record({
      ...minimalTournament(),
      finalHandOpponentIds: [bobId, calId],
    });

    expect(response.status).toBe(201);
  });

  test("answers 400 naming a participant who is not a group member", async () => {
    const response = await record({
      ...minimalTournament(),
      participantIds: [annId, bobId, UNKNOWN_ID],
    });
    const error = await errorOf(response);

    expect(response.status).toBe(400);
    expect(error.code).toBe("unknown_participants");
    expect(error.details).toEqual([
      {
        path: "participantIds",
        message: `${UNKNOWN_ID} is not a group member`,
      },
    ]);
    expect(await storedTournamentCount()).toBe(0);
  });

  test("a tournament won by a guest cannot be recorded", async () => {
    const response = await record({
      ...minimalTournament(),
      participantIds: [annId, UNKNOWN_ID],
      winnerId: UNKNOWN_ID,
    });

    expect(response.status).toBe(400);
    expect(await storedTournamentCount()).toBe(0);
  });

  test("answers 403 when the recorder did not play", async () => {
    const response = await record({
      ...minimalTournament(),
      participantIds: [bobId, calId],
      winnerId: bobId,
    });
    const error = await errorOf(response);

    expect(response.status).toBe(403);
    expect(error.code).toBe("recorder_not_participant");
    expect(await storedTournamentCount()).toBe(0);
  });

  test("a cross-site request with a valid session is refused and changes nothing", async () => {
    const response = await record(minimalTournament(), {
      ...headers,
      origin: "https://other.example",
    });

    expect(response.status).toBe(403);
    expect(await storedTournamentCount()).toBe(0);
  });
});
