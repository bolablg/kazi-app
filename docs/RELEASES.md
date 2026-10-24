# GitHub and Vercel releases

Repository: https://github.com/bolablg/kazi-app

Vercel: https://vercel.com/bolablg-projects/kazi-app

Production hostname: `kazi.iyanju.com` (DNS stays at Cloudflare).

## Branches

- Work on `dev-bola`, or another `dev-<developer>` branch.
- Open a pull request from `dev-*` into `staging`.
- After reviewing staging, open a pull request from `staging` into `main`.
- `main` is the production branch. Do not push directly to staging or main after bootstrap.

CI enforces this promotion order. Each promotion runs formatting, TypeScript, backend/domain/permission tests, deployment-environment checks, and browser/PWA journeys. The `Required checks` job fails if any prerequisite fails or is cancelled. Workflow actions are pinned to release commit hashes. Browser failure reports are retained for seven days. No deployment credentials are given to pull-request jobs.

The initial repository bootstrap places the same verified source on all three branches; subsequent changes follow the pull-request process. Keep merge commits enabled for promotions so the shared branch history remains connected. A solo maintainer can promote their own pull request after checks; another person's review is not required.

## Vercel configuration

The Git-linked project belongs to **Bola Builds** (`bolablg-projects`). Its root directory is `app`, framework is Vite, Node version is 24.x, install command is `npm ci`, build command is `npm run build:vercel`, and output directory is `dist`. `app/vercel.json` includes direct-route fallback, security headers, and the service-worker cache policy.

| Scope | Clerk | Convex |
| --- | --- | --- |
| Preview (`dev-*`, `staging`) | Development `pk_test_` key | Project preview deploy key; separate backend per branch |
| Production (`main`) | Production `pk_live_` key | Deployment-specific production deploy key |

Set `VITE_CLERK_PUBLISHABLE_KEY` and encrypted `CONVEX_DEPLOY_KEY` separately for Preview and Production. Never copy a production backend key into Preview. The build rejects missing keys, local authentication, development Clerk keys in production, and production Convex keys in previews. Convex deploys the backend first and injects that backend's URL as `VITE_CONVEX_URL` into the frontend build. Preview deployments reuse a branch's data; do not use `--preview-create`, which recreates a preview.

Configure `CLERK_JWT_ISSUER_DOMAIN`, `APP_ORIGIN`, and backend-only signing/encryption keys for each corresponding deployment. Preview defaults should use the development Clerk issuer; production uses the production issuer. Invitations need a stable matching origin. A preview key does not automatically provide environment variables to a fresh backend: configure the project's default preview environment variables before the first build. Keep optional Google and Resend credentials out until those integrations are intentionally enabled.

Clerk production needs the approved custom hostname and verified authentication/email DNS records. Attach the Vercel hostname using the exact recommended record shown by Vercel; do not transfer the apex domain or replace unrelated records. Keep Clerk CNAME records DNS-only.

The project being connected is not evidence of a successful live release. Check GitHub CI, Vercel deployment state/logs, domain verification, and a real sign-in against the intended Convex instance before calling it production-ready. Local demo and local Convex remain separate from hosted accounts.

## Recovery

Revert a faulty change on a development branch and promote the fix through staging. For urgent frontend rollback, select the last compatible deployment in Vercel. Schema/backend changes require compatibility review; a frontend rollback does not undo database migrations or external actions. Never restore an old database merely to roll back frontend code.

References: [Convex on Vercel](https://docs.convex.dev/production/hosting/vercel), [Convex deployment isolation](https://docs.convex.dev/production/multiple-deployments), [Vercel project configuration](https://vercel.com/docs/projects/overview), [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).
