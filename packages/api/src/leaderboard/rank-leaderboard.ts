import {
  HAND_CATEGORIES,
  type HandCategory,
} from "@pstephenwille/poker-timer-contracts";
import { byDisplayName } from "../users/user-profile.ts";

export interface RankedWin {
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
  handStrengthsNewestFirst: number[];
}

export function newestFirst(first: RankedWin, second: RankedWin): number {
  return second.playedOn - first.playedOn || second.createdAt - first.createdAt;
}

function toStanding(candidate: RankingCandidate): Standing {
  return {
    candidate,
    handStrengthsNewestFirst: [...candidate.wins]
      .sort(newestFirst)
      .map((win) => HAND_CATEGORIES.indexOf(win.hand)),
  };
}

/**
 * Negative when `first` ranks higher. Equal win counts mean equal-length hand
 * histories, so comparing them newest first plays the hands off against each other.
 */
function compareStandings(first: Standing, second: Standing): number {
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
 * Standard competition ranking (1, 2, 2, 4): members with identical wins and hand
 * histories share a rank, and everyone without a win shares the last one.
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
