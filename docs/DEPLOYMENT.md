# Hosted deployment preparation

**The selected hosting target is now Vercel**, with GitHub promotion through `dev-bola` → `staging` → `main` and production hostname `kazi.iyanju.com`. Follow [RELEASES.md](RELEASES.md) for the current Git-linked setup. The Cloudflare Workers instructions below describe the original alternative; Cloudflare remains the DNS provider for the selected Vercel deployment.

The sections below document the original **Cloudflare Workers alternative**. The selected Vercel frontend is now deployed, with approved Cloudflare DNS and production Clerk/Convex configuration; see [RELEASES.md](RELEASES.md). No separate application server, paid email provider, LLM service, or organization feature is required.

## Service eligibility and allowances

Official documentation was checked on October 24, 2026. Account-specific eligibility and current consumption are still unverified. Recheck immediately before deployment; amounts below are ceilings, not a promise of free operation at any user count.

| Service                     | Checked public allowance / constraint                                                                        | Launch decision                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Convex **Free**             | Hard caps; 1,000,000 calls/month, 0.5 GB database, 1 GB/month database I/O, 20 GB-hours/month action compute | Select Free, not Starter/pay-as-you-go. Inspect actual account usage and region.                                         |
| Clerk Hobby                 | No card required; public page lists 50,000 monthly retained users per app and 3 dashboard seats              | Verify the intended app’s eligibility. Kazi uses no Clerk Organizations.                                                 |
| Cloudflare static assets    | Asset requests/storage have no additional charge; Free supports 20,000 files, each up to 25 MiB              | Serve assets directly; no `run_worker_first` route.                                                                      |
| Cloudflare Worker execution | Free has a separate 100,000 script requests/day and 10 ms CPU budget                                         | Kazi’s app hosting uses asset serving, and its MCP runs on Convex. Avoid adding script execution to every asset request. |

The validated asset build contained a largest JS file around 0.84 MB uncompressed and about 0.98 MB in the service-worker precache after the Height redesign. This fits the checked static file limits. It says nothing about live Convex function/database traffic or Google quota. Existing domain registration/renewal is separate.

Sources: [Convex limits and Free/Starter distinction](https://docs.convex.dev/production/state/limits), [Convex plans](https://www.convex.dev/pricing), [Clerk plans](https://clerk.com/pricing), [Cloudflare asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Cloudflare platform limits](https://developers.cloudflare.com/workers/platform/limits/).

## Production configuration

1. Select an authorized Convex project on the hard-capped Free plan. Set an appropriate region and record current usage. Do not activate a paid plan or attach new billable services.
2. Configure a **production Clerk instance**, its domain, supported sign-in methods and Convex integration. Set production `CLERK_JWT_ISSUER_DOMAIN` on Convex. Verify the issuer and audience, not merely the presence of a frontend key.
3. Choose an existing Cloudflare-managed hostname/subdomain after user review. Keep registration with its current registrar. This document does not authorize a hostname choice or DNS mutation.
4. Set production Convex environment variables:

| Variable                                   | Value                                               |
| ------------------------------------------ | --------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`                  | Production Clerk issuer                             |
| `APP_ORIGIN`                               | Exact HTTPS frontend origin                         |
| `CONVEX_SITE_URL`                          | Production deployment’s HTTPS `.convex.site` origin |
| `INVITATION_SIGNING_KEY`                   | At least 32 random characters, server-only          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Authorized production Google OAuth app              |
| `TOKEN_ENCRYPTION_KEY`                     | Base64-encoded 32 random bytes, server-only         |

Do not enable `ALLOW_SYNTHETIC_SEED` in production. Register the production Google callback `/google/callback` and complete required consent verification. Avoid using personal calendars as synthetic fixtures.

5. From `app/`, deploy the backend only after authorization:

```sh
npm ci
npm run typecheck
npm test
npm run deploy:backend
```

6. Put production browser configuration in a protected build environment or `.env.production.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_YOUR_PRODUCTION_KEY
VITE_CONVEX_URL=https://YOUR_PRODUCTION_DEPLOYMENT.convex.cloud
```

7. Build and inspect the frontend:

```sh
npm run build
npm run preview
npm run test:e2e
npm run check:deploy
```

`check:deploy` performs a Wrangler dry run; it is not a public deployment. The backend account-dependent suite must also be run against the configured deployment before declaring the first complete live release. Confirm account isolation, invitations, independent calendar-owner approval, actual durable execution after browser closure, and Google reconciliation.

8. Once the exact production artifact, account plans and hostname are approved:

```sh
npx wrangler login
npm run deploy:frontend
```

`deploy:frontend` rejects missing HTTPS Convex configuration or a nonproduction Clerk key. `wrangler.jsonc` serves `dist/` through Static Assets with SPA fallback and no per-asset Worker-first handler. Add the reviewed custom hostname through Workers → Settings → Domains & Routes, or a reviewed `routes` entry with `custom_domain: true`; do not guess a zone or hostname. Update Clerk origins, `APP_ORIGIN`, Google callbacks and the frontend build together as needed.

## Final live checks

- HTTPS, direct navigation to `/projects/...`, manifest, actual installation and controlled update flow.
- New Clerk account creates exactly one private personal Inbox.
- A teammate accepts an invitation for the intended verified email; removal revokes access.
- Real Google free/busy includes recurring/all-day busy periods and external changes; revoked consent pauses scheduling.
- A current proposal cannot book a newly occupied slot or stale task/constraint state.
- A timeout/crash after Google creation produces one provider event, with a visible partial/confirmed receipt.
- Review ON blocks an already-queued automatic job; per-person and project review requirements remain enforced.
- A real Codex/Claude Code MCP connection captures and proposes through the same domain services; revocation returns 401.
- No private data remains across sign-out/account changes; a cold offline load does not pretend to authenticate.
- Observe real usage and errors for the limited rollout before inviting more people.

Rollback the frontend by redeploying a previously reviewed asset build. Backend rollback requires schema compatibility and durable-intent reconciliation; restoring old database state is not a safe substitute for a considered rollback. See [operations](OPERATIONS.md).

## Optional invitation delivery

Set `RESEND_API_KEY` and `INVITE_EMAIL_FROM` only on the intended backend deployment, using a verified Resend sender. `APP_ORIGIN` must point to the matching frontend so invitation signup links resolve correctly. `INVITATION_SIGNING_KEY` remains required for invitations whether delivery is email or a shared link. See [delivery behavior and retries](ACCOUNT.md). Test a real invitation on development before enabling production delivery.
