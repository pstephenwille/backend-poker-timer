import { z } from "zod";
import { Photo } from "./media.ts";

/** Ordered from weakest to strongest, so a category's index is its hand strength. */
export const HAND_CATEGORIES = [
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
] as const;

export const HandCategory = z.enum(HAND_CATEGORIES);
export type HandCategory = z.infer<typeof HandCategory>;

/** Wins per hand, strongest hand first, listing only hands the member has won with. */
export const HandBreakdown = z.array(
  z.strictObject({ hand: HandCategory, wins: z.int().positive() }),
);
export type HandBreakdown = z.infer<typeof HandBreakdown>;

/** A fraction from 0 to 1; null until the member has played. */
export const WinRate = z.number().min(0).max(1).nullable();

export const MAX_NOTE_LENGTH = 500;
/** Clients' clocks drift; a tournament recorded just after it ends must not look like a future one. */
export const PLAYED_ON_DRIFT_TOLERANCE_MS = 5 * 60 * 1000;
/** Implied by the winner being a participant, so no rule of its own checks it; still exported for clients built on 1.0. */
export const MIN_PARTICIPANTS = 1;

const PlayedOn = z
  .int({
    error: (issue) =>
      issue.input === undefined
        ? "playedOn is required"
        : "playedOn must be a whole number of epoch milliseconds",
  })
  .nonnegative("playedOn must be a whole number of epoch milliseconds")
  .refine(
    (playedOn) => playedOn <= Date.now() + PLAYED_ON_DRIFT_TOLERANCE_MS,
    "playedOn cannot be in the future",
  );

const Pot = z
  .int({ error: "pot must be a whole number of dollars of at least 0" })
  .nonnegative("pot must be a whole number of dollars of at least 0");

const tournamentFields = {
  playedOn: PlayedOn,
  participantIds: z.array(z.uuid()),
  winnerId: z.uuid(),
  winningHand: HandCategory,
  pot: Pot,
  finalHandOpponentIds: z.array(z.uuid()),
  note: z.string().max(MAX_NOTE_LENGTH).nullable(),
};

interface CrossFieldValues {
  participantIds: string[];
  winnerId: string;
  finalHandOpponentIds: string[];
}

function hasDuplicates(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function crossFieldIssues({
  participantIds,
  winnerId,
  finalHandOpponentIds,
}: CrossFieldValues): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (hasDuplicates(participantIds)) {
    issues.push({
      path: "participantIds",
      message: "participants must be distinct",
    });
  }
  if (!participantIds.includes(winnerId)) {
    issues.push({
      path: "winnerId",
      message: "the winner must be a participant",
    });
  }
  if (hasDuplicates(finalHandOpponentIds)) {
    issues.push({
      path: "finalHandOpponentIds",
      message: "final hand opponents must be distinct",
    });
  }
  if (finalHandOpponentIds.includes(winnerId)) {
    issues.push({
      path: "finalHandOpponentIds",
      message: "the winner cannot be a final hand opponent",
    });
  }
  if (finalHandOpponentIds.some((id) => !participantIds.includes(id))) {
    issues.push({
      path: "finalHandOpponentIds",
      message: "every final hand opponent must be a participant",
    });
  }
  return issues;
}

/**
 * The full set of rules for a tournament's details. Edits merge their changes
 * into the stored tournament and validate the result with this schema, so the
 * cross-field rules hold after every change, not just at creation.
 */
export const TournamentDetails = z
  .strictObject({
    ...tournamentFields,
    finalHandOpponentIds: tournamentFields.finalHandOpponentIds.default([]),
    note: tournamentFields.note.default(null),
  })
  .superRefine((tournament, context) => {
    for (const issue of crossFieldIssues(tournament)) {
      context.addIssue({
        code: "custom",
        path: [issue.path],
        message: issue.message,
      });
    }
  });
export type TournamentDetails = z.infer<typeof TournamentDetails>;

export const CreateTournament = TournamentDetails;
export type CreateTournament = z.input<typeof CreateTournament>;

/** No defaults: a field left out of an edit keeps its stored value. */
export const UpdateTournament = z.strictObject(tournamentFields).partial();
export type UpdateTournament = z.input<typeof UpdateTournament>;

export const TournamentParticipant = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
});
export type TournamentParticipant = z.infer<typeof TournamentParticipant>;

export const Tournament = z.strictObject({
  id: z.uuid(),
  playedOn: z.int().nonnegative(),
  participants: z.array(TournamentParticipant),
  winnerId: z.uuid(),
  finalHandOpponentIds: z.array(z.uuid()),
  winningHand: HandCategory,
  pot: z.int().nonnegative(),
  note: z.string().nullable(),
  photo: Photo.nullable(),
  recordedById: z.uuid(),
  createdAt: z.int().nonnegative(),
  updatedAt: z.int().nonnegative(),
});
export type Tournament = z.infer<typeof Tournament>;

export const TournamentPage = z.strictObject({
  items: z.array(Tournament),
  nextCursor: z.string().nullable(),
});
export type TournamentPage = z.infer<typeof TournamentPage>;
