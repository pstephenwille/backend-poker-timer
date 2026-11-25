# backend-poker-timer

Backend for [frontend-poker-timer](https://github.com/pstephenwille/frontend-poker-timer): Google sign-in, tournament records and a leaderboard for one home-game group. Infrastructure is defined with [SST v4](https://sst.dev) in `sst.config.ts`; the API is a Hono app in `packages/api`.

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm (`corepack enable`)
- Docker running, for the integration tests (Testcontainers starts Postgres)
- For a personal stage only: AWS credentials for the account in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). All resources are created in `us-east-1` regardless of `AWS_DEFAULT_REGION`.

## Local checks

```sh
pnpm install
pnpm typecheck
pnpm check      # Biome lint + format check
pnpm test
```

## Stages

| Stage         | Deployed by                                         | On `sst remove`                                  |
| ------------- | --------------------------------------------------- | ------------------------------------------------ |
| `prod`        | CI, after `dev` succeeds and a reviewer approves     | resources retained, stage protected from removal |
| `dev`         | CI, on every push to `master`                       | resources retained                               |
| `<your-name>` | you, from the CLI                                   | everything deleted                               |

`dev` and `prod` are deployed only through CI. Never run `sst deploy`, `sst secret set`, migrations or a frontend upload against them by hand. The commands below are for your own personal stage. Stage behavior is decided in one place, `infra/stage-settings.ts`.

## Working on a personal stage

### Deploy

```sh
pnpm sst deploy --stage <your-name>
```

The deploy prints:

- `url`: the CloudFront address serving the API at `/api/*`, and a placeholder `index.html` at `/`
- `cognitoHostedDomain`: the stage's Cognito domain, needed for its Google redirect URI

Work on the frontend runs on localhost against the stage (see [Serve a local frontend dev server](#serve-a-local-frontend-dev-server)), so nothing is uploaded into a personal stage. Smoke check:

```sh
curl -i <url>/api/anything   # Hono's JSON 401 (members-only by default), Cache-Control: no-store
curl -i <url>/some/page      # the placeholder index.html (SPA fallback)
```

### Secrets and database

Each personal stage needs its own Neon branch and four SST secrets. Set each with `pnpm sst secret set <Name> --stage <your-name> < file`, reading the value from stdin so it stays out of shell history.

| SST secret           | Value                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `DatabaseUrl`        | the **pooled** connection string of the stage's Neon branch            |
| `GoogleClientId`     | the Google OAuth client ID                                              |
| `GoogleClientSecret` | the Google OAuth client secret                                         |
| `SigninCookieKey`    | base64 of 32 random bytes (`openssl rand -base64 32`), never reused    |

Migrate the stage's database before deploying code that needs the new schema:

```sh
DATABASE_URL="<pooled-connection-string>" pnpm --filter @poker-timer/api db:migrate
```

After the first deploy, add `<cognitoHostedDomain>/oauth2/idpresponse` to the Google OAuth client's **Authorized redirect URIs**. Until then, Google answers sign-in with `redirect_uri_mismatch`.

Smoke check: open `<url>/api/auth/login` in a browser, sign in with Google, then `<url>/api/me` returns you. A failed sign-in lands on `<url>/?signinError=<code>&ref=<id>`; search the API function's CloudWatch logs for the `ref` to see why.

### Serve a local frontend dev server

Sign-in only completes on the origin Cognito returns to, so a frontend dev server on localhost can't sign in against a stage that serves its own frontend. Set `LOCAL_FRONTEND_ORIGIN` on a personal stage to make localhost its app origin. To keep it set for every deploy of that stage, put it in `.env.<your-name>` beside `sst.config.ts` (git ignores `.env.*`):

```sh
LOCAL_FRONTEND_ORIGIN=http://localhost:3333
```

Then deploy as usual with `pnpm sst deploy --stage <your-name>`. For a single deploy, set it in the shell instead: `LOCAL_FRONTEND_ORIGIN=http://localhost:3333 pnpm sst deploy --stage <your-name>`.

SST reads environment variables from these sources, and the first one that sets a variable wins:

1. The shell running `sst`.
2. `.env`.
3. `.env.<stage>`, only for the stage being deployed.

So an exported `LOCAL_FRONTEND_ORIGIN`, or one in `.env`, overrides `.env.<your-name>`, and applies to every stage you deploy from that shell or folder.

Then run the frontend with its `/api` proxy pointed at the stage: `API_ORIGIN=<url> pnpm dev`. Cognito returns sign-in to `http://localhost:3333/api/auth/callback`, the API accepts requests with `Origin: http://localhost:3333`, and photo uploads are allowed from it.

- Use Chrome or Firefox. Safari won't keep the `Secure` session cookie on `http://localhost`.
- While set, the stage's own CloudFront address can't sign in. Remove the variable (rename or delete `.env.<your-name>`) and deploy again to switch back.
- `dev` and `prod` refuse the variable. It must be `http://localhost:<port>`.

### Tear down

```sh
pnpm sst remove --stage <your-name>
```

Personal stages use `removal: "remove"`, so this deletes every resource the stage created.

## Schema changes

Edit `packages/api/src/db/schema.ts`, then run `pnpm --filter @poker-timer/api db:generate` and commit the generated migration. CI migrates `dev` and `prod` before deploying the new code, so each migration must stay compatible with the code already running (expand, then contract in a later release).

## Account and CI setup

These pieces are created by hand, once, outside `sst.config.ts`. CI depends on every one of them.

### AWS account

| Piece                  | Fact                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region                 | `us-east-1` for everything                                                                                                                                                                                                       |
| GitHub OIDC provider   | `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. CI signs in through it, so no AWS keys are stored in GitHub.                                                                                                |
| Deploy role            | `github-poker-timer`. Trust policy: `infra/aws-account/deploy-role-trust.json`, admitting only this repo's `dev` and `prod` GitHub environments. Inline policy `deploy`: `infra/aws-account/deploy-role-policy.json`. Both files hold an `ACCOUNT_ID` placeholder; reapply them whenever they change. |
| Deploy role's reach    | IAM roles, Lambda functions and S3 buckets named `poker-timer-*`, SST's `sst-state-*` and `sst-asset-*` buckets, and `/sst/*` SSM parameters. Resource names over 64 characters get truncated by SST and fall outside this scope. |
| Budget                 | `monthly-cost`: $10 a month, emailing the account owner at 85% and 100% of actual spend and 100% of forecast                                                                                                                     |
| Admins                 | members of each stage's Cognito user pool `admin` group, added in the Cognito console after the person's first sign-in; it takes effect at their next sign-in                                                                   |

### GitHub

| Where                                       | Name                   | Value                                                                                       |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Repository Actions variable                 | `AWS_DEPLOY_ROLE_ARN`  | `arn:aws:iam::<account-id>:role/github-poker-timer`                                         |
| `dev` and `prod` environment secrets        | `DATABASE_URL`         | the pooled connection string of the stage's Neon branch                                     |
|                                             | `GOOGLE_CLIENT_ID`     | the Google OAuth client ID                                                                  |
|                                             | `GOOGLE_CLIENT_SECRET` | the Google OAuth client secret                                                              |
|                                             | `SIGNIN_COOKIE_KEY`    | base64 of 32 random bytes, different for each stage                                         |
| `prod` environment                          | Required reviewers     | whoever approves `prod` deploys                                                             |

The deploy workflow passes the secrets to `sst deploy` as `SST_SECRET_DatabaseUrl`, `SST_SECRET_GoogleClientId` and so on, and its first step fails the run, naming any secret that is missing or empty, before anything is migrated or deployed.

### Neon

One Neon project, with one branch per stage: `production` for `prod`, `dev` for `dev`, and one per personal stage. Every stage uses the branch's **pooled** connection string; `prod`'s uses `sslmode=verify-full`.

### Google

One Google OAuth client (type _Web application_) serves every stage. Sign-in goes browser → `/api/auth/login` → Cognito → Google → Cognito → `/api/auth/callback`. Each stage's `<cognitoHostedDomain>/oauth2/idpresponse` must be listed under the client's **Authorized redirect URIs**. The app's own callback is registered with Cognito by `sst.config.ts` and needs no Google entry.

`prod` uses `removal: "retain"` and `protect: true`, so `sst remove --stage prod` refuses to run and its data survives a mistaken removal. Until the custom domain exists, it serves on its CloudFront host.

## Contracts package

`packages/contracts` holds the zod schemas for every request and response, plus sample fixtures on a separate `./fixtures` entry point. Inside this workspace the API imports its TypeScript source directly; the published package (`@pstephenwille/poker-timer-contracts` on GitHub Packages) ships the `tsc` build in `dist/` instead, through `publishConfig.exports`.

To release a new version, bump `version` in `packages/contracts/package.json` following semantic versioning (major for any removed, renamed or tightened field) and merge. CI publishes it.

To consume it from another repository, point the scope at GitHub Packages and authenticate with a token that has `read:packages` (in GitHub Actions, the workflow's `GITHUB_TOKEN`, after granting that repository read access under the package's **Manage Actions access**):

```
@pstephenwille:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## CI/CD

- **PR gate** (`.github/workflows/pr-gate.yml`): Biome, typecheck, unit and integration tests on every pull request.
- **Deliver** (`.github/workflows/deliver.yml`): every push to `master` migrates and deploys `dev`, then waits for a reviewer's approval in the `prod` environment and migrates and deploys `prod`. Both stages run the same steps from `.github/workflows/deploy-stage.yml`.
- **Publish contracts** (`.github/workflows/publish-contracts.yml`): on a push to `master` that touches `packages/contracts`, reruns the contracts and fixture tests and publishes the package if its version is not already on the registry. It can also be run by hand from the Actions tab.
