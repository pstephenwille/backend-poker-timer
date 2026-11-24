import { describe, expect, test } from "vitest";
import { type Participation, summarizeParticipations } from "./member-stats.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 20, 0);

function played(
  day: number,
  overrides: Partial<Participation> = {},
): Participation {
  return {
    tournamentId: `t${day}`,
    won: false,
    pot: 50,
    winningHand: "pair",
    playedOn: START + day * DAY_MS,
    createdAt: START + day * DAY_MS,
    ...overrides,
  };
}

describe("summarizeParticipations", () => {
  test("4 played with one Flush win for $120", () => {
    const stats = summarizeParticipations([
      played(0),
      played(1, { won: true, pot: 120, winningHand: "flush" }),
      played(2),
      played(3),
    ]);

    expect(stats).toEqual({
      tournamentsPlayed: 4,
      wins: 1,
      winRate: 0.25,
      totalWinnings: 120,
      latestWinningHand: "flush",
      lastWonAt: START + DAY_MS,
      handBreakdown: [{ hand: "flush", wins: 1 }],
    });
  });

  test("a member with no tournaments has no win rate, $0 and an empty breakdown", () => {
    expect(summarizeParticipations([])).toEqual({
      tournamentsPlayed: 0,
      wins: 0,
      winRate: null,
      totalWinnings: 0,
      latestWinningHand: null,
      lastWonAt: null,
      handBreakdown: [],
    });
  });

  test("a member who played but never won has a win rate of 0", () => {
    const stats = summarizeParticipations([played(0), played(1)]);

    expect(stats).toMatchObject({
      winRate: 0,
      latestWinningHand: null,
      lastWonAt: null,
    });
  });

  test("winnings count only pots the member won", () => {
    const stats = summarizeParticipations([
      played(0, { won: true, pot: 30 }),
      played(1, { pot: 500 }),
      played(2, { won: true, pot: 70 }),
    ]);

    expect(stats.totalWinnings).toBe(100);
  });

  test("the latest winning hand is from the most recently played win", () => {
    const stats = summarizeParticipations([
      played(5, { won: true, winningHand: "straight" }),
      played(1, {
        won: true,
        winningHand: "royal_flush",
        createdAt: START + 9 * DAY_MS,
      }),
    ]);

    expect(stats.latestWinningHand).toBe("straight");
  });

  test("lastWonAt is when the most recently played win was played", () => {
    const stats = summarizeParticipations([
      played(5, { won: true }),
      played(1, { won: true, createdAt: START + 9 * DAY_MS }),
      played(7),
    ]);

    expect(stats.lastWonAt).toBe(START + 5 * DAY_MS);
  });

  test("the hand breakdown counts wins per hand, strongest hand first", () => {
    const stats = summarizeParticipations([
      played(0, { won: true, winningHand: "pair" }),
      played(1, { won: true, winningHand: "full_house" }),
      played(2, { won: true, winningHand: "pair" }),
      played(3, { winningHand: "royal_flush" }),
    ]);

    expect(stats.handBreakdown).toEqual([
      { hand: "full_house", wins: 1 },
      { hand: "pair", wins: 2 },
    ]);
  });
});
