# Verification report

Run date: October 24, 2026 (America/Chicago). Workspace: `/Volumes/Bolaji_SSD/boladev_projects/kazi`. Host: Apple M2, macOS arm64.

## Current implementation

Tasks uses Backlog → To do → In progress → To validate → Completed. Archive holds blocked, rejected, and discontinued work. List shows all five groups and a collapsed Archive; Board excludes archived work; Archive has its own view. Global/project views update the same records. Personal planning is the default project.

Board columns have independent vertical scrolling and viewport-aware height. Cards use accessible worker avatars. Clicking opens a full task page, with title and description before compact details and connection fields. Close/Escape returns to Tasks. Dependency nodes display status text with green/yellow/red signals; collaborators use removable chips. Owners and workers are distinct fields and may be the same person.

Review submission notifies the task owner. Approval completes work; return requires a reason and notifies the worker. Immutable timestamped task/project history powers mean/median stage-duration reports, current age, configurable thresholds, and To Brainstorm review dates. All-team views preserve membership roles, report authorization, and originating team IDs. Planning checks reservations across the same person's teams. Optional Resend invitation delivery uses a durable idempotent outbox; shareable signup links work without it.

Native Kazi agenda approval and release update current receipts transactionally without Google writes. Private revocable ICS links publish authorized sessions and optional transparent deadlines. MCP exposes the same data actions, review rules, reports, teams, invitations, settings, and calendar services.

## Current task presentation update

Removed Move to dropdowns from board cards, retained pointer/touch/keyboard dragging and full-task status editing, moved Description directly after the title, and replaced the drawer with a full-page task. Close/All tasks/Escape return to Tasks; resource history remains navigable. Scrollbars use native proportional thin thumbs with transparent tracks. Asana’s official task-fields/full-screen references were reviewed. A browser check was added for reviewer actions so they cannot also submit stale task fields.

The full serial Chrome run passed **all 41 journeys in 3.3 minutes**. It covered full-page task open/close and browser history, description order, status editing, dependency/collaborator saving, reviewer return/approval, removed board selectors, proportional scrolling, pointer/touch/keyboard dragging, Reports, Calendar, Favorites, responsive widths from 360 to 1920 pixels, and production PWA offline/static caches. A duplicate React child-key warning found during that run was corrected. The final **five focused task/PWA checks passed in 16.7 seconds**, including a console/runtime-error assertion for the task view.

## Automated evidence

- **124 tests across 14 files passed** serially in 10.43 seconds. Coverage includes domain/scheduling constraints, review permissions and return reasons, timestamped stage intervals and aging, team isolation and racing approvals, current-membership calendar feeds, mocked invitation delivery/idempotency/revocation, immutable history, resource IDs, SDK/HTTP MCP parity and granular scopes, and a ten-question read-only MCP evaluation.
- TypeScript and the production PWA build passed. Latest build: **977.85 kB main JavaScript (287.03 kB gzip), 140.76 kB CSS, 1128.24 KiB precache**. Vite reports a main-chunk size warning; route splitting remains a performance improvement before a broader rollout.
- The current presentation passed all 41 browser journeys, followed by five passing checks after the rendering-warning correction, as detailed above.
- Formatting checks passed. A real local-browser source-change check confirmed automatic reload retained the open task view, with no runtime errors. It touched stylesheet metadata without changing contents or task data.

An initial parallel test/build run timed out in the multi-request MCP evaluation at the default five-second limit. The evaluation now has an explicit 30-second integration-test allowance; the complete serial suite passed. Earlier browser passes found and corrected board-height calculations, an archive test selector, and the last-card assertion's assumption about alphabetical sorting.

## Real local backend

A smoke check against the running signed local Convex session loaded **4 projects and 12 tasks**, found **Personal planning** and native Kazi agenda, discovered **64 MCP tools**, rendered a temporary ICS subscription, revoked it, and verified HTTP 404. Temporary credentials were revoked. It changed no task data. Local identity remains loopback-only; the synthetic browser test server is isolated at port 5175.

The existing Convex CLI login can access **bolaji / kazi-app** and resolve its development deployment. The browser still uses local Convex. No cloud function/data deployment, production change, public hosting, DNS modification, real Resend email, external calendar subscription, or external assistant-account connection was performed.

## Remaining external checks

Hosted development needs matching Clerk public key/issuer and the intended cloud development URL. Production uses separate configuration. Real Resend delivery requires a verified sender and backend credentials. Google availability consent and Google/Outlook/Apple subscription refresh need real account checks on reachable HTTPS; subscription refresh is provider-controlled and cannot guarantee immediate booking protection. Physical iOS/Android installation/update behavior remains unverified.

Aggregate subscriptions are bounded to ten teams and 1,000 records per entity table. Lifecycle/report facts are separately paginated; the short activity projection is not the analytics source. A broader rollout needs indexed per-screen reads, load/latency measurements, and quota checks. This is an executable local implementation, with the external release checks above still open.

See [workflow](WORKFLOW.md), [reports](REPORTS.md), [accounts and email](ACCOUNT.md), [calendar](CALENDAR.md), [MCP](MCP.md), and [local development](LOCAL_DEVELOPMENT.md).
# Hosted release setup — October 24, 2026

The initial [GitHub CI run](https://github.com/bolablg/kazi-app/actions/runs/40134062587), automatic [push CI](https://github.com/bolablg/kazi-app/actions/runs/40134955469), and [staging pull-request CI](https://github.com/bolablg/kazi-app/actions/runs/40134959353) passed. CI runs all 124 backend/domain tests, deployment-environment guard tests, TypeScript/format checks, a production asset build, and 41 browser/PWA journeys using synthetic fixtures. The same full set runs for promotions into staging and main.

Verified the cloud development backend deployment, isolated Git branch preview build/backend, production backend and Vercel build, correct production Cloudflare CNAME, verified Clerk authentication/email DNS, and rendered Clerk sign-in pages at the preview and `https://kazi.iyanju.com`. Production uses its live Clerk instance; the preview visibly uses development authentication. The build guard blocked a development branch when Vercel initially treated it as production. Automatic Actions were enabled and subsequently verified on both push and pull-request events.

Private account signup/sign-in and collaborative workflows against real accounts still require the account holder's live verification. Google OAuth and Resend delivery remain optional and unconfigured; no real email invitation, calendar provider connection, booking integration, or remote assistant session was exercised as part of hosting setup. The earlier local implementation evidence and external acceptance gates below remain relevant.

