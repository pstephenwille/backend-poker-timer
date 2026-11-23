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
curl -i <url>/api/anything   # Hono's JSON 404, Cache-Control: no-store
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
