import {
  ErrorEnvelope,
  Tournament,
  TournamentPage,
} from "@pstephenwille/poker-timer-contracts";
import { beforeEach, describe, expect, test } from "vitest";
import { HOME_GROUP_ID } from "../db/home-group.ts";
import { tournamentParticipants, tournaments } from "../db/schema.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { useTestDatabase } from "../testing/test-database.ts";
import { insertTestUser } from "../testing/test-users.ts";

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 20, 0);

const database = useTestDatabase();
const app = createTestApp(database);

let headers: Record<string, string>;
let annId: string;
let bobId: string;

beforeEach(async () => {
  const ann = await signInTestUser(database, "ann");
  headers = ann.headers;
  annId = ann.user.id;
  bobId = (await insertTestUser(database, "bob", { googleName: "Bob Jones" }))
    .id;
});

async function insertTournament(playedOn: number, createdAt = playedOn) {
  const [row] = await database
    .insert(tournaments)
    .values({
      groupId: HOME_GROUP_ID,
      playedOn: new Date(playedOn),
      winnerId: annId,
      winningHand: "pair",
      pot: 10,
      recordedById: annId,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    })
    .returning({ id: tournaments.id });
  if (!row) {
    throw new Error("Inserting a test tournament returned no row");
  }
  await database.insert(tournamentParticipants).values([
    { tournamentId: row.id, userId: annId, isFinalHandOpponent: false },
    { tournamentId: row.id, userId: bobId, isFinalHandOpponent: true },
  ]);
  return row.id;
}

async function listPage(cursor?: string) {
  const query = cursor ? `?cursor=${cursor}` : "";
  const response = await app.request(`/api/tournaments${query}`, { headers });
  return {
    status: response.status,
    page: TournamentPage.parse(await response.json()),
  };
}

describe("GET /api/tournaments/{id}", () => {
  test("returns the tournament with participants by display name and no emails", async () => {
    const id = await insertTournament(START);

    const response = await app.request(`/api/tournaments/${id}`, { headers });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("@example.com");
    expect(Tournament.parse(JSON.parse(text))).toMatchObject({
      id,
      playedOn: START,
      participants: [
        { id: annId, displayName: "ann" },
        { id: bobId, displayName: "Bob Jones" },
      ],
      winnerId: annId,
      finalHandOpponentIds: [bobId],
    });
  });

  test("answers 404 for a tournament that does not exist", async () => {
    const response = await app.request(
      "/api/tournaments/0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b",
      { headers },
    );

    expect(response.status).toBe(404);
    expect(ErrorEnvelope.parse(await response.json()).error.code).toBe(
      "tournament_not_found",
    );
  });

  test("answers 400 for an id that is not a UUID", async () => {
    const response = await app.request("/api/tournaments/latest", { headers });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/tournaments", () => {
  test("is empty with no next page before anything is recorded", async () => {
    expect(await listPage()).toEqual({
      status: 200,
      page: { items: [], nextCursor: null },
    });
  });

  test("orders by playedOn newest first, then createdAt newest first", async () => {
    const oldest = await insertTournament(START);
    const sameDayEarlier = await insertTournament(
      START + DAY_MS,
      START + 2 * DAY_MS,
    );
    const sameDayLater = await insertTournament(
      START + DAY_MS,
      START + 3 * DAY_MS,
    );
    const newest = await insertTournament(START + 5 * DAY_MS);

    const { page } = await listPage();

    expect(page.items.map((tournament) => tournament.id)).toEqual([
      newest,
      sameDayLater,
      sameDayEarlier,
      oldest,
    ]);
    expect(page.nextCursor).toBeNull();
  });

  test("continues from the cursor without skipping or repeating", async () => {
    const insertedNewestFirst: string[] = [];
    for (let day = 0; day < PAGE_SIZE + 5; day++) {
      insertedNewestFirst.unshift(await insertTournament(START + day * DAY_MS));
    }

    const first = await listPage();
    const second = await listPage(first.page.nextCursor ?? "");

    expect(first.page.items).toHaveLength(PAGE_SIZE);
    expect(first.page.nextCursor).not.toBeNull();
    expect(second.page.items).toHaveLength(5);
    expect(second.page.nextCursor).toBeNull();
    expect(
      [...first.page.items, ...second.page.items].map((t) => t.id),
    ).toEqual(insertedNewestFirst);
  });

  test("pages correctly through tournaments sharing a date and creation time", async () => {
    const ids: string[] = [];
    for (let index = 0; index < PAGE_SIZE + 1; index++) {
      ids.push(await insertTournament(START, START));
    }

    const first = await listPage();
    const second = await listPage(first.page.nextCursor ?? "");
    const seen = [...first.page.items, ...second.page.items].map((t) => t.id);

    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  test("answers 400 for a cursor it did not issue", async () => {
    const response = await app.request("/api/tournaments?cursor=bogus", {
      headers,
    });

    expect(response.status).toBe(400);
    expect(ErrorEnvelope.parse(await response.json()).error.code).toBe(
      "invalid_cursor",
    );
  });
});
