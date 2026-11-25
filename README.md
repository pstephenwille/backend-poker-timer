# backend-poker-timer

Backend for [react-poker-timer](https://github.com/pstephenwille/react-poker-timer): Google sign-in, tournament records and a leaderboard for one home-game group. Infrastructure is defined with [SST v4](https://sst.dev) in `sst.config.ts`; the API is a Hono app in `packages/api`.

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm (`corepack enable`)
- AWS credentials for the target account in the environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). All resources are created in `us-east-1` regardless of `AWS_DEFAULT_REGION`.

## Local checks

```sh
pnpm install
pnpm typecheck
pnpm check      # Biome lint + format check
pnpm test
```

## Stages

| Stage         | Purpose                              | On `sst remove`                                  |
| ------------- | ------------------------------------ | ------------------------------------------------ |
| `prod`        | production                           | resources retained, stage protected from removal |
| `dev`         | shared, deployed by CI from `master` | resources retained                               |
| `<your-name>` | personal                             | everything deleted                               |

Stage behavior is decided in one place, `infra/stage-settings.ts`.

### Bring up a personal stage

```sh
pnpm sst deploy --stage <your-name>
```

The deploy prints:

- `url` — the CloudFront address serving both the frontend (`/`) and the API (`/api/*`)
- `frontendBucket` — the S3 bucket the frontend build is uploaded into
- `distributionId` — the CloudFront distribution to invalidate after a frontend upload

Until the frontend is deployed, the bucket holds a placeholder `index.html`. Smoke check:

```sh
curl -i <url>/api/anything   # Hono's JSON 401 (members-only by default), Cache-Control: no-store
curl -i <url>/some/page      # the placeholder index.html (SPA fallback)
```

To deploy a frontend build into the stage:

```sh
aws s3 sync dist/ s3://<frontendBucket>/ --delete
aws cloudfront create-invalidation --distribution-id <distributionId> --paths "/*"
```

### Serve a local frontend dev server from a personal stage

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

### Database

Each stage has its own [Neon](https://neon.tech) branch in the one Neon project (`production`, `dev`, and one per personal stage). Create the branch in the Neon console and copy its **pooled** connection string.

- **Personal stages:**

  ```sh
  pnpm sst secret set DatabaseUrl "<pooled-connection-string>" --stage <stage>
  DATABASE_URL="<pooled-connection-string>" pnpm --filter @poker-timer/api db:migrate
  ```

- **`dev` and `prod`:** store the connection string only as the `DATABASE_URL` secret of the matching GitHub environment (**Settings → Environments → <stage> → Environment secrets**). The delivery workflow migrates with it, then passes it to `sst deploy` as `SST_SECRET_DatabaseUrl`.

Schema changes: edit `packages/api/src/db/schema.ts`, then `pnpm --filter @poker-timer/api db:generate` and commit the generated migration. Migrations run before the new code is deployed, so each one must stay compatible with the code already running (expand, then contract in a later release).

Integration tests start Postgres in Docker with Testcontainers, so Docker must be running for `pnpm test`.

### Google sign-in

Sign-in goes browser → `/api/auth/login` → Cognito's hosted domain → Google → Cognito → `/api/auth/callback`. Each stage has its own Cognito user pool, created by `sst.config.ts`; one Google OAuth client (Google Cloud console → **APIs & Services → Credentials**, type _Web application_) serves every stage.

Each stage needs three secrets:

| SST secret           | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `GoogleClientId`     | the Google OAuth client ID                                           |
| `GoogleClientSecret` | the Google OAuth client secret                                       |
| `SigninCookieKey`    | base64 of 32 random bytes (`openssl rand -base64 32`), one per stage |

- **Personal stages:** `pnpm sst secret set <Name> --stage <your-name>` for each, reading the value from stdin (`pnpm sst secret set <Name> --stage <your-name> < file`) so it stays out of shell history.
- **`dev` and `prod`:** never use `sst secret set`. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SIGNIN_COOKIE_KEY` as secrets of the matching GitHub environment; the delivery workflow passes them to `sst deploy` as `SST_SECRET_<Name>` variables. GitHub turns a missing secret into an empty string rather than an error, so the workflow's first step fails the run, naming any secret that is missing or empty, before anything is migrated or deployed.

After the stage's first deploy, register its Cognito redirect URI with Google. The deploy prints `cognitoHostedDomain`; append `/oauth2/idpresponse` and add the result under the OAuth client's **Authorized redirect URIs**:

```
https://poker-timer-<stage>-<account-id>.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

Until it is registered, Google answers sign-in with `redirect_uri_mismatch`. The app's own callback (`<url>/api/auth/callback`) is registered with Cognito by `sst.config.ts` and needs no Google entry.

Smoke check: open `<url>/api/auth/login` in a browser, sign in with Google, then `<url>/api/me` returns you. A failed sign-in lands on `<url>/?signinError=<code>&ref=<id>`; search the API function's CloudWatch logs for the `ref` to see why.

To make someone an admin, add them to the stage's user pool `admin` group (Cognito console → the pool → **Groups → admin**) after their first sign-in; it takes effect at their next sign-in.

### Tear down a personal stage

```sh
pnpm sst remove --stage <your-name>
```

Personal stages use `removal: "remove"`, so this deletes every resource the stage created.

## One-time AWS account setup

These are account-level, not per stage, so they are created by hand rather than in `sst.config.ts`.

### Budget alert

Every account has a monthly cost budget that emails the account owner, as a guard against a runaway resource.

1. Open **AWS Billing and Cost Management → Budgets → Create budget**.
2. Choose **Use a template → Monthly cost budget**.
3. Name it `monthly-cost`, set the amount to **$10**, and enter the account owner's email.
4. Create it. AWS emails at 85% and 100% of actual spend, and at 100% of forecast spend.

### GitHub Actions deploy role

CI deploys with short-lived credentials from GitHub's OIDC provider; no AWS keys are stored in GitHub. The role is created by hand because the pipeline cannot create the role it signs in with. The policy documents live in `infra/aws-account/` with an `ACCOUNT_ID` placeholder.

1. Create the GitHub OIDC identity provider, once per account (skip if `token.actions.githubusercontent.com` is already listed under **IAM → Identity providers**):

   ```sh
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```

2. Create the deploy role and its permissions:

   ```sh
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   sed "s/ACCOUNT_ID/$ACCOUNT_ID/g" infra/aws-account/deploy-role-trust.json > /tmp/trust.json
   sed "s/ACCOUNT_ID/$ACCOUNT_ID/g" infra/aws-account/deploy-role-policy.json > /tmp/policy.json
   aws iam create-role --role-name github-poker-timer --assume-role-policy-document file:///tmp/trust.json
   aws iam put-role-policy --role-name github-poker-timer --policy-name deploy --policy-document file:///tmp/policy.json
   ```

   The trust policy admits only workflows from `pstephenwille/backend-poker-timer` running in the `dev` or `prod` GitHub environment. The permissions cover the services SST uses; IAM roles, Lambda functions and S3 buckets are limited to the `poker-timer-*` names SST generates, plus SST's own `sst-state-*`/`sst-asset-*` buckets and `/sst/*` SSM parameters.

3. In the GitHub repository, add the variable **Settings → Secrets and variables → Actions → Variables → `AWS_DEPLOY_ROLE_ARN`** = `arn:aws:iam::<account-id>:role/github-poker-timer`.

When the permissions change, rerun the `put-role-policy` command. When the trust policy changes (for example, a new GitHub environment), apply it with `aws iam update-assume-role-policy --role-name github-poker-timer --policy-document file:///tmp/trust.json` after the `sed` above.

### Bring up `prod`

`prod` is deployed only by the delivery workflow, after `dev` succeeds and a required reviewer approves. Until the custom domain exists it serves on its CloudFront host. Once, before the first approval:

1. In Neon, use the `production` branch; copy its **pooled** connection string and change `sslmode=require` to `sslmode=verify-full`.
2. In GitHub, create the environment **Settings → Environments → New environment → `prod`**, tick **Required reviewers** and add yourself.
3. Add the `prod` environment secrets: `DATABASE_URL` (step 1), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a new `SIGNIN_COOKIE_KEY` (`openssl rand -base64 32`; never reuse another stage's key).
4. Make sure the deploy role's trust policy admits the `prod` environment (see above).
5. Merge to `master`, approve the `prod` job, and take `url` and `cognitoHostedDomain` from the deploy output.
6. Add `<cognitoHostedDomain>/oauth2/idpresponse` to the Google OAuth client's **Authorized redirect URIs** (see [Google sign-in](#google-sign-in)).

`prod` uses `removal: "retain"` and `protect: true`, so `sst remove --stage prod` refuses to run and its data survives a mistaken removal.

## Contracts package

`packages/contracts` holds the zod schemas for every request and response, plus sample fixtures on a separate `./fixtures` entry point. Inside this workspace the API imports its TypeScript source directly; the published package (`@pstephenwille/poker-timer-contracts` on GitHub Packages) ships the `tsc` build in `dist/` instead, through `publishConfig.exports`.

To release a new version, bump `version` in `packages/contracts/package.json` following semantic versioning (major for any removed, renamed or tightened field) and merge. The **Publish contracts** workflow publishes only when that exact version is not already on the registry, after rerunning the contracts and fixture tests; it can also be run by hand from the Actions tab.

To consume it from another repository, point the scope at GitHub Packages and authenticate with a token that has `read:packages` (in GitHub Actions, the workflow's `GITHUB_TOKEN`, after granting that repository read access under the package's **Manage Actions access**):

```
@pstephenwille:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## CI/CD

- **PR gate** (`.github/workflows/pr-gate.yml`): Biome, typecheck, unit and integration tests on every pull request.
- **Deliver** (`.github/workflows/deliver.yml`): every push to `master` migrates and deploys `dev`, then waits for a reviewer's approval in the `prod` environment and migrates and deploys `prod`. Both stages run the same steps from `.github/workflows/deploy-stage.yml`.
- **Publish contracts** (`.github/workflows/publish-contracts.yml`): on a push to `master` that touches `packages/contracts`, publishes the package if its version is new.
