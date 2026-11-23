# backend-poker-timer

Backend for [react-poker-timer](https://github.com/pstephenwille/react-poker-timer): Google sign-in, tournament records and a leaderboard for one home-game group. Infrastructure is defined with [SST v3](https://sst.dev) in `sst.config.ts`; the API is a Hono app in `packages/api`.

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

### Database

Each stage has its own [Neon](https://neon.tech) branch in the one Neon project (`prod`, `dev`, and one per personal stage). Create the branch in the Neon console, copy its **pooled** connection string, then:

```sh
pnpm sst secret set DatabaseUrl "<pooled-connection-string>" --stage <stage>
DATABASE_URL="<pooled-connection-string>" pnpm --filter @poker-timer/api db:migrate
```

For `dev` (and later `prod`), also store the connection string as the `DATABASE_URL` secret of the matching GitHub environment (**Settings → Environments → dev → Environment secrets**); the delivery workflow migrates with it before deploying.

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
- **`dev` and `prod`:** never use `sst secret set`. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SIGNIN_COOKIE_KEY` as secrets of the matching GitHub environment; the delivery workflow passes them to `sst deploy` as `SST_SECRET_<Name>` variables. A missing one fails the deploy.

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

   The trust policy admits only workflows from `pstephenwille/backend-poker-timer` running in the `dev` GitHub environment. The permissions cover the services SST uses; IAM roles, Lambda functions and S3 buckets are limited to the `poker-timer-*` names SST generates, plus SST's own `sst-state-*`/`sst-asset-*` buckets and `/sst/*` SSM parameters.

3. In the GitHub repository, add the variable **Settings → Secrets and variables → Actions → Variables → `AWS_DEPLOY_ROLE_ARN`** = `arn:aws:iam::<account-id>:role/github-poker-timer`.

When the policy changes, rerun the `put-role-policy` command.

## CI/CD

- **PR gate** (`.github/workflows/pr-gate.yml`): Biome, typecheck, unit and integration tests on every pull request.
- **Deliver** (`.github/workflows/deliver.yml`): every push to `master` migrates the `dev` database, then deploys the `dev` stage.
