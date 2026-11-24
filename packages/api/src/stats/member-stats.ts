import {
  HAND_CATEGORIES,
  type HandBreakdown,
  type HandCategory,
} from "@pstephenwille/poker-timer-contracts";
import {
  newestFirst,
  type RankedWin,
} from "../leaderboard/rank-leaderboard.ts";

export interface Participation {
  tournamentId: string;
  won: boolean;
  pot: number;
  winningHand: HandCategory;
  playedOn: number;
  createdAt: number;
}

export interface MemberStats {
  tournamentsPlayed: number;
  wins: number;
  winRate: number | null;
  totalWinnings: number;
  latestWinningHand: HandCategory | null;
  lastWonAt: number | null;
  handBreakdown: HandBreakdown;
}

export function winsOf(participations: Participation[]): RankedWin[] {
  return participations
    .filter((participation) => participation.won)
    .map(({ tournamentId, playedOn, createdAt, winningHand }) => ({
      tournamentId,
      playedOn,
      createdAt,
      hand: winningHand,
    }));
}

function latestWin(wins: RankedWin[]): RankedWin | undefined {
  return [...wins].sort(newestFirst)[0];
}

function breakdownStrongestFirst(wins: RankedWin[]): HandBreakdown {
  return [...HAND_CATEGORIES]
    .reverse()
    .map((hand) => ({
      hand,
      wins: wins.filter((win) => win.hand === hand).length,
    }))
    .filter((entry) => entry.wins > 0);
}

/** A member who has never played has no win rate rather than a rate of zero. */
export function summarizeParticipations(
  participations: Participation[],
): MemberStats {
  const wins = winsOf(participations);
  const latest = latestWin(wins);
  const tournamentsPlayed = participations.length;
  return {
    tournamentsPlayed,
    wins: wins.length,
    winRate: tournamentsPlayed === 0 ? null : wins.length / tournamentsPlayed,
    totalWinnings: participations
      .filter((participation) => participation.won)
      .reduce((total, participation) => total + participation.pot, 0),
    latestWinningHand: latest?.hand ?? null,
    lastWonAt: latest?.playedOn ?? null,
    handBreakdown: breakdownStrongestFirst(wins),
  };
}
