# Spec Delta

## Purpose

Ranks every group member by tournament wins so the group can see who is on top, publicly and without sign-in.

## ADDED Requirements

### Requirement: Every member is ranked
The leaderboard SHALL list every group member, including deactivated members and members with zero wins, computed from the recorded tournaments at read time.

#### Scenario: Member with no wins
- **WHEN** the leaderboard is read and a member has never won
- **THEN** that member appears on it with 0 wins

#### Scenario: Deactivated member
- **WHEN** a member with wins is deactivated
- **THEN** they keep their place on the leaderboard

### Requirement: Ranking by total wins
The leaderboard SHALL order members by total tournament wins, highest first.

#### Scenario: Different win counts
- **WHEN** Ann has 5 wins and Bob has 3
- **THEN** Ann is ranked above Bob

### Requirement: Hand-history tie-break
Members with equal wins SHALL be ordered by comparing their winning hands from most recent win backwards, as if those hands were played against each other; the first differing category decides, higher category ranking higher.

#### Scenario: Latest hands differ
- **GIVEN** Ann and Bob each have 3 wins, Ann's latest with a Full House and Bob's latest with a Flush
- **WHEN** the leaderboard is read
- **THEN** Ann is ranked above Bob

#### Scenario: Latest hands match, earlier hands differ
- **GIVEN** Ann and Bob each have 3 wins, both latest with a Flush, Ann's second-latest a Straight and Bob's second-latest a Pair
- **WHEN** the leaderboard is read
- **THEN** Ann is ranked above Bob

#### Scenario: Recency is by tournament date
- **WHEN** a member's wins are compared for the tie-break
- **THEN** "most recent" means latest `playedOn`, then latest `createdAt` for wins on the same date

### Requirement: Shared ranks
Members whose wins and entire winning-hand history are identical, including all members with zero wins, SHALL share a rank, and the next rank SHALL skip accordingly.

#### Scenario: Full tie
- **GIVEN** Ann and Bob each have 2 wins with identical hand sequences, and two members rank above them
- **WHEN** the leaderboard is read
- **THEN** both are shown at rank 3, the next member is rank 5, and tied members are listed by display name

#### Scenario: Zero-win members
- **WHEN** several members have 0 wins
- **THEN** they all share the last rank

### Requirement: Leaderboard entry content
Each entry SHALL show rank, display name, avatar, wins, tournaments played, win rate, total winnings and the latest winning hand, and SHALL NOT include email addresses.

#### Scenario: Entry fields
- **WHEN** the leaderboard is read
- **THEN** each entry includes exactly those fields, with no email

### Requirement: Public read access
The leaderboard SHALL be readable without sign-in and SHALL return the same content to anonymous and signed-in callers.

#### Scenario: Anonymous read
- **WHEN** a client without a session reads the leaderboard
- **THEN** the system responds 200 with the same entries a signed-in member receives
