import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CreateTournament,
  HAND_CATEGORIES,
  HandCategory,
  UpdateTournament,
} from "./tournament.ts";

const NOW = new Date("2026-06-15T20:00:00Z").getTime();
const MINUTE_MS = 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * MINUTE_MS;
const ANN = "6f1c2a9e-3b7d-4e8a-9c1f-2d5b8e7a4c31";
const BOB = "b42e9d17-8c3a-4f6b-a2e5-7d1c9f0b3e68";
const CAL = "d9a3c5e1-7f2b-4c8d-b6e4-1a0f3c5e7b92";

const minimal = {
  playedOn: NOW - 60 * MINUTE_MS,
  participantIds: [ANN, BOB, CAL],
  winnerId: ANN,
  winningHand: "flush",
  pot: 120,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function issuesFor(input: unknown) {
  const result = CreateTournament.safeParse(input);
  return (
    result.error?.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })) ?? []
  );
}

function rejects(input: unknown): boolean {
  return !CreateTournament.safeParse(input).success;
}

describe("HandCategory", () => {
  test("lists hands from weakest to strongest", () => {
    expect(HAND_CATEGORIES).toEqual([
      "high_card",
      "pair",
      "two_pair",
      "three_of_a_kind",
      "straight",
      "flush",
      "full_house",
      "four_of_a_kind",
      "straight_flush",
      "royal_flush",
    ]);
  });

  test("an unknown category is rejected with the allowed values listed", () => {
    const [issue] = issuesFor({ ...minimal, winningHand: "five_aces" });

    expect(issue?.path).toBe("winningHand");
    expect(issue?.message).toContain('"royal_flush"');
    expect(HandCategory.safeParse("five_aces").success).toBe(false);
  });
});

describe("CreateTournament", () => {
  test("a minimal tournament gets no Final Hand Opponents and no note", () => {
    expect(CreateTournament.parse(minimal)).toEqual({
      ...minimal,
      finalHandOpponentIds: [],
      note: null,
    });
  });

  describe("playedOn", () => {
    test("is required", () => {
      const { playedOn: _, ...withoutDate } = minimal;

      expect(issuesFor(withoutDate)).toEqual([
        { path: "playedOn", message: "playedOn is required" },
      ]);
    });

    test("may be years in the past", () => {
      expect(rejects({ ...minimal, playedOn: NOW - 3 * YEAR_MS })).toBe(false);
    });

    test("may be up to 5 minutes ahead to allow for clock drift", () => {
      expect(rejects({ ...minimal, playedOn: NOW + 5 * MINUTE_MS })).toBe(
        false,
      );
    });

    test("cannot be more than 5 minutes in the future", () => {
      expect(
        issuesFor({ ...minimal, playedOn: NOW + 5 * MINUTE_MS + 1 }),
      ).toEqual([
        { path: "playedOn", message: "playedOn cannot be in the future" },
      ]);
    });

    test.each([
      ["fractional", 1_750_000_000_000.5],
      ["negative", -1],
      ["a string", "2026-06-15"],
      ["null", null],
    ])("rejects a %s value", (_label, playedOn) => {
      expect(rejects({ ...minimal, playedOn })).toBe(true);
    });
  });

  describe("participants", () => {
    test("accepts the winner as the only participant", () => {
      expect(rejects({ ...minimal, participantIds: [ANN] })).toBe(false);
    });

    test("no participants fails only because the winner is not one", () => {
      expect(issuesFor({ ...minimal, participantIds: [] })).toEqual([
        { path: "winnerId", message: "the winner must be a participant" },
      ]);
    });

    test("rejects duplicate participants", () => {
      expect(
        issuesFor({ ...minimal, participantIds: [ANN, ANN, BOB] }),
      ).toContainEqual({
        path: "participantIds",
        message: "participants must be distinct",
      });
    });

    test("the winner must be a participant", () => {
      expect(issuesFor({ ...minimal, participantIds: [BOB, CAL] })).toEqual([
        { path: "winnerId", message: "the winner must be a participant" },
      ]);
    });
  });

  describe("pot", () => {
    test.each([120.5, -5])("rejects %s", (pot) => {
      expect(issuesFor({ ...minimal, pot })).toEqual([
        {
          path: "pot",
          message: "pot must be a whole number of dollars of at least 0",
        },
      ]);
    });

    test("accepts a pot of 0", () => {
      expect(rejects({ ...minimal, pot: 0 })).toBe(false);
    });
  });

  describe("Final Hand Opponents", () => {
    test("accepts every participant except the winner", () => {
      expect(rejects({ ...minimal, finalHandOpponentIds: [BOB, CAL] })).toBe(
        false,
      );
    });

    test.each([
      ["the winner", [ANN], "the winner cannot be a final hand opponent"],
      ["a duplicate", [BOB, BOB], "final hand opponents must be distinct"],
      [
        "someone who did not play",
        ["0b7e3f1a-2c4d-4e6f-8a9b-1c2d3e4f5a6b"],
        "every final hand opponent must be a participant",
      ],
    ])("rejects %s", (_label, finalHandOpponentIds, message) => {
      expect(issuesFor({ ...minimal, finalHandOpponentIds })).toContainEqual({
        path: "finalHandOpponentIds",
        message,
      });
    });
  });

  describe("note", () => {
    test("accepts 500 characters", () => {
      expect(rejects({ ...minimal, note: "a".repeat(500) })).toBe(false);
    });

    test("rejects 501 characters", () => {
      expect(rejects({ ...minimal, note: "a".repeat(501) })).toBe(true);
    });
  });

  test("rejects fields the server sets", () => {
    expect(rejects({ ...minimal, recordedById: ANN })).toBe(true);
  });
});

describe("UpdateTournament", () => {
  test("leaves out every field that is not sent", () => {
    expect(UpdateTournament.parse({ pot: 200 })).toEqual({ pot: 200 });
  });

  test("still validates the fields that are sent", () => {
    expect(UpdateTournament.safeParse({ pot: -1 }).success).toBe(false);
  });
});
