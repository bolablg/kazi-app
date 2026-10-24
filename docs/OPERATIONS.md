# Operations, recovery and data stewardship

## Inspect a connected development backend

Run `npm run backend` from `app/` and select the intended deployment in the Convex dashboard. Inspect Data tables, function logs, and Scheduled functions. `/health` on the deployment’s `.convex.site` origin returns a basic service/version response; it does not establish that Google consent or account quotas are healthy.

`jobs.tick` runs once per minute and selects indexed due workspaces. Task/progress/policy/calendar changes schedule a near-term evaluation; the next reconciliation is then set to the next meaningful deadline/progress/digest/recovery checkpoint. It does not repeatedly scan all workspaces’ task histories. At most one due workspace, three invitation intents per pending/expired-lease class, and three due calendar cursors are selected per tick. With the initial controlled rollout, checkpoints should enqueue within five minutes under healthy Convex operation; production timing has not yet been measured.

`jobs.recover` creates/reuses a pending recovery proposal. A saved review requirement prevents automatic acceptance. The recovery target and current version prevent repeated automatic Plan 2 creation for the same missed original deadline. The next recovery target can lead to Plan 3, retaining the chain.

## Calendar write recovery

Inspect `outbox` using its workspace, status, next-attempt and key indexes. `jobs.diagnostics` returns a manager-authorized, bounded status/error/attempt view. In a configured development CLI:

```sh
npx convex run jobs:diagnostics '{"workspaceId":"WORKSPACE_DOCUMENT_ID"}' \
  --identity '{"subject":"YOUR_CLERK_USER_ID"}'
```

Use CLI administrative identity injection only on an authorized development deployment. Ordinary clients use verified Clerk identity.

| Outbox state | Meaning and response                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `pending`    | Durable intent; bounded exponential retry/reconciliation is scheduled                                                    |
| `done`       | The event ID or explicit release was confirmed                                                                           |
| `paused`     | Current authority, consent, task facts, time or availability no longer permits the write; repair/review a fresh proposal |
| `failed`     | Retry limit reached after six attempts; inspect the specific cause before an operator retries unresolved work            |

Never reset successful intents or replay an entire applied plan. The Google event ID is stable, so uncertain writes are looked up before any creation. Inspect only Kazi-owned events. Do not delete successful events as an improvised rollback. An explicit future-reservation release has its own durable intent and receipt.

For a transient failure beyond the retry limit, an authorized operator may set only the unresolved intent back to `pending` with a current `nextAttemptAt` through the Convex dashboard after reviewing the cause. Preserve its key, event ID, owner, proposal and session ID. Trigger `jobs.dispatch` through the dashboard’s internal function runner if needed. The action still rechecks current permissions/policy; an operator must not edit those to force a stale plan through.

Calendar cursors retain sync/page tokens and back off on error. A 410 schedules a bounded full resync. Repeated provider failure leaves tasks usable and shows repair guidance. Google push/watch channels, external email and browser Web Push delivery are not activated in this build.

## Portable export and backup

Settings → Data & app exports the caller’s authorized projects/tasks/history as `kazi-export/1` JSON. It excludes calendar credentials, MCP token hashes and other backend-only secrets. This portable product export is not a full-fidelity database restore image. Live paginated reporting history is separate from this bounded projection; Reports exports filtered daily totals as CSV. Include the `reportEvents` table in the full database snapshot below to preserve dated time/completion facts.

An authorized administrator can create a full Convex snapshot using the installed CLI’s verified options:

```sh
cd app
npx convex export --path ../backups/kazi-development-snapshot.zip
# For an expressly authorized production backup:
npx convex export --prod --path ../backups/kazi-production-snapshot.zip
```

Choose an approved protected backup location and create its parent directory first. Full backend snapshots contain encrypted calendar credentials and credential hashes, so restrict access, encrypt backups, and keep encryption keys separately. No Google Drive operation is needed; the global Drive folder boundary continues to apply to any later delivery request. No paid automatic backup feature is assumed.

Restore first into an isolated development/staging deployment with calendar actions disabled/disconnected:

```sh
npx convex import ../backups/kazi-development-snapshot.zip
```

Review the CLI’s overwrite prompt and target before any replacement. Verify tenant references, history, membership and token revocations. Keep scheduled write jobs paused until authorized reconciliation confirms existing provider IDs. Never replay provider writes blindly after restoring an older snapshot. Production replacement and deletion are separate destructive operations requiring explicit authorization.

## Schema evolution

Application schema version is currently 1. Bootstrap generated TypeScript bindings are checked in for credential-free development; `convex dev` regenerates canonical bindings after account configuration. For future changes, add optional fields/indexes, deploy compatible readers, run a bounded internal backfill with explicit cursors, verify counts/references, then tighten validators. Do not rewrite immutable accepted snapshots to match new current behavior. The demo loader fills new optional fixture collections for older local demo state.

## Disconnection, removal and deletion

- **Disconnect Google:** use Settings → Calendar. Refresh credentials are revoked/deleted; existing Google events remain. Release selected owned future sessions first if desired.
- **Remove a teammate:** workspace owner/admin revokes membership and unassigns their work. Historical actor IDs remain. Scheduled actions recheck membership and cannot continue unauthorized writes. A removed member’s global MCP credential cannot regain access to that workspace.
- **Revoke assistant access:** revoke the token in Settings. Subsequent MCP requests fail authentication immediately.
- **Delete an account:** before deleting Clerk identity, revoke its MCP tokens, disconnect Google, export required data, and transfer project/workspace responsibilities through an authorized administrator. The build does not automatically consume Clerk deletion webhooks; administrators must complete this offboarding sequence. A Clerk account deletion alone is not an instruction to erase shared plan history.
- **Delete workspace data:** no casual destructive UI is provided. Obtain explicit authorization, export/verify a snapshot, settle external events, revoke memberships/tokens and remove only the scoped backend records through a reviewed administrative procedure. Retention/attribution requirements must be decided before erasing shared history.

## Quota and rollout controls

Start with the creator and a few invited testers, small active datasets, and measured calendar usage. Watch function executions, database/index I/O, database/storage sizes, action compute, HTTP errors, outbox backlog and sync freshness in the provider dashboards. Application records allow counts of proposal acceptance/rejection, shortfall, stale proposals and calendar failures without collecting work/event text as analytics.

The aggregate workspace projection is bounded to 1,000 records per entity table, with 200 visible activity entries. Reporting history uses a separate workspace/time index with cursor pagination and is not truncated to the activity-feed limit. At the bound the app fails explicitly rather than silently dropping data. Use a full administrator snapshot for export if a bounded product projection is unavailable. Implement per-screen cursor pagination before increasing these limits; do not delete accepted plan history as an emergency workaround. Archive/compact completed delivery and expired credential records under a reviewed retention policy, keeping accepted versions and attribution intact.

On quota exhaustion, keep the Free plan hard cap, pause new scheduling/rollout, display provider errors and preserve stored work. Let users retry after recovery. Do not enable Starter/pay-as-you-go, attach a credit card, or activate extra services automatically. Usage dashboards and live eligibility must be verified at the deployment review; the local build cannot measure account consumption.

## Invitation delivery

When Resend is configured, inspect `invitationOutbox` for pending/sending/sent/failed status, due time, attempts, and bounded error. Claims use leases and recheck the invitation plus inviter authority. Three attempts and a 23-hour window bound automatic retries; a provider idempotency key stays stable. Do not change pinned sender/content between retries. Missing optional email configuration leaves a usable invitation link with `not_configured` status. Configure a verified sender before testing real delivery. Details: [accounts and email](ACCOUNT.md).
