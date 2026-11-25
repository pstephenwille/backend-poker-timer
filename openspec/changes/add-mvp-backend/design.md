# Design

## Context

The repository is empty apart from an IntelliJ Java module stub. The frontend (`react-poker-timer`, Vite + React 19 + TypeScript) has no API client, persistence, auth or hosting. The author's other backend (`go-game-be`) uses Fastify on Lambda via Serverless Framework, DynamoDB and an unenforced Cognito + Google pool; this design deliberately departs from it (see Decisions) while keeping AWS, Cognito with Google, Vitest, and the PR-gate → dev → approved-prod pipeline shape. Requirements live in the six spec deltas; motivation in proposal.md.

Scale is one group of friends: tens of users and a few tournaments a week. Simplicity and low idle cost outweigh throughput.

## Goals / Non-Goals

**Goals:**
- A single deployable API whose behavior is fully covered by fast integration tests against a real Postgres.
- No identity-provider tokens ever reach the browser; the backend's auth layer owns sign-in and sessions.
- One schema source shared by request validation, response validation and the frontend.
- Infrastructure fully defined in TypeScript and reproducible per stage.

**Non-Goals:**
- Multi-group isolation logic (the `group_id` column exists; no API selects or switches groups).
- A token path for native mobile or TV clients.
- Caching, read replicas or precomputed leaderboard tables.
- Frontend work beyond providing its hosting bucket.

## Decisions

### Repository layout: pnpm workspace
```
sst.config.ts            infra for all stages
packages/contracts/      zod schemas + fixtures, published to GitHub Packages
packages/api/            Hono app, auth layer, Drizzle schema/migrations, Lambda handlers
```
*Alternative*: monorepo including the frontend — rejected in favor of a published package.

### Infrastructure: SST v4 in `us-east-1`
Resources: a `Router` (CloudFront) on the custom domain, an `ApiGatewayV2` with no authorizer, one Hono `Function`, one image-processor `Function`, a private media `Bucket`, a frontend `Bucket`, and a `CognitoUserPool` with a Google identity provider, an `admin` group, a hosted domain and a **confidential** app client (client secret, authorization-code grant, callback `https://<stage-host>/api/auth/callback`). Secrets per stage via `sst secret`: `DatabaseUrl`, `GoogleClientId`, `GoogleClientSecret`, `SigninCookieKey` (encrypts the sign-in cookie). The Cognito client secret is linked from the pool resource, not stored by hand. Resources are linked to functions so code reads names via `Resource.*` instead of hand-wired env vars.

Stage differences live in one function at the top of `sst.config.ts` that returns a plain settings object (`domain`, `removal`, `protect`) for `prod`, `dev` or a personal stage; resources read that object instead of testing `$app.stage` themselves. `prod` uses `removal: "retain"` and `protect: true`; `dev` retains; personal stages use `removal: "remove"` so `sst remove` leaves nothing behind. The SST version is pinned exactly in `package.json` and upgraded deliberately, because provider updates can change the deployed diff. Each AWS account has an AWS Budgets alert at a small monthly amount that emails the owner, created by hand alongside the OIDC deploy role because it is account-level rather than per stage.
*Alternative*: Serverless Framework v4 (as in go-game-be) — YAML, no type-safe resource linking, and a weaker local loop than `sst dev`.

### Hosting: single origin through CloudFront
`<domain>` (prod) and `dev.<domain>` (dev) each front one CloudFront distribution: `/api/*` → API Gateway (no caching, all headers, cookies and query strings forwarded), everything else → the frontend bucket with SPA fallback to `index.html`. The domain is to be purchased; Route 53 hosting lets SST create the ACM certificate and DNS records. Personal stages use `<name>.dev.<domain>`. Until the domain is bought, every stage runs on its distribution's default `*.cloudfront.net` host, which already provides HTTPS, host-only `__Host-` cookies and a valid Cognito callback, so nothing waits on the purchase except the move to custom hostnames. The frontend repository's CI uploads its build to the stage's frontend bucket and invalidates CloudFront; this repo exports the bucket name and distribution id.
*Why same origin*: the standard layout for cookie sessions — host-only `__Host-` cookies with `SameSite=Strict`, no CORS, and the frontend calls plain `/api/...`.
*Alternative*: `app.` and `api.` subdomains — also same-site, but needs credentialed CORS and two hostnames.

### HTTP layer: Hono on a single Lambda
One function serves all `/api/*` routes via `hono/aws-lambda`. Routing, zod validation (`@hono/zod-validator`), the auth middleware and error mapping live in the app; tests call `app.request()` with no server.
*Alternatives*: Fastify (plugin/lifecycle machinery unused at ~20 routes, needs an adapter); one plain Lambda per route (hand-rolled wrapper, fake events in every test).

### Auth layer: Cognito-brokered OIDC with server-side sessions
The backend is a confidential OIDC client of Cognito, which federates to Google (Google's own page handles any identifier the user's Google account allows, including phone number). The OIDC protocol work — authorization URL, PKCE, state and nonce, code exchange, ID-token verification against Cognito's JWKS — uses `openid-client` (a certified implementation); nothing in the protocol is hand-written.

Flow:
1. `GET /api/auth/login?returnTo=` generates `state`, `nonce` and a PKCE verifier, stores them with the sanitized `returnTo` (relative paths only) in an encrypted, signed sign-in cookie `__Secure-signin` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`, 10-minute max-age; it cannot use the `__Host-` prefix because that prefix requires `Path=/`), and redirects to Cognito's authorize endpoint with `identity_provider=Google`.
2. `GET /api/auth/callback` reads and deletes the sign-in cookie, checks `state`, exchanges the code with the client secret, and verifies the ID token (issuer, audience, expiry, nonce). It upserts the user from `sub`, `email`, `name`, `picture` (`INSERT … ON CONFLICT (cognito_sub) DO UPDATE`), rejects deactivated users, creates a session with `is_admin` from `cognito:groups`, sets the session cookie and redirects to `returnTo`. Cognito tokens are discarded. Every failure (provider `access_denied`, missing/expired/replayed sign-in cookie, state mismatch, exchange or verification error, deactivated user) deletes the sign-in cookie and `303`-redirects to `/?signinError=<SigninErrorCode>&ref=<requestId>`; the detailed reason is logged under the request id and never placed in the URL, so the React app shows its own message for a known code and phishing text cannot be injected.
3. `POST /api/auth/logout` deletes the session row, expires the cookie and returns the Cognito `/logout` URL for the browser to visit.

The sign-in cookie must be `Lax`, not `Strict`: the callback is a top-level navigation initiated from Cognito's domain, which the browser treats as cross-site, so a `Strict` cookie would not be sent. A server-only `state` store would avoid the cookie but lose the binding to the initiating browser (login CSRF).

Session middleware on every non-public route: read `__Host-session`, hash it, load the active session joined to the user, enforce idle (30 days since `last_seen_at`) and absolute (90 days since `created_at`) expiry, update `last_seen_at` at most once per hour to limit writes, and expose `{ userId, isAdmin }`. Public routes: `GET /api/leaderboard`, `GET /api/auth/login`, `GET /api/auth/callback`.

CSRF middleware on every non-`GET`/`HEAD`/`OPTIONS` request: `Origin` must equal the stage's origin, and bodies must be `application/json` (else 415). No CSRF tokens: same origin, `Strict` session cookies and the `Origin` check already block cross-site writes.

Admin changes take effect at the next sign-in, because `is_admin` is captured on the session. Deactivation deletes all of the user's sessions.
*Alternatives*: browser PKCE with bearer tokens and an API Gateway JWT authorizer (tokens readable by scripts; rejected for security); Google directly without Cognito (loses the broker for future providers and admin groups); Better Auth (judged too heavy for this app).

### Database: Neon Postgres via `pg` + Drizzle
Drizzle with the `node-postgres` driver over TCP to Neon's pooled endpoint — the same driver works against the test container and production. Migrations are generated by `drizzle-kit generate` and committed. One Neon project; branches `prod`, `dev` and one per developer stage, created manually once; each branch's connection string is the stage's `DatabaseUrl` secret.
*Alternative*: DynamoDB (as in go-game-be) — the hand-history tie-break, per-user stats, participant joins and session lookups are trivial in SQL and awkward in single-table design.

### Data model
- `groups(id, name)` — one row seeded by the initial migration.
- `users(id uuid, group_id, cognito_sub unique, email, google_name, google_avatar_url, username, username_lower unique, avatar_media_id null, deactivated_at null, created_at)`. `username_lower` is a generated column enforcing case-insensitive uniqueness; periods are kept, so `mike.j` and `mikej` are distinct. Username format follows Gmail's published rules (6–30 letters, digits, periods; no leading, trailing or consecutive periods), validated in the contracts schema and backed by a `CHECK` constraint.
- `sessions(id_hash bytea primary key, user_id, is_admin, created_at, last_seen_at)` — only the SHA-256 of the 256-bit random session identifier is stored, so a database leak cannot be replayed as sessions. Expired rows are deleted on access, and every successful sign-in also deletes all expired sessions, so no scheduled job is needed.
- `tournaments(id uuid, group_id, played_on timestamptz, winner_id, winning_hand, pot integer check ≥ 0, note varchar(500) null, photo_media_id null, recorded_by_id, created_at, updated_at)`.
- `tournament_participants(tournament_id, user_id, is_final_hand_opponent bool)`, primary key `(tournament_id, user_id)`; the winner is a participant row with `is_final_hand_opponent = false`.
- `media(id uuid, owner_user_id, kind 'tournament_photo'|'avatar', upload_key, display_key null, status 'pending'|'ready', created_at)`.
- `playedOn` travels as epoch milliseconds and is stored as a UTC instant. The server compares it only to its own clock (5-minute drift tolerance) and never reasons about time zones; clients localize it for display and, for a picked past date, send that day's local noon so viewers a few zones away still see the same date.
- `winning_hand` is a Postgres enum in ascending order (`high_card` … `royal_flush`), so enum ordering is hand strength.

Cross-field rules (winner ∈ participants, Final Hand Opponents ⊂ participants \ {winner}) are enforced in the zod schemas and the service layer inside one transaction. The recorder need not be a participant: the participant checkboxes are the only record of who played, so requiring the recorder among them verified nothing and only stopped a host who sat a game out from recording it.

### API surface
All paths are under `/api`.

| Method & path | Access |
|---|---|
| `GET /auth/login`, `GET /auth/callback` | public |
| `POST /auth/logout` | session |
| `GET /leaderboard` | public |
| `GET /me`, `PATCH /me` (username set/clear) | session |
| `POST /me/avatar/uploads`, `POST /me/avatar` (confirm), `DELETE /me/avatar` | session |
| `GET /members`, `GET /members/{id}` (profile + stats) | session |
| `POST /tournaments`, `GET /tournaments?cursor=`, `GET /tournaments/{id}` | session |
| `PATCH /tournaments/{id}`, `DELETE /tournaments/{id}` | recorder or admin |
| `POST /tournaments/{id}/photo/uploads`, `POST /tournaments/{id}/photo`, `DELETE /tournaments/{id}/photo` | recorder or admin |
| `POST /admin/users/{id}/deactivate`, `POST /admin/users/{id}/reactivate` | admin |

Errors use one JSON shape `{ error: { code, message, details? } }` defined in contracts. List pagination uses an opaque cursor encoding `(played_on, created_at, id)`.

### Leaderboard: computed per request in a pure function
The handler loads every member plus their wins (`id`, `played_on`, `created_at`, `winning_hand`) in one query and passes them to a pure `rankLeaderboard` function that sorts by win count, then lexicographically by the win hands ordered newest first, then by the most recent win. No two members can win the same tournament, so every member with a win gets their own rank; members with no wins share the last rank, ordered by display name. At this scale it is a single small query; the pure function is unit-tested exhaustively without a database.
*Alternative*: SQL window functions over arrays of hand ranks — possible but much harder to read and test.

### Photos: presigned POST → processor Lambda
1. `…/uploads` checks authorization, creates a `media` row (`pending`) and returns an S3 presigned POST for `uploads/{mediaId}` with `content-length-range` ≤ 10 MB, an exact `Content-Type` condition from the allowed set, and a 15-minute expiry. The media bucket allows CORS POST from the app origin only.
2. An S3 `ObjectCreated` notification on `uploads/` triggers the processor: decode (HEIC via `libheif-js` WASM, others via `sharp`), auto-rotate, resize to ≤ 1600 px (≤ 512 px for an avatar), re-encode as WebP without metadata, write `display/{mediaId}.webp`, set the media row `ready`, then delete the original.
3. The confirm endpoint `HeadObject`s the upload or display key, attaches the media to the tournament or user, and deletes the previously attached media's objects and row.

Reads issue presigned GET URLs (1-hour expiry) for `ready` media only. A bucket lifecycle rule expires `uploads/` objects after 1 day so abandoned originals (which may contain GPS data) do not persist.
*Alternative*: proxy uploads through the API — Lambda's 6 MB payload limit and base64 overhead make 10 MB photos impossible.

### Contracts package
`@<github-owner>/poker-timer-contracts` built with `tsc` to ESM + declarations, `exports` `{ ".": …, "./fixtures": … }`. The API imports schemas from the workspace package, so request validation, response validation (in tests) and published types cannot diverge. A contracts test parses every fixture against its schema.

### Testing baseline
Vitest with two projects: `unit` (pure functions such as `rankLeaderboard`, schema rules, `returnTo` sanitizing) and `integration` (`app.request()` against a Postgres started by Testcontainers in `globalSetup`, migrations applied once, tables truncated between tests). Tests authenticate by inserting a session row and sending its cookie with the app origin. The OIDC client and S3 sit behind small ports with in-memory implementations, so the callback is tested with a fake provider issuing fixed claims; the real Cognito round trip and S3 adapter are verified on the deployed `dev` stage. Full strategy beyond this baseline remains open (see Open Questions).
*Alternative*: docker-compose service as in go-game-be — Testcontainers needs no separately started services and isolates CI runs.

### Tooling
Biome for lint and format, `tsc --noEmit` per package, Node 24, arm64 Lambdas, ESM throughout.

### CI/CD (GitHub Actions)
- **PR gate** (`pull_request`): install, `biome ci`, typecheck, unit + integration tests.
- **Deliver** (`push` to `master`): run Drizzle migrations against `dev`, `sst deploy --stage dev`; then a `prod` GitHub environment with required reviewers runs migrations against `prod` and `sst deploy --stage prod`. AWS access via an OIDC deploy role created by hand once per account (documented in the README, trust limited to this repository), since the pipeline cannot create the role it signs in with; the Neon connection string and SST secrets come from environment secrets.
- **Publish contracts**: when `packages/contracts/package.json`'s version differs from the latest published version, publish to GitHub Packages.

### Delivery: walking skeleton, then vertical slices
Connectivity is proven before any layer is built out. A trivial request first runs locally, then through a deployed stage (CloudFront → API Gateway → Lambda), then through the pipeline, then to Neon, then behind a real Google sign-in. Features follow as thin slices (profiles, tournaments, rankings, editing and admin, photos, avatars), each merged, deployed to `dev` by the pipeline and smoke-checked there before the next starts. Tables, contract schemas and infrastructure are added in the slice that first needs them, so each migration is small and every failure points at the latest slice. The custom domain, contracts publishing and `prod` come last.
*Alternative*: layer by layer (full contracts, full schema, all infrastructure, then features) — nothing runs end to end until the final step, so integration failures surface late and cascade back through every layer.

## Risks / Trade-offs

- [Migrations run before new code; old code briefly runs against the new schema] → Every migration must be backwards compatible (expand, then contract in a later release); called out in the PR template.
- [HEIC decoding is not in `sharp`'s prebuilt binaries] → Use `libheif-js` WASM for HEIC only; covered by a processor test with a HEIC fixture.
- [A route accidentally left public] → Routes are public only by explicit listing; an integration test calls every registered route without a session and asserts 401 for all but the public list.
- [Admin revocation lags until the next sign-in] → Acceptable for one group; deactivation (which deletes sessions) is the immediate lever.
- [Session lookup on every request adds a database round trip] → One indexed primary-key read per request, on a connection the request already needs.
- [Anyone with a Google account who finds the site can join the group] → Accepted per product decision; admins deactivate abusers.
- [Public leaderboard exposes names, avatars and winnings] → Accepted per product decision; emails are never included; signed avatar URLs expire.
- [Domain not yet purchased] → Stages are parameterized by an optional domain and fall back to the default CloudFront host, so only the custom-domain and `prod` slice waits on the purchase.
- [Neon free-tier compute suspends when idle, adding cold-start latency] → Acceptable for this usage; upgrade the plan if it becomes noticeable.
- [Leaderboard recomputed on every read] → Trivial at tens of users; revisit only with multi-group growth.

## Migration Plan

Greenfield; no data to migrate. First deploy order per stage: create the Neon branch → set SST secrets → run migrations (creates and seeds the group) → `sst deploy` on the default CloudFront host → add the stage's Cognito domain redirect URI to the Google OAuth client. Once the domain is bought and hosted in Route 53, set the stage's domain parameter and redeploy; SST then creates the certificate and DNS records and the Cognito callback URLs follow the new host. Rollback: redeploy the previous commit; migrations are backwards compatible, so no schema rollback is needed.

## Open Questions

- Testing strategy beyond the baseline above (for example, smoke tests against the deployed `dev` stage after delivery) — deferred by the user; it adds tests but does not change specs or architecture.
- GitHub owner/scope name for the contracts package — needed at first publish only.
- The domain name — needed before `prod` (the custom-domain slice); until then stages use the default CloudFront host.
