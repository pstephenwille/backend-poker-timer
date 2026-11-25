# Spec Delta

## Purpose

Keeps a durable record of each in-person poker tournament won by a group member: who played, who won, with what hand, and for how much.

## ADDED Requirements

### Requirement: Tournament fields
A tournament SHALL consist of `playedOn` (required, epoch milliseconds), `participantIds`, `winnerId`, `winningHand`, `pot`, `finalHandOpponentIds`, an optional `note` and an optional photo; the system SHALL set `id`, `recordedById`, `createdAt` and `updatedAt`.

#### Scenario: Minimal valid tournament
- **WHEN** a member records a tournament with only `playedOn`, `participantIds`, `winnerId`, `winningHand` and `pot`
- **THEN** the system stores it with `finalHandOpponentIds` empty, no note and no photo, and returns the server-set fields

### Requirement: Winning hand categories
`winningHand` MUST be one of, from lowest to highest: High Card, Pair, Two Pair, Three of a Kind, Straight, Flush, Full House, Four of a Kind, Straight Flush, Royal Flush.

#### Scenario: Unknown hand category
- **WHEN** a tournament is submitted with a `winningHand` outside the list
- **THEN** the system responds 400 listing the allowed values

### Requirement: Tournament field validation
The system SHALL reject a tournament unless: `playedOn` is present and is a non-negative integer of epoch milliseconds no later than the server's current time plus 5 minutes of clock-drift tolerance; there are at least 2 distinct participants, all group members; the winner is a participant; `pot` is a whole number of dollars ≥ 0; Final Hand Opponents are distinct participants other than the winner; and `note` is at most 500 characters.

#### Scenario: Missing date
- **WHEN** a tournament is submitted without `playedOn`
- **THEN** the system responds 400 stating `playedOn` is required

#### Scenario: Future date
- **WHEN** a tournament is submitted with `playedOn` more than 5 minutes after the server's current time
- **THEN** the system responds 400 stating the date cannot be in the future

#### Scenario: Past date
- **WHEN** a tournament is submitted with `playedOn` months or years in the past
- **THEN** the system accepts the tournament

#### Scenario: Invalid playedOn
- **WHEN** `playedOn` is fractional, negative or not a number
- **THEN** the system responds 400

#### Scenario: Single participant
- **WHEN** a tournament is submitted with fewer than 2 distinct participants
- **THEN** the system responds 400

#### Scenario: Winner not a participant
- **WHEN** `winnerId` is not in `participantIds`
- **THEN** the system responds 400 stating the winner must be a participant

#### Scenario: Fractional or negative pot
- **WHEN** `pot` is `120.50` or `-5`
- **THEN** the system responds 400 stating the pot must be a whole number of dollars of at least 0

#### Scenario: Winner listed as a Final Hand Opponent
- **WHEN** `finalHandOpponentIds` contains the winner, a duplicate, or someone not in `participantIds`
- **THEN** the system responds 400

#### Scenario: All other participants knocked out in the Final Hand
- **WHEN** `finalHandOpponentIds` lists every participant except the winner
- **THEN** the system accepts the tournament

#### Scenario: Unknown participant
- **WHEN** `participantIds` contains an id that is not a group member
- **THEN** the system responds 400 naming the unknown id

### Requirement: Any member may record
The system SHALL accept a tournament recorded by any signed-in member, whether or not they are among its participants, and SHALL set `recordedById` to that member. An edit MAY leave the recorder out of the participants.

#### Scenario: Recording a tournament you did not play
- **WHEN** a member records a tournament whose `participantIds` excludes themselves
- **THEN** the system accepts the tournament with `recordedById` set to that member

#### Scenario: Removing the recorder on edit
- **WHEN** an edit removes the recorder from `participantIds`
- **THEN** the system accepts the edit and `recordedById` is unchanged

#### Scenario: Editing a tournament you did not play
- **WHEN** the recorder edits a tournament whose participants exclude them
- **THEN** the system accepts the edit

### Requirement: No confirmation step
The system SHALL count a recorded tournament in stats and the leaderboard immediately, without confirmation from other participants.

#### Scenario: Immediately counted
- **WHEN** a member records a tournament
- **THEN** the next leaderboard and stats reads include it

### Requirement: Edit and delete authorization
The system SHALL allow only the tournament's recorder or an admin to edit or delete it.

#### Scenario: Another participant tries to edit
- **WHEN** a participant who did not record the tournament and is not an admin edits or deletes it
- **THEN** the system responds 403

#### Scenario: Admin deletes a tournament
- **WHEN** an admin deletes any tournament
- **THEN** it and its photo are removed and no longer counted anywhere

### Requirement: Reading tournaments
The system SHALL let any member read a single tournament and list tournaments newest `playedOn` first, paginated, with participants and Final Hand Opponents shown by display name.

#### Scenario: Listing tournaments
- **WHEN** a member lists tournaments
- **THEN** results are ordered by `playedOn` descending, then `createdAt` descending, with a cursor for the next page

#### Scenario: Reading a missing tournament
- **WHEN** a member requests a tournament id that does not exist
- **THEN** the system responds 404

### Requirement: Guests are not recorded
The system SHALL store only group members as participants, winners and Final Hand Opponents, and SHALL hold no data about players without accounts.

#### Scenario: Guest-won tournament
- **WHEN** a tournament is won by someone without an account
- **THEN** it cannot be recorded, because the winner must be a member
