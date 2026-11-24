import {
  HAND_CATEGORIES,
  type HandCategory,
} from "@pstephenwille/poker-timer-contracts";
import { byDisplayName } from "../users/user-profile.ts";

export interface RankedWin {
  tournamentId: string;
  playedOn: number;
  createdAt: number;
  hand: HandCategory;
}

export interface RankingCandidate {
  userId: string;
  displayName: string;
  wins: RankedWin[];
}

export interface RankedMember {
  userId: string;
  rank: number;
}

interface Standing {
  candidate: RankingCandidate;
  latestWin: RankedWin | undefined;
  handStrengthsNewestFirst: number[];
}

function byTournamentIdDescending(first: RankedWin, second: RankedWin): number {
  if (first.tournamentId === second.tournamentId) {
    return 0;
  }
  return first.tournamentId < second.tournamentId ? 1 : -1;
}

/** The same recency order as the tournament list: playedOn, then createdAt, then id. */
export function newestFirst(first: RankedWin, second: RankedWin): number {
  return (
    second.playedOn - first.playedOn ||
    second.createdAt - first.createdAt ||
    byTournamentIdDescending(first, second)
  );
}

function toStanding(candidate: RankingCandidate): Standing {
  const winsNewestFirst = [...candidate.wins].sort(newestFirst);
  return {
    candidate,
    latestWin: winsNewestFirst[0],
    handStrengthsNewestFirst: winsNewestFirst.map((win) =>
      HAND_CATEGORIES.indexOf(win.hand),
    ),
  };
}

function byMostRecentWin(first: Standing, second: Standing): number {
  if (!first.latestWin || !second.latestWin) {
    return 0;
  }
  return newestFirst(first.latestWin, second.latestWin);
}

/**
 * Negative when `first` ranks higher. Equal win counts mean equal-length hand
 * histories, so comparing them newest first plays the hands off against each other.
 */
function compareHandHistories(first: Standing, second: Standing): number {
  const byWins =
    second.handStrengthsNewestFirst.length -
    first.handStrengthsNewestFirst.length;
  if (byWins !== 0) {
    return byWins;
  }
  const firstDifference = first.handStrengthsNewestFirst.findIndex(
    (strength, index) => strength !== second.handStrengthsNewestFirst[index],
  );
  if (firstDifference === -1) {
    return 0;
  }
  return (
    (second.handStrengthsNewestFirst[firstDifference] ?? 0) -
    (first.handStrengthsNewestFirst[firstDifference] ?? 0)
  );
}

/**
 * Identical hand histories go to the member who won most recently. No two members
 * can win the same Tournament, so only members without a win are ever level.
 */
function compareStandings(first: Standing, second: Standing): number {
  return compareHandHistories(first, second) || byMostRecentWin(first, second);
}

/**
 * Every member with a win has a rank of their own, and everyone without a win
 * shares the last one (1, 2, 3, 4, 4).
 */
export function rankLeaderboard(
  candidates: RankingCandidate[],
): RankedMember[] {
  const ordered = candidates
    .map(toStanding)
    .sort(
      (first, second) =>
        compareStandings(first, second) ||
        byDisplayName(first.candidate, second.candidate),
    );

  const ranked: RankedMember[] = [];
  ordered.forEach((standing, index) => {
    const previous = ordered[index - 1];
    const previousRank = ranked[index - 1]?.rank;
    const sharesPreviousRank =
      previous !== undefined &&
      previousRank !== undefined &&
      compareStandings(previous, standing) === 0;
    ranked.push({
      userId: standing.candidate.userId,
      rank: sharesPreviousRank ? previousRank : index + 1,
    });
  });
  return ranked;
}
