# Tasks

Work proceeds as a walking skeleton followed by vertical slices (see design.md, "Delivery"). Every slice ends with a slice check: Biome, `tsc --noEmit` and all tests pass, the work is merged to `master`, and — from slice 3 on — the pipeline deploys it to `dev`, where the slice's smoke check is run. Schemas, contracts, tables and infrastructure are added only in the slice that first needs them.

## 1. Local skeleton

- [x] 1.1 Remove the IntelliJ Java module files (`.idea/*.iml`, `misc.xml` module config) and add `.gitignore` for Node/SST output; verify `git status` shows only intended changes
- [x] 1.2 Create the pnpm workspace with only `packages/api`, Node 24, ESM, strict `tsconfig` base; add Biome (root config, `lint`/`format` scripts) and Vitest with `unit` and `integration` projects and one placeholder unit test; verify `pnpm install`, `pnpm -r exec tsc --noEmit`, `pnpm biome ci .` and `pnpm test` succeed
- [x] 1.3 Create the Hono app under `/api` with the Lambda handler, zod validation returning 400 with field details, and a central error mapper producing `{ error: { code, message, details? } }` (unknown routes → JSON 404); verify `app.request()` tests for the 400 and 404 shapes

## 2. Deployed skeleton

- [x] 2.1 Add `sst` pinned to an exact version and `sst.config.ts` (region `us-east-1`, no secrets yet) with one stage-settings function returning `domain` (optional, falling back to the default CloudFront host), `removal` and `protect` — `prod` retained and protected, `dev` retained, personal stages removed; verify unit tests of the stage-settings function for `prod`, `dev` and a personal stage, and that `sst diff --stage <personal>` succeeds
- [x] 2.2 Define the HTTP API (no authorizer) with the Hono function, the frontend bucket holding a placeholder `index.html`, and the CloudFront router routing `/api/*` to the API (no caching, cookies/headers/query forwarded) and everything else to the bucket with SPA fallback; export the frontend bucket name and distribution id; verify on a personal stage that a request to any `/api/...` path is answered by the Hono function (its JSON 404, not the bucket), that `/` and a deep path such as `/some/page` serve the placeholder `index.html`, and that the response to `/api/...` is not cached by CloudFront
- [x] 2.3 Create by hand an AWS Budgets alert at a small monthly amount (e.g. $10) emailing the account owner, and document it and bringing up a personal stage (`sst deploy --stage <name>`, the exported bucket and distribution, `sst remove` to tear it down) in `README.md`; verify the budget exists, a fresh personal stage can be brought up by following the README, and `sst remove` leaves no resources behind

## 3. Pipeline skeleton

- [x] 3.1 Add the PR gate workflow (pnpm, Node 24, `biome ci`, typecheck, unit + integration tests with Docker) and a `.github/pull_request_template.md` with a checklist item requiring migrations to be backwards compatible (expand/contract); verify it passes on a test PR and that the PR shows the checklist
- [x] 3.2 Create by hand, once per AWS account, the IAM OIDC identity provider for GitHub Actions and a deploy role whose trust policy admits only this repository, and document the steps in `README.md`; add the delivery workflow assuming that role and running `sst deploy --stage dev` on push to `master`; verify a merge deploys the skeleton to `dev`, the slice 2 smoke check passes there, and a workflow from another repository cannot assume the role

## 4. Database connectivity

- [x] 4.1 Create Neon branches for `dev` and the personal stage, add the `DatabaseUrl` secret to `sst.config.ts` linked to the API function, and create the `pg` pool/Drizzle client reading it, reusing one pool per Lambda container; add the Testcontainers Postgres `globalSetup` to the integration project; verify an integration test round-trips a row against the container
- [x] 4.2 Write the Drizzle schema for `groups` and `users` only (per design.md, with the generated `username_lower` unique column and username `CHECK`), the initial migration seeding the single group and a `db:migrate` script; run migrations in the delivery workflow before `sst deploy`; verify migrating a fresh container twice is idempotent and that a merge migrates `dev`
- [x] 4.3 Create `packages/contracts` with the error envelope, a minimal `LeaderboardEntry`, a separate `./fixtures` export with a leaderboard fixture, and a test parsing every fixture against its schema; switch the API's error envelope to the contracts schema; verify the fixture test fails when a fixture is deliberately broken
- [x] 4.4 Implement public `GET /api/leaderboard` returning every member with zero stats (no tournaments yet), no emails; verify integration tests for access without a session, and on `dev` that it returns `[]` read from Neon and then the row after one is inserted by hand

## 5. Sessions and request protection

- [x] 5.1 Add the `sessions` table and session storage: create (256-bit random id, store SHA-256 hash, `is_admin`), look up with 30-day idle and 90-day absolute expiry, throttle `last_seen_at` updates to hourly, delete one or all of a user's sessions, delete all expired sessions (called during each successful sign-in); verify unit/integration tests for each expiry rule using a controllable clock, and that the cleanup removes another user's expired session
- [x] 5.2 Implement the session middleware (read `__Host-session`, resolve `{ userId, isAdmin }`, 401 otherwise) with an explicit public-route list (`/api/leaderboard`, `/api/auth/login`, `/api/auth/callback`); verify a test that calls every registered route without a session, sending the app's `Origin` and a JSON body on non-safe methods so only the session check applies, and gets exactly 401 for all but the public list
- [x] 5.3 Add the CSRF middleware (non-safe methods require `Origin` equal to the stage origin, else 403; non-JSON bodies 415); verify integration tests for cross-site POST, missing `Origin`, form-encoded body and a valid same-origin POST
- [x] 5.4 Add the `Me` schema to contracts and implement `GET /api/me` (includes own email); verify an integration test authenticating with an inserted session row

## 6. Google sign-in

- [x] 6.1 Add the `SigninErrorCode` enum (`cancelled`, `expired`, `deactivated`, `failed`) to contracts; define the Cognito user pool, Google identity provider (email, name, picture), hosted domain, `admin` group and confidential app client with callback `https://<stage-host>/api/auth/callback` and sign-out URL, plus secrets `GoogleClientId`, `GoogleClientSecret` and `SigninCookieKey`; verify after deploy that the hosted flow offers only Google sign-in
- [x] 6.2 Wrap `openid-client` behind an identity-provider port (authorization URL, code exchange + ID-token verification) with an in-memory fake issuing fixed claims; verify unit tests for the fake and a type-check of the Cognito adapter
- [x] 6.3 Implement `GET /api/auth/login`: generate state/nonce/PKCE, sanitize `returnTo` to relative paths, set the encrypted `__Secure-signin` cookie (`Lax`, `Path=/api/auth`, 10 min) and redirect with `identity_provider=Google`; verify tests for cookie attributes, the redirect URL and an off-site `returnTo` falling back to `/`
- [x] 6.4 Implement `GET /api/auth/callback`: validate and delete the sign-in cookie, check state, exchange code, verify claims, upsert the user into the seeded group, refuse deactivated users, delete expired sessions, create the session with `is_admin` from `cognito:groups`, set `__Host-session` (`HttpOnly`, `Secure`, `Strict`, no `Domain`) and redirect; on any failure delete the sign-in cookie, log the reason under the request id and `303`-redirect to `/?signinError=<code>&ref=<requestId>`; verify integration tests for first sign-in, concurrent first sign-ins creating one user, admin detection, and the redirect code for each failure: provider `access_denied` (`cancelled`), missing/expired/replayed sign-in cookie (`expired`), deactivated user (`deactivated`), state mismatch and verification error (`failed`)
- [x] 6.5 Implement `POST /api/auth/logout` (delete session, expire cookie, return Cognito logout URL); verify the old cookie is rejected with 401 afterwards
- [x] 6.6 Add the stage's Cognito redirect URI to the Google OAuth client and document it in `README.md`; on `dev`, sign in with Google, confirm `/api/me` returns you, no token is readable from page scripts, the session cookie has the required attributes and you appear on the leaderboard, then sign out and confirm `/api/me` returns 401

## 7. Profiles and members

- [x] 7.1 Implement the display-name resolver (username → Google name → email prefix); verify unit tests for all three fallbacks
- [x] 7.2 Add `UpdateMe` to contracts (username following Gmail rules — 6–30 `[A-Za-z0-9.]`, no leading/trailing/consecutive periods — or null) and implement `PATCH /api/me` (set/clear username, 409 on case-insensitive conflict); verify unit tests for each format rule, including `mike.j` vs `mikej` being distinct, and integration tests for each username scenario in `specs/user-profiles`
- [x] 7.3 Add `MemberSummary` and a `MemberProfile` without stats to contracts, with user fixtures, and implement `GET /api/members` (all members incl. deactivated, with active flag) and `GET /api/members/{id}`; verify integration tests that no email appears and, on `dev`, that your username change shows on the leaderboard

## 8. Record and read tournaments

- [x] 8.1 Add the `HandCategory` enum (ascending order) and tournament schemas (`CreateTournament`, `UpdateTournament`, `Tournament`, paginated list) with fixtures to contracts, including cross-field rules: winner ∈ participants, ≥ 2 distinct participants, Final Hand Opponents distinct ⊂ participants minus winner, whole-dollar `pot` ≥ 0, `note` ≤ 500, `playedOn` required integer epoch millis ≤ now + 5 minutes; verify unit tests for enum ordering and every rule in `specs/tournament-records`, including missing, past, future and invalid `playedOn`
- [x] 8.2 Add the `winning_hand` enum, `tournaments` (with `played_on` as `timestamptz` and the `pot ≥ 0` check) and `tournament_participants` tables in a new migration; verify `drizzle-kit generate` produces it and it applies on top of the slice 4 migration
- [x] 8.3 Implement `POST /api/tournaments`: schema validation, all participants must be existing group members (400 naming unknown ids), recorder ∈ participants (403), transactional insert of tournament and participant rows; verify integration tests for every validation scenario in `specs/tournament-records`
- [x] 8.4 Implement `GET /api/tournaments/{id}` and cursor-paginated `GET /api/tournaments` ordered by `played_on` desc, `created_at` desc, with display names; verify integration tests for ordering, cursor continuation and 404, and on `dev` record a tournament with `curl` (session cookie and `Origin`) and read it back

## 9. Rankings and stats

- [x] 9.1 Implement the pure `rankLeaderboard` function (wins desc, newest-first hand sequence comparison, competition ranks, display-name order within ties, zero-win members sharing last rank); verify unit tests for every scenario in `specs/leaderboard`, including same-date recency by `created_at`
- [x] 9.2 Complete `LeaderboardEntry` and wire `GET /api/leaderboard` to load all members and wins in one query and rank them with `rankLeaderboard` (incl. deactivated members, no emails); verify integration tests for ranking and equality of anonymous and signed-in responses, and on `dev` that the slice 8 winner is ranked first
- [x] 9.3 Add derived stats to `MemberProfile` and `GET /api/members/{id}` (played, wins, win rate or null, winnings, hand breakdown); verify integration tests including the zero-tournament case

## 10. Editing, deleting and admin

- [x] 10.1 Implement `PATCH /api/tournaments/{id}` (recorder or admin, recorder must remain a participant, `updated_at` bumped) and `DELETE /api/tournaments/{id}` (removes participants and any attached media); verify integration tests for 403 by non-recorder, admin success and stats no longer counting a deleted tournament
- [x] 10.2 Implement admin `POST /api/admin/users/{id}/deactivate` (sets `deactivated_at`, deletes all sessions) and `/reactivate`; verify integration tests for non-admin 403, the deactivated user's next request returning 401 and reactivation allowing sign-in again, and on `dev` that a deactivated test account gets `signinError=deactivated`

## 11. Tournament photos

- [x] 11.1 Define the private media bucket (block public access, CORS POST from the app origin only, lifecycle expiring `uploads/` after 1 day) and the `media` table migration; verify an unsigned GET of an object is denied
- [x] 11.2 Define a storage port (presign POST, presign GET, head, delete) with an S3 adapter and an in-memory test implementation; verify unit tests for the in-memory implementation and type-check of the adapter
- [x] 11.3 Add media schemas (upload grant, confirm, photo `{ status, url? }`) to contracts and implement the tournament photo upload grant (recorder/admin, `pending` media row, presigned POST with type, 10 MB and 15-minute constraints), confirm (verify object exists, attach, delete previously attached media) and `DELETE`, serializing photos as `{ status: "processing" }` or `{ status: "ready", url }` with 1-hour presigned GETs; verify integration tests for authorization, grant contents, confirm, missing-upload 400, replacement and both serialization states, and on `dev` that an upload is confirmed and shows as `processing`
- [x] 11.4 Implement the processor Lambda: decode (sharp; HEIC via libheif-js), auto-rotate, resize ≤ 1600 px, encode WebP without metadata, write `display/`, mark `ready`, delete original; wire the S3 `uploads/` notification in SST; verify unit tests with JPEG-with-GPS and HEIC fixtures showing no EXIF in output and correct max dimension, and on `dev` that the slice 11.3 photo becomes `ready` with a signed URL serving a WebP without EXIF

## 12. Avatars

- [x] 12.1 Implement the avatar upload grant (self), confirm and `DELETE /api/me/avatar` on the slice 11 media pipeline, and show uploaded avatars (signed URLs) or the Google avatar in `Me`, members and the leaderboard; verify integration tests for authorization, replacement and removal reverting to the Google avatar, and on `dev` that an uploaded avatar appears on the anonymous leaderboard

## 13. Contracts publishing

- [x] 13.1 Configure the contracts package build (`tsc` to ESM + `.d.ts`), `exports` map and GitHub Packages `publishConfig`; verify `pnpm pack` contains `dist/index.js` and `dist/fixtures.js` and that `index.js` has no fixture data
- [x] 13.2 Add the contracts publish job that publishes to GitHub Packages only when the package version is new; verify an unchanged version skips publishing and a bumped version publishes

## 14. Custom domain and production

- [ ] 14.1 Once the domain is bought and hosted in Route 53, set the stage domain parameters (`<domain>` for `prod`, `dev.<domain>` for `dev`, `<name>.dev.<domain>` for personal stages) so SST creates the ACM certificates, DNS records and Cognito callback URLs; finish the first-time stage setup in `README.md` (Route 53, Neon branch, `sst secret set`, Google OAuth redirect URI, frontend deploy); verify `dev` serves on `dev.<domain>` and Google sign-in still works there
- [x] 14.2 Add the `prod` GitHub environment with required reviewers to the delivery workflow, running migrations against `prod` and `sst deploy --stage prod`; verify a merge deploys `dev` and waits for approval before `prod`
- [ ] 14.3 On `prod`, sign in with Google, confirm no token is readable from page scripts and the session cookie has the required attributes, record a tournament with a photo, sign out and read the leaderboard anonymously; verify the photo is served via a signed URL without EXIF and the winner appears ranked correctly (deferred until the frontend is built, so it runs through the real UI)
- [x] 14.4 Run `openspec validate add-mvp-backend --strict`, the full test suite and Biome; verify all pass

## 15. Follow-ups

- [x] 15.1 Process avatars to a display variant of at most 512 px on the longest side, keeping 1600 px for tournament photos; verify a unit test for the avatar size and, on `dev`, that a new avatar is served at no more than 512 px
- [x] 15.2 Refuse an admin's request to deactivate their own account with 400 `cannot_deactivate_self`; verify an integration test that the account stays active and its session still works

## 16. Domain language and ranking (contracts 1.0.0)

- [x] 16.1 Rename `opponentIds` to `finalHandOpponentIds` in contracts, API and fixtures, and the `is_opponent` column to `is_final_hand_opponent` in one migration (`docs/adr/0001-rename-opponent-column-in-one-migration.md`); verify unit tests for the renamed rules and integration tests for storing and editing Final Hand Opponents
- [x] 16.2 Break full ties in `rankLeaderboard` by the most recent win (`playedOn`, then `createdAt`, then tournament id), giving every member with a win their own rank; verify unit tests for alternating identical winners, distinct ranks and the id tie-break, and an integration test for the most recent winner ranking first
- [x] 16.3 Add `lastWonAt` (the `playedOn` of the latest win, or null) to `LeaderboardEntry` and its fixture, and publish contracts `1.0.0`; verify unit tests for `lastWonAt` and the integration test of entry fields

## Workflow follow-up

- Archive the change once implementation is reviewed and deployed to `prod`.
