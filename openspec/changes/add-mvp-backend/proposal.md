# Proposal

## Why

`react-poker-timer` is a browser-only blind clock: it has no users, no persistence, and no record of who wins. A group of friends who play in-person home tournaments wants to sign in, log each tournament's winner, and compete on a shared leaderboard. This greenfield backend provides that for a single group as the MVP.

## What Changes

- New TypeScript backend replacing the empty IntelliJ Java module scaffold in this repository.
- A backend auth layer: Google sign-in brokered by a dedicated Cognito user pool, with the backend holding server-side sessions and giving the browser only an `HttpOnly` session cookie (no tokens in the browser). Every signed-in user is automatically a member of the single group. Guests (players without accounts) are never stored.
- Single-origin hosting: one CloudFront distribution on a custom domain serves the frontend and routes `/api/*` to the backend.
- User profiles with an optional unique username, a privacy-preserving display-name fallback, an optional avatar, and derived stats.
- Tournament records: date, participants, winner, winning hand category, pot (whole dollars), optional Final Hand Opponents, note and photo. Any member may record, whether or not they played; only the recorder or an admin may edit or delete.
- Private photo storage with presigned uploads, EXIF stripping and a resized display variant.
- A computed leaderboard ranked by total wins with a hand-history tie-break and then the most recent win, readable publicly without sign-in.
- Admin deactivation of accounts (blocks sign-in only; history and leaderboard placement are kept).
- A versioned contracts package (zod schemas plus schema-validated fixtures) published to GitHub Packages for the frontend.
- Infrastructure-as-code, per-stage environments (personal, `dev`, `prod`), and CI/CD with a PR gate and gated production deploys.

## Capabilities

### New Capabilities

- `user-accounts`: The auth layer (sign-in, sessions, sign-out, cross-site request protection), account provisioning at sign-in, automatic membership in the single group, admin role, and account deactivation.
- `user-profiles`: Username, display-name fallback, avatar, email privacy, and per-user derived stats.
- `tournament-records`: Recording, reading, editing and deleting tournaments, including field validation and recorder/admin authorization.
- `media-uploads`: Authorized photo and avatar uploads, metadata stripping, display variants, and time-limited private access.
- `leaderboard`: Ranking members by wins with the hand-history and most-recent-win tie-breaks, distinct ranks for members with wins, and public read access.
- `api-contracts`: The published package of request/response schemas and schema-validated fixtures consumed by the frontend.

### Modified Capabilities

None — no existing specs.

## Impact

- **Repository**: replaces the `.idea` Java module setup with a pnpm TypeScript workspace (API service plus contracts package).
- **New systems**: AWS (CloudFront, API Gateway HTTP API, Lambda, S3, Cognito, ACM, Route 53) provisioned per stage; a custom domain (to be purchased); Neon Postgres with one branch per stage; GitHub Packages for the contracts package; GitHub Actions with AWS OIDC.
- **Frontend (`react-poker-timer`)**: gains a same-origin API at `/api`, cookie-based sign-in (no auth library needed), a hosting bucket to deploy its build into, and the contracts package; frontend changes themselves are out of scope.
- **Out of scope for MVP**: multiple groups, public-at-large features, guest players, timer/backend sync, hand-by-hand history, placements other than the winner, self-service account deletion, confirmation of recorded results, native mobile and TV clients (they would need a separate token path in the auth layer), and sign-in methods other than Google.
