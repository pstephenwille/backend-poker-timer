# Spec Delta

## Purpose

Gives each member a recognizable identity in the group and a summary of their tournament results, without exposing their email.

## ADDED Requirements

### Requirement: Optional unique username
The system SHALL let a user set, change or clear their username at any time, following Gmail's username rules: 6–30 letters, digits or periods, with no leading, trailing or consecutive periods. Usernames MUST be unique ignoring case; periods are significant.

#### Scenario: Setting an available username
- **WHEN** a user sets the username `Mike.AllIn` and no other user holds it in any letter case
- **THEN** the system saves it with the casing the user entered

#### Scenario: Username taken in different case
- **WHEN** a user sets `mike.allin` while another user holds `Mike.AllIn`
- **THEN** the system responds 409 stating the username is taken

#### Scenario: Periods distinguish usernames
- **WHEN** a user sets `mikeallin` while another user holds `mike.allin`
- **THEN** the system accepts it

#### Scenario: Invalid username format
- **WHEN** a user sets a username shorter than 6 or longer than 30 characters, containing characters other than letters, digits or periods, or with a leading, trailing or doubled period
- **THEN** the system responds 400 describing the allowed format

#### Scenario: Display fallback is not validated as a username
- **WHEN** a user without a username is shown by a fallback such as `Mike Jones` or `mike_j`
- **THEN** the fallback is displayed as is and no username rules apply to it

### Requirement: Display name fallback
The system SHALL show each user under a display name that is their username if set, otherwise their Google display name, otherwise the part of their email before the `@`.

#### Scenario: No username set
- **WHEN** a user with Google name "Mike Jones" has no username
- **THEN** every response shows them as "Mike Jones"

#### Scenario: No username and no Google name
- **WHEN** a user with email `mike.j@example.com` has neither a username nor a Google name
- **THEN** every response shows them as "mike.j"

### Requirement: Email privacy
The system SHALL NOT include any user's email address in responses to anyone other than that user.

#### Scenario: Viewing another member
- **WHEN** a member reads another member's profile, the member list, a tournament or the leaderboard
- **THEN** no email address appears in the response

#### Scenario: Viewing own profile
- **WHEN** a user reads their own profile
- **THEN** the response includes their own email

### Requirement: Avatar
The system SHALL show a user's uploaded avatar if they have one, otherwise their Google avatar, and SHALL let a user remove an uploaded avatar to revert to the Google one.

#### Scenario: Default avatar
- **WHEN** a user has not uploaded an avatar
- **THEN** their profile shows their Google avatar

#### Scenario: Removing an uploaded avatar
- **WHEN** a user removes their uploaded avatar
- **THEN** their profile shows their Google avatar again

### Requirement: Member list
The system SHALL let any member list all group members, including deactivated ones, with their display name, avatar and active status, so participants can be selected.

#### Scenario: Listing members
- **WHEN** a member requests the member list
- **THEN** the response includes every group member with display name, avatar and whether they are active

### Requirement: Derived player stats
The system SHALL compute each user's stats from recorded tournaments: tournaments played, wins, win rate, total winnings (sum of pots won) and a count of wins per winning hand category.

#### Scenario: Stats after recorded tournaments
- **GIVEN** a user participated in 4 recorded tournaments and won 1 with a Flush and a pot of $120
- **WHEN** any member reads that user's profile
- **THEN** it shows 4 played, 1 win, a 25% win rate, $120 total winnings and Flush: 1

#### Scenario: User with no tournaments
- **WHEN** a member reads the profile of a user who appears in no tournaments
- **THEN** it shows 0 played, 0 wins, no win rate, $0 winnings and an empty hand breakdown

#### Scenario: Tournament deleted
- **WHEN** a tournament is deleted
- **THEN** every affected user's stats no longer include it
