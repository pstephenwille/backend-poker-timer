# Rename the opponent column in one migration

`tournament_participants.is_opponent` is renamed to `is_final_hand_opponent` by a single `RENAME COLUMN` migration (`0005_final_hand_opponents.sql`), released together with contracts 1.0.0, so the database uses the domain's term "Final Hand Opponent" rather than "final-round opponents". This deliberately breaks the README's expand-then-contract rule. Migrations run before the new code is deployed, so for the minute or two in between, the running code can't read or record tournaments on that stage. We accept that because the group records tournaments only after a game ends and nobody depends on the API around the clock. A second release just to drop the old column wasn't worth it.

## Considered Options

- **Expand, then contract:** add `is_final_hand_opponent`, backfill it and write both columns, then drop `is_opponent` in a later release. No downtime, but it needs two releases and code that writes both columns in between.
- **Rename only in code:** keep the `is_opponent` column and map it to `isFinalHandOpponent` in Drizzle. No migration, but the old term stays in the database for anyone reading SQL.

## Consequences

Deploy this release when no game is being recorded. Later column renames should go back to expand-then-contract unless the same reasoning applies.
