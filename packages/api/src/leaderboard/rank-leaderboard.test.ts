import type { HandCategory } from "@pstephenwille/poker-timer-contracts";
import { describe, expect, test } from "vitest";
import {
  type RankedWin,
  type RankingCandidate,
  rankLeaderboard,
} from "./rank-leaderboard.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 20, 0);

/** Hands listed oldest first, one tournament per day from `firstDay`, so the last hand is the most recent win. */
function member(
  name: string,
  handsOldestFirst: HandCategory[] = [],
  firstDay = 0,
): RankingCandidate {
  return {
    userId: name,
    displayName: name,
    wins: handsOldestFirst.map(
      (hand, index): RankedWin => ({
        tournamentId: `${name}-${index}`,
        playedOn: START + (firstDay + index) * DAY_MS,
        createdAt: START + (firstDay + index) * DAY_MS,
        hand,
      }),
    ),
  };
}

function standings(candidates: RankingCandidate[]) {
  return rankLeaderboard(candidates).map(
    ({ userId, rank }) => `${rank} ${userId}`,
  );
}

describe("rankLeaderboard", () => {
  test("orders by total wins, highest first", () => {
    const ann = member("Ann", ["pair", "pair", "pair", "pair", "pair"]);
    const bob = member("Bob", ["royal_flush", "royal_flush", "royal_flush"]);

    expect(standings([bob, ann])).toEqual(["1 Ann", "2 Bob"]);
  });

  test("breaks a tie in wins by the most recent winning hand", () => {
    const ann = member("Ann", ["pair", "pair", "full_house"]);
    const bob = member("Bob", ["royal_flush", "royal_flush", "flush"]);

    expect(standings([bob, ann])).toEqual(["1 Ann", "2 Bob"]);
  });

  test("falls back to earlier hands when the latest hands match", () => {
    const ann = member("Ann", ["high_card", "straight", "flush"]);
    const bob = member("Bob", ["royal_flush", "pair", "flush"]);

    expect(standings([bob, ann])).toEqual(["1 Ann", "2 Bob"]);
  });

  test("judges recency by playedOn, not by when the tournament was recorded", () => {
    const ann: RankingCandidate = {
      userId: "Ann",
      displayName: "Ann",
      wins: [
        {
          tournamentId: "t2",
          playedOn: START + DAY_MS,
          createdAt: START + DAY_MS,
          hand: "flush",
        },
        {
          tournamentId: "t1",
          playedOn: START,
          createdAt: START + 9 * DAY_MS,
          hand: "pair",
        },
      ],
    };
    const bob = member("Bob", ["royal_flush", "straight"]);

    expect(standings([bob, ann])).toEqual(["1 Ann", "2 Bob"]);
  });

  test("uses createdAt for wins played on the same date", () => {
    const sameDay = START + DAY_MS;
    const ann: RankingCandidate = {
      userId: "Ann",
      displayName: "Ann",
      wins: [
        {
          tournamentId: "t4",
          playedOn: sameDay,
          createdAt: sameDay + 2000,
          hand: "full_house",
        },
        {
          tournamentId: "t1",
          playedOn: sameDay,
          createdAt: sameDay + 1000,
          hand: "pair",
        },
      ],
    };
    const bob: RankingCandidate = {
      userId: "Bob",
      displayName: "Bob",
      wins: [
        {
          tournamentId: "t2",
          playedOn: sameDay,
          createdAt: sameDay + 1000,
          hand: "full_house",
        },
        {
          tournamentId: "t3",
          playedOn: sameDay,
          createdAt: sameDay + 2000,
          hand: "pair",
        },
      ],
    };

    expect(standings([bob, ann])).toEqual(["1 Ann", "2 Bob"]);
  });

  test("breaks a full tie by the most recent win", () => {
    const winsOnDays = (days: number[]): RankedWin[] =>
      days.map((day) => ({
        tournamentId: `t${day}`,
        playedOn: START + day * DAY_MS,
        createdAt: START + day * DAY_MS,
        hand: "flush",
      }));
    const alice: RankingCandidate = {
      userId: "Alice",
      displayName: "Alice",
      wins: winsOnDays([1, 3, 5]),
    };
    const bob: RankingCandidate = {
      userId: "Bob",
      displayName: "Bob",
      wins: winsOnDays([2, 4, 6]),
    };

    expect(standings([alice, bob])).toEqual(["1 Bob", "2 Alice"]);
  });

  test("members with wins never share a rank", () => {
    const leaders = [
      member("Ann", ["flush", "flush", "flush"]),
      member("Bob", ["pair", "pair", "pair"]),
    ];
    const tied = [
      member("Cal", ["straight", "flush"]),
      member("Dee", ["straight", "flush"], 1),
    ];
    const trailing = member("Eve", ["pair"]);

    expect(standings([trailing, ...tied, ...leaders])).toEqual([
      "1 Ann",
      "2 Bob",
      "3 Dee",
      "4 Cal",
      "5 Eve",
    ]);
  });

  test("uses the tournament id for wins played and recorded at the same instant", () => {
    const at = START + DAY_MS;
    const winIn = (tournamentId: string): RankedWin => ({
      tournamentId,
      playedOn: at,
      createdAt: at,
      hand: "pair",
    });
    const ann = { userId: "Ann", displayName: "Ann", wins: [winIn("a")] };
    const bob = { userId: "Bob", displayName: "Bob", wins: [winIn("b")] };

    expect(standings([ann, bob])).toEqual(["1 Bob", "2 Ann"]);
  });

  test("everyone without a win shares the last rank, listed by display name", () => {
    const winner = member("Ann", ["pair"]);

    expect(
      standings([member("zed"), member("Bea"), winner, member("amy")]),
    ).toEqual(["1 Ann", "2 amy", "2 Bea", "2 zed"]);
  });

  test("ranks a board where nobody has won yet as a single shared first place", () => {
    expect(standings([member("Bob"), member("Ann")])).toEqual([
      "1 Ann",
      "1 Bob",
    ]);
  });

  test("handles an empty board", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });
});
