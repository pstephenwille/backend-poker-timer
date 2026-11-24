# Handoff: add-mvp-backend

Status as of 2026-11-24, for resuming on another machine or in a new session. `tasks.md` is the source of truth for what is done; this file records where things are deployed and the decisions made along the way that live outside the code.

## Where it stands

45 of 47 tasks are done. The backend is deployed and smoke-tested on `dev` and `prod`. Two tasks remain, each waiting on something outside this repo:

- **14.3** waits for the frontend. It is run through the real UI on `prod` once the frontend is deployed:
  1. Sign in with Google.
  2. Check that `__Host-session` is `HttpOnly`, `Secure`, `SameSite=Strict` and `Path=/` with no `Domain`, and that no token is readable by page scripts.
  3. Record a tournament with a photo.
  4. Sign out and read the leaderboard anonymously.

  Then check that the photo is served as WebP of at most 1600 px with no EXIF, through a signed URL that expires within an hour. `prod`'s database starts empty, and a tournament needs two members, so a second Google account has to sign in once.
- **14.1** waits for the domain to be bought and hosted in Route 53. After switching, add each stage's new Cognito redirect URI to the Google OAuth client.

After both, archive the change.

## Stages

| Stage | URL | Neon branch |
| --- | --- | --- |
| `prod` | https://d228ov3aayfbkh.cloudfront.net | `production` |
| `dev` | https://d3qe36cyda6430.cloudfront.net | `dev` |
| `stephen` (personal) | https://dtp80nyn4zjug.cloudfront.net | `stephen` |

Neon project `little-forest-37491392`, Postgres 18; every branch is migrated through `0004`. SST 4.17.2 in `us-east-1`; both Lambdas run `nodejs24.x` on arm64.

## Delivery

- A merge to `master` runs **Deliver**. It deploys `dev`, then holds `prod` until a required reviewer approves it in **Actions → Deliver → Review deployments**.
- Each stage's deploy (`.github/workflows/deploy-stage.yml`):
  1. checks that the four environment secrets are set;
  2. migrates the database;
  3. runs `sst deploy`.
- The four secrets come from the GitHub environment, passed to SST as `SST_SECRET_<Name>`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SIGNIN_COOKIE_KEY`.
- `dev` and `prod` never use `sst secret set`. Personal stages do.
- Deploys don't run `sst refresh`. It was a one-off for the SST v3 → v4 state migration, and it exits 1 without an error on a half-created stage.
- Run and job status can be read from the public GitHub API without signing in: `https://api.github.com/repos/pstephenwille/backend-poker-timer/actions/runs?per_page=5`.

## Decisions made during implementation

- `prod` launched on its CloudFront host first. The custom domain comes later, under 14.1.
- Avatars are processed to at most 512 px on the longest side, keeping the aspect ratio; the frontend crops them. Tournament photos stay at 1600 px.
- An admin cannot deactivate their own account: the API answers 400 `cannot_deactivate_self`.
- Task 10.2 was ticked without a real Google sign-in by a deactivated account on `dev`. Callback tests with the fake identity provider cover that refusal.
- Test data stays out of `prod`. Smoke tests run on `dev` and `stephen`, using throwaway users whose `cognito_sub` starts with `smoke-`, inserted straight into the database and deleted afterwards.
- The frontend build is deployed by hand (see the README). Automating it probably belongs in the frontend's own pipeline, using the stage outputs `frontendBucket` and `distributionId`.

## Setting up a new machine

- Clone the repo and run `pnpm install`. Docker must be running for the integration tests.
- AWS credentials for account `512808912517` are needed for SST and smoke tests. The Neon CLI (`npx -y neon@9.9.3`, signed in) is needed for connection strings.
- To deploy the personal stage, set its four SST secrets with `pnpm sst secret set <Name> --stage <your-name>`, reading each value from stdin. Each stage needs its own `SigninCookieKey`; never reuse another stage's.
