# Tasks

## 1. Workspace scaffolding

- [ ] 1.1 Remove the IntelliJ Java module files (`.idea/*.iml`, `misc.xml` module config) and add `.gitignore` for Node/SST output; verify `git status` shows only intended changes
- [ ] 1.2 Create the pnpm workspace with `packages/contracts` and `packages/api`, Node 24, ESM, strict `tsconfig` base; verify `pnpm install` and `pnpm -r exec tsc --noEmit` succeed
- [ ] 1.3 Add Biome with a root config and `lint`/`format` scripts; verify `pnpm biome ci .` passes
- [ ] 1.4 Add Vitest with `unit` and `integration` projects and a Testcontainers Postgres `globalSetup`; verify a placeholder integration test connects to the container and passes

## 2. Contracts package

- [ ] 2.1 Define shared primitives in contracts: ids, `HandCategory` enum (ascending order), error envelope `{ error: { code, message, details? } }`, `SigninErrorCode` enum (`cancelled`, `expired`, `deactivated`, `failed`); verify unit tests cover enum ordering
- [ ] 2.2 Define user schemas (`Me`, `MemberSummary`, `MemberProfile` with stats, `UpdateMe` with username following Gmail rules — 6–30 `[A-Za-z0-9.]`, no leading/trailing/consecutive periods — or null); verify unit tests for each rule, including `mike.j` vs `mikej` being distinct
- [ ] 2.3 Define tournament schemas (`CreateTournament`, `UpdateTournament`, `Tournament`, paginated list) including cross-field rules: winner ∈ participants, ≥ 2 distinct participants, opponents distinct ⊂ participants minus winner, whole-dollar `pot` ≥ 0, `note` ≤ 500, `playedOn` required integer epoch millis ≤ now + 5 minutes; verify unit tests for every rule in `specs/tournament-records`, including missing, past, future and invalid `playedOn`
- [ ] 2.4 Define media schemas (upload grant, confirm, photo `{ status, url? }`) and `LeaderboardEntry`; verify they type-check
- [ ] 2.5 Add fixtures for users, tournaments and the leaderboard on a separate `./fixtures` export, plus a test that parses every fixture against its schema; verify the test fails when a fixture is deliberately broken
- [ ] 2.6 Configure the package build (`tsc` to ESM + `.d.ts`), `exports` map and GitHub Packages `publishConfig`; verify `pnpm pack` contains `dist/index.js` and `dist/fixtures.js` and that `index.js` has no fixture data

## 3. Database

- [ ] 3.1 Write the Drizzle schema for `groups`, `users`, `sessions`, `tournaments`, `tournament_participants`, `media` and the `winning_hand` enum per design.md, with `played_on` as `timestamptz`, the generated `username_lower` unique column, username `CHECK`, and `pot ≥ 0` check; verify `drizzle-kit generate` produces a migration
- [ ] 3.2 Add the initial migration seeding the single group, and a `db:migrate` script; verify migrating a fresh test container twice is idempotent
- [ ] 3.3 Create the `pg` pool/Drizzle client reading the connection string from the linked secret, reusing one pool per Lambda container; verify an integration test round-trips a row

## 4. Infrastructure (SST)

- [ ] 4.1 Add `sst.config.ts` (region `us-east-1`, `prod` protected/retained, domain as a stage parameter) with secrets `DatabaseUrl`, `GoogleClientId`, `GoogleClientSecret`, `SigninCookieKey`; verify `sst diff --stage <personal>` succeeds
- [ ] 4.2 Define the Cognito user pool, Google identity provider (email, name, picture), hosted domain, `admin` group and confidential app client with callback `https://<stage-host>/api/auth/callback` and sign-out URL; verify after deploy that the hosted flow offers only Google sign-in
- [ ] 4.3 Define the private media bucket (block public access, CORS POST from the app origin only, lifecycle expiring `uploads/` after 1 day); verify an unsigned GET of an object is denied
- [ ] 4.4 Define the HTTP API (no authorizer) with the Hono function, the frontend bucket, and the CloudFront router on the stage host routing `/api/*` to the API (no caching, cookies/headers/query forwarded) and everything else to the bucket with SPA fallback; export the frontend bucket name and distribution id; verify on a personal stage that a request to any `/api/...` path is answered by the Hono function (its default 404, not the bucket), that `/` and a deep path such as `/some/page` serve the placeholder `index.html`, and that the response to `/api/...` is not cached by CloudFront
- [ ] 4.5 Document first-time stage setup (buy domain in Route 53, Neon branch, `sst secret set`, Google OAuth redirect URI, frontend deploy using the exported bucket and distribution) in `README.md`; verify a fresh personal stage can be brought up by following it

## 5. API foundation

- [ ] 5.1 Create the Hono app under `/api` with the Lambda handler, zod validation returning 400 with field details, and a central error mapper producing the error envelope; verify integration tests for 400 and unknown-route 404 shapes
- [ ] 5.2 Add the CSRF middleware (non-safe methods require `Origin` equal to the stage origin, else 403; non-JSON bodies 415); verify integration tests for cross-site POST, missing `Origin`, form-encoded body and a valid same-origin POST

## 6. Auth layer

- [ ] 6.1 Implement session storage: create (256-bit random id, store SHA-256 hash, `is_admin`), look up with 30-day idle and 90-day absolute expiry, throttle `last_seen_at` updates to hourly, delete one or all of a user's sessions, delete all expired sessions during each successful sign-in; verify unit/integration tests for each expiry rule using a controllable clock, and that a sign-in removes another user's expired session
- [ ] 6.2 Implement the session middleware (read `__Host-session`, resolve `{ userId, isAdmin }`, 401 otherwise) with an explicit public-route list (`/api/leaderboard`, `/api/auth/login`, `/api/auth/callback`); verify a test that calls every registered route without a session, sending the app's `Origin` and a JSON body on non-safe methods so only the session check applies, and gets exactly 401 for all but the public list
- [ ] 6.3 Wrap `openid-client` behind an identity-provider port (authorization URL, code exchange + ID-token verification) with an in-memory fake issuing fixed claims; verify unit tests for the fake and a type-check of the Cognito adapter
- [ ] 6.4 Implement `GET /api/auth/login`: generate state/nonce/PKCE, sanitize `returnTo` to relative paths, set the encrypted `__Secure-signin` cookie (`Lax`, `Path=/api/auth`, 10 min) and redirect with `identity_provider=Google`; verify tests for cookie attributes, the redirect URL and an off-site `returnTo` falling back to `/`
- [ ] 6.5 Implement `GET /api/auth/callback`: validate and delete the sign-in cookie, check state, exchange code, verify claims, upsert the user into the seeded group, refuse deactivated users, create the session with `is_admin` from `cognito:groups`, set `__Host-session` (`HttpOnly`, `Secure`, `Strict`, no `Domain`) and redirect; on any failure delete the sign-in cookie, log the reason under the request id and `303`-redirect to `/?signinError=<code>&ref=<requestId>`; verify integration tests for first sign-in, concurrent first sign-ins creating one user, admin detection, and the redirect code for each failure: provider `access_denied` (`cancelled`), missing/expired/replayed sign-in cookie (`expired`), deactivated user (`deactivated`), state mismatch and verification error (`failed`)
- [ ] 6.6 Implement `POST /api/auth/logout` (delete session, expire cookie, return Cognito logout URL); verify the old cookie is rejected with 401 afterwards

## 7. Accounts and profiles

- [ ] 7.1 Implement the display-name resolver (username → Google name → email prefix); verify unit tests for all three fallbacks
- [ ] 7.2 Implement `GET /api/me` (includes own email) and `PATCH /api/me` (set/clear username, 409 on case-insensitive conflict); verify integration tests for each username scenario in `specs/user-profiles`
- [ ] 7.3 Implement `GET /api/members` (all members incl. deactivated, with active flag) and `GET /api/members/{id}` with derived stats (played, wins, win rate or null, winnings, hand breakdown); verify integration tests including the zero-tournament case and that no email appears
- [ ] 7.4 Implement admin `POST /api/admin/users/{id}/deactivate` (sets `deactivated_at`, deletes all sessions) and `/reactivate`; verify integration tests for non-admin 403, the deactivated user's next request returning 401, and reactivation allowing sign-in again

## 8. Tournament records

- [ ] 8.1 Implement `POST /api/tournaments`: schema validation, all participants must be existing group members (400 naming unknown ids), recorder ∈ participants (403), transactional insert of tournament and participant rows; verify integration tests for every validation scenario in `specs/tournament-records`
- [ ] 8.2 Implement `GET /api/tournaments/{id}` and cursor-paginated `GET /api/tournaments` ordered by `played_on` desc, `created_at` desc, with display names; verify integration tests for ordering, cursor continuation and 404
- [ ] 8.3 Implement `PATCH /api/tournaments/{id}` (recorder or admin, recorder must remain a participant, `updated_at` bumped) and `DELETE /api/tournaments/{id}` (removes participants and attached media); verify integration tests for 403 by non-recorder, admin success and stats no longer counting a deleted tournament

## 9. Media uploads

- [ ] 9.1 Define a storage port (presign POST, presign GET, head, delete) with an S3 adapter and an in-memory test implementation; verify unit tests for the in-memory implementation and type-check of the adapter
- [ ] 9.2 Implement upload-grant endpoints for tournament photos (recorder/admin) and avatars (self), creating `pending` media rows and presigned POSTs with type, 10 MB and 15-minute constraints; verify integration tests for authorization and grant contents
- [ ] 9.3 Implement confirm endpoints (verify object exists, attach, delete previously attached media) and `DELETE` for photo and avatar; verify integration tests for confirm, missing-upload 400, replacement and removal reverting avatar to Google's
- [ ] 9.4 Serialize media in responses as `{ status: "processing" }` or `{ status: "ready", url }` with 1-hour presigned GETs; verify integration tests for both states
- [ ] 9.5 Implement the processor Lambda: decode (sharp; HEIC via libheif-js), auto-rotate, resize ≤ 1600 px, encode WebP without metadata, write `display/`, mark `ready`, delete original; wire the S3 `uploads/` notification in SST; verify unit tests with JPEG-with-GPS and HEIC fixtures showing no EXIF in output and correct max dimension

## 10. Leaderboard

- [ ] 10.1 Implement the pure `rankLeaderboard` function (wins desc, newest-first hand sequence comparison, competition ranks, display-name order within ties, zero-win members sharing last rank); verify unit tests for every scenario in `specs/leaderboard`, including same-date recency by `created_at`
- [ ] 10.2 Implement public `GET /api/leaderboard` loading all members and wins in one query and returning `LeaderboardEntry` items (incl. deactivated members, signed avatar URLs, no emails); verify integration tests for access without a session and equality with the signed-in response

## 11. CI/CD

- [ ] 11.1 Add the PR gate workflow (pnpm, Node 24, `biome ci`, typecheck, unit + integration tests with Docker) and a `.github/pull_request_template.md` with a checklist item requiring migrations to be backwards compatible (expand/contract); verify it passes on a test PR and that the PR shows the checklist
- [ ] 11.2 Add the delivery workflow: OIDC AWS role, migrate + `sst deploy --stage dev` on `master`, then the `prod` environment with required reviewers running migrate + deploy; verify a merge deploys `dev` and waits for approval before `prod`
- [ ] 11.3 Add the contracts publish job that publishes to GitHub Packages only when the package version is new; verify an unchanged version skips publishing and a bumped version publishes

## 12. End-to-end verification

- [ ] 12.1 On the deployed `dev` stage, sign in with Google, confirm no token is readable from page scripts and the session cookie has the required attributes, record a tournament with a photo, sign out, and read the leaderboard anonymously; verify the photo is served via a signed URL without EXIF and the winner appears ranked correctly
- [ ] 12.2 Run `openspec validate add-mvp-backend --strict`, the full test suite and Biome; verify all pass

## Workflow follow-up

- Archive the change once implementation is reviewed and deployed to `prod`.
