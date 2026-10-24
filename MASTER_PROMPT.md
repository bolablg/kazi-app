# Kazi — Master Build Prompt

Product name: **Kazi** — task/work in Swahili.

Version: 1.3  
Prepared: October 23, 2026  
Updated: October 24, 2026 — Hosted PWA launch using React/Vite, Cloudflare, Clerk, and Convex.  
Purpose: Build a complete application from scratch for conversational project management, team task ownership, calendar planning, deadline reminders, and versioned recovery plans.

## How to use this file

Give the prompt below to a coding agent in the repository where Kazi should be built. It is self-contained. The requested outcome is a working application with persistent data, real integrations, tests, and setup documentation. This file is a specification and build instruction; creating this file does not authorize publishing an application or connecting live accounts.

---

## BEGIN MASTER PROMPT

You are the lead product engineer, application architect, and UX designer building **Kazi** from scratch. Make routine implementation decisions, record your assumptions, and carry the implementation through to a working, tested application. Do not stop after writing a proposal, generating wireframes, or building a static dashboard.

Kazi is a straightforward personal and team work manager that turns conversations into projects, tasks, and realistic calendar work sessions. When work falls behind, it reminds the right people and proposes a fresh plan that preserves and links to all earlier plans.

### 1. Product intent and non-negotiable outcomes

Build for a solo user first, with team collaboration supported by the same data model and workflows from the beginning. The experience should feel calm, direct, and easy to learn.

The user must be able to:

1. Create projects, tasks, and subtasks through the interface or an external AI assistant using Model Context Protocol (MCP).
2. Capture a task without specifying a project; it goes into a predictable default Inbox.
3. Describe work conversationally, including task owners, estimates, priorities, dependencies, and deadlines.
4. Connect Google Calendar, understand real availability, and spread work across several suitable sessions.
5. Receive useful reminders when a deadline approaches, progress stalls, capacity is insufficient, or a deadline is missed.
6. Recover from a missed deadline with a new, linked plan such as Plan 2 while preserving Plan 1.
7. Review the proposed sessions before anything is scheduled by default.
8. Disable the review requirement explicitly to allow future recovery plans to be created and scheduled automatically within the user's chosen limits.
9. Onboard teammates and clearly assign responsibility for each task within a project.
10. Use the core application without purchasing a project-management subscription or a required AI API subscription.

All ten outcomes are required for the first complete release. Implement them in increments, but do not quietly defer team support, MCP, reminders, or recovery planning as future work.

### 2. Scope, economics, and implementation posture

- Deliver an installable, responsive Progressive Web App (PWA) for desktop and mobile in the first release. Installation, a manifest, service-worker behavior, and a clear offline experience are required rather than optional polish.
- Prioritize a working hosted application for the creator and early testers, with a target of $0 in additional recurring infrastructure costs while usage stays within the selected services' free allowances. The existing domain's registration and renewal are separate.
- Use React with Vite for the PWA, Cloudflare Workers Static Assets for frontend hosting on the existing Cloudflare-managed domain, Clerk for authentication, and Convex for backend functions, data, realtime subscriptions, and durable scheduled work.
- Open-source distribution, customer self-deployment, white-label packaging, and a hosted commercial edition are future considerations. Do not make a self-hosted deployment, provider-independent database, or a second authentication implementation a prerequisite for the first release. Keep the scheduling algorithm in ordinary TypeScript helpers without building speculative migration infrastructure.
- Use open-source components with suitable licenses. Document application and dependency licensing deliberately.
- Provide a documented development setup and an exact deployment path for the selected hosted services. Do not introduce a separate server, standalone worker process, or additional backend provider unless a demonstrated runtime requirement cannot be met by the selected stack.
- Verify the current free-plan allowances and account eligibility before deployment. Use Convex's hard-capped Free plan, not a pay-as-you-go plan. Do not activate a paid plan, attach a billable service, or add optional infrastructure to finish the build without explicit authorization.
- Do not promise that 1,000 users, unlimited history, email delivery, or AI inference will remain free. Measure function executions, database I/O, storage, action compute, and actual traffic. Document usage limits, quota exhaustion behavior, and a controlled initial rollout.
- Avoid polling every user's tasks or calendar repeatedly. Use indexed queries, bounded realtime subscriptions, event-driven jobs, pagination, and limited reconciliation work. Keep job and notification records compact without deleting accepted plan history.
- Scheduling, deadline evaluation, default routing, reminders, and approval enforcement must work without an LLM.
- External assistants provide conversational reasoning through Kazi's MCP server. The external assistant's subscription or model cost is separate from Kazi.
- Optional in-app conversational AI may support a user-supplied API key or a local model. If no model is configured, offer honest structured capture and planning controls; do not pretend that a canned response is an AI conversation.
- In-app notifications are required; browser Web Push is the preferred optional delivery channel for the PWA. Email, SMS, and hosted LLM inference must not be mandatory paid dependencies.
- No billing, subscription checkout, paid feature gates, advertising, or mandatory analytics in the first release.

### 3. Start by inspecting the actual workspace

Before making changes:

1. Read applicable repository instructions, including AGENTS.md and referenced files.
2. Inspect existing files and preserve unrelated work. Do not overwrite this master prompt.
3. Respect the user's target directory. If the build workspace is the `kazi` folder containing this prompt, place the implementation in `app/` and project documentation in `docs/` unless the user specifies another layout.
4. Use the agreed hosted stack below. If an existing application is present, preserve compatible product behavior and domain logic while adapting it to this stack. Record concrete reasons for any necessary supporting-library changes; do not silently replace the chosen frontend, backend, authentication, or hosting provider.
5. Verify current official documentation for the libraries, MCP specification, authentication, and Google Calendar APIs you actually use. Pin compatible versions; do not invent APIs or rely on remembered version numbers.
6. Write a short implementation plan and decision log, then start implementation. Ask only questions whose answers materially block a correct implementation. Use the product defaults in this prompt for routine choices.
7. Work through all feasible implementation and verification. Keep any account connection, unavailable credentials, or public deployment step clearly identified as an external dependency.

Required launch stack:

- TypeScript throughout the application.
- React with Vite for the application, using supported stable versions and the official Convex and Clerk React integrations. Use client-side routing and accessible forms. Avoid a server-rendering layer for the initial authenticated application unless a concrete requirement emerges.
- PWA tooling compatible with Vite, including a web app manifest, icons, service worker, install guidance, and a controlled update experience.
- Cloudflare Workers Static Assets to serve the frontend build on the chosen existing domain or subdomain. Serve frontend assets directly; do not invoke Worker code for every asset request without a concrete need. Verify current build, deployment, and asset limits.
- Clerk for sign-up, login, and identity. Use its production configuration for the live application and verify tokens through Convex's supported integration. Google Calendar consent is a separate connection from signing into Kazi.
- Convex's database with a typed schema, indexes, validated document references, controlled data migrations when required, and synthetic seed data. Use its supported data model and transactional mutations rather than introducing another database.
- Convex queries and mutations for application reads and validated state changes; actions for external API calls and other side effects; HTTP actions for OAuth callbacks and provider webhooks.
- Convex internal scheduled functions and cron jobs for reminders, deadline evaluation, calendar synchronization, recovery planning, and bounded retries. Persistent job/incident records and idempotency remain Kazi's responsibility.
- Kazi workspaces, roles, memberships, project access, and invitations stored and enforced in Convex. Clerk supplies identity; Clerk Organizations and paid organization features are not required for the initial team model.
- The official MCP SDK and a remote authenticated transport supported by the selected runtime. Prefer a Convex HTTP integration where compatible. If an adapter is demonstrably needed, a small Cloudflare Worker may provide the MCP transport while reusing Convex for authorization and all domain operations; verify its free-runtime limits and keep heavy computation in Convex.
- A React-compatible component system with accessible primitives, restrained styling, and a coherent design token set.
- Component tests, Convex/domain integration tests, and browser-based end-to-end tests for the critical user journeys.

The React PWA runs in the user's browser, Cloudflare serves its assets, Clerk manages authentication, and Convex runs the backend and stores application data. Backend code belongs in the application's `convex/` directory and is deployed to Convex; it is not executed in the browser. All frontends and MCP entry points must call the same authorized Convex domain operations. Keep secrets, calendar tokens, scheduling authority, and job execution server-side. Client-side routing, hidden buttons, and token presence alone are not authorization.

Use the existing Cloudflare-managed domain without transferring its registration. The first implementation targets Cloudflare hosting; choosing a host does not authorize creating a public deployment or changing DNS. Document the exact production build, Convex deployment, Clerk configuration, Cloudflare asset deployment, and domain configuration steps for final review.

### 4. Core domain language

Use these concepts consistently in the interface, database, and APIs:

| Concept | Meaning |
| --- | --- |
| Workspace | An isolated personal or team environment with its own members and projects. |
| Inbox | The default project for unorganized tasks within the current authorized workspace context. |
| Project | A stable container and identity for an ongoing objective or topic. |
| Task | A stable unit of work with ownership, state, and optional deadline, effort, and dependencies. |
| Progress update | A meaningful statement or recorded change about work completed or remaining. |
| Plan | A stable lineage of scheduling decisions for a particular scope, such as a project or selected tasks. |
| Plan version | An immutable accepted snapshot: Plan 1, Plan 2, Plan 3, and so on. |
| Plan proposal | A candidate schedule that can be edited, approved, rejected, or expire before application. |
| Work session | A scheduled block of time intended for work on a task. It is not proof of completion. |
| Project iteration | An execution cycle linked to the stable project and the corresponding plan version. |
| Task attempt | A linked execution attempt for unfinished work in a plan version. It does not duplicate the underlying task's business identity. |
| Deadline | The date or instant by which work is expected to be finished. |
| Recovery target | A proposed new completion date after an original deadline becomes unattainable or passes. |

Never conflate a task's deadline, its calendar session start, and its recovery target. Preserve the original deadline in history. Moving scheduled work is not permission to extend a deadline.

### 5. Projects, tasks, ownership, and Inbox behavior

Implement:

- Projects with title, description, owner, members, status, priority, optional deadline, and task list.
- Tasks with title, description, status, one accountable assignee, optional collaborators, priority, estimated effort, remaining effort, deadline, dependencies, labels, and subtasks.
- Task states: To do, In progress, Blocked, Done, and Canceled. A task that is overdue keeps its state and gains an overdue indicator.
- Project list, task list, board view, search, and filters for owner, project, status, priority, and deadline.
- Comments and an activity timeline recording meaningful changes and their actors.
- Explicit completion and reopening, with an audit trail.
- Task reassignment that preserves history and triggers appropriate notifications.
- Archive behavior that preserves historical plans and references.

Inbox rules:

1. Create a personal workspace and personal Inbox during initial onboarding.
2. A task created without a project goes into the authenticated user's default Inbox for the explicitly selected workspace.
3. In a team workspace, the default team Inbox must be visibly shared and permission-scoped. Do not silently expose personal capture to a team.
4. Persist the chosen default Inbox, validate that it belongs to the active workspace, and prevent accidental removal without choosing a replacement.
5. Never guess a workspace or assignee across ambiguous names. Resolve against the authenticated user's authorized context and ask a focused clarification when necessary.
6. A task added to an Inbox must still be schedulable, remindable, and assignable.

Estimate rules:

- Store estimated and remaining minutes separately from logged time and completion state.
- An explicit remaining-effort update takes precedence over a simplistic estimate-minus-timer calculation.
- Do not infer task completion from elapsed calendar time or a closed timer.
- When an estimate is missing, request one or show a clearly labeled suggested estimate. Any default estimate used by automatic planning must have been authorized in the user's planning preferences.
- For subtasks, define a single roll-up rule so parent estimates and child estimates cannot double-count workload.

### 6. Team onboarding and permissions

Support a user creating a team workspace, inviting teammates, creating projects, and distributing tasks among project members.

Use clear roles such as Owner, Admin, Member, and Guest, with an explicit permissions matrix in the technical documentation. Project access may further restrict workspace membership.

Required behavior:

- An invitation has a recipient, role, workspace, expiry, revocable token, and acceptance state.
- A teammate only gains access after accepting an authorized invitation.
- Implement invitations and membership in Kazi's Convex data model using Clerk identity. Provide secure, expiring shareable invitation links so onboarding works without a paid email provider or dependence on Clerk Organizations quotas; email delivery can be added through an optional configured adapter.
- Every project shows its owner; every task shows an assignee or an explicit Unassigned state.
- Personal tasks are private unless deliberately shared or moved to a team workspace.
- A team member sees only authorized projects and tasks. Guests see only explicitly shared resources.
- Managers can assign work within their authorized projects and propose plans for teammates.
- A manager's assignment permission does not grant access to another person's calendar details or permission to write into that calendar.
- Each teammate controls their own calendar connection, availability sharing, working hours, and automatic scheduling preferences.
- Where only free/busy sharing is granted, expose availability without event titles, descriptions, or attendees.
- Removing a member revokes workspace access and future unauthorized scheduling; preserve attribution on historical work and clearly handle their unassigned tasks.
- Do not schedule an unassigned task until responsibility and a calendar owner have been resolved.

### 7. Calendar connection and synchronization

Google Calendar is the required first calendar provider. Design a provider interface for later Outlook or other calendar support without implementing every provider now.

Provide a guided connection flow:

1. Explain what the connection enables in plain language.
2. Connect through supported Google OAuth flows using the minimum scopes needed for the chosen capabilities.
3. Let the user select calendars that inform availability and one writable destination calendar for Kazi sessions.
4. Let the user choose time zone, working days, working hours, breaks, session lengths, buffers, and daily capacity limits.
5. Verify the connection and show a useful connection status, last successful sync, and repair action.

Calendar rules:

- Read real event availability, including busy all-day events, recurring occurrences and exceptions, out-of-office events, and external edits.
- Respect the provider's free/busy semantics. A free event need not block availability; a busy event does.
- Preserve event IDs, calendar IDs, sync state, and the internal session-to-event mapping.
- Use incremental synchronization where supported, with a recoverable full-resync path when a cursor or token becomes invalid.
- Use Google Calendar change notifications where practical, with channel renewal and bounded reconciliation fallback, to drive incremental updates. Fetch fresh authorized availability when generating a plan and revalidate relevant slots immediately before application. Never depend on a browser tab remaining open.
- Show the last successful synchronization, connection errors, and a manual refresh action. Coalesce duplicate change signals and back off after failures instead of aggressively polling all calendars. Run synchronization and renewal through Convex actions and durable scheduled functions.
- Refresh and revoke tokens correctly. Encrypt refresh tokens at rest and never log credentials.
- Handle disconnected accounts, revoked consent, rate limits, provider outages, stale data, and read-only calendars explicitly.
- Do not claim that an expired, missing, or stale calendar connection represents confirmed free time.
- External edits to Kazi-created events must reconcile visibly. Do not silently overwrite the user's manual changes.
- Creating focus sessions must not silently invite other people or turn personal work blocks into meetings.
- No Google Drive integration is required for this product.

### 8. Scheduling engine and weekly planning

Implement a deterministic, explainable scheduling engine. An LLM may interpret intent or suggest inputs; the server must calculate and validate feasibility.

Inputs include:

- Scope: a project, task selection, or the user's work for a chosen week.
- Remaining effort, priority, deadlines, dependencies, blocked state, and ownership.
- Authorized calendar availability, existing Kazi commitments, and a freshness watermark.
- Per-person local working hours, time zone, breaks, buffers, minimum and maximum session lengths, and daily workload caps.
- Preferred focus periods, earliest start, planning horizon, and pinned sessions.

Required scheduling behavior:

1. Find available intervals and split remaining work across several suitable sessions when needed.
2. Schedule only inside the affected person's permitted hours and capacity unless they explicitly choose an exception.
3. Respect dependencies and detect cycles. Do not schedule work before prerequisite work can realistically finish.
4. Exclude completed and canceled tasks; explain how blocked work limits the proposal.
5. Prefer feasible completion before the real deadline. Never fabricate free time or hide capacity shortfalls.
6. Minimize fragmentation and respect session-length preferences while using deterministic tie-breakers.
7. Return the scheduled minutes, unscheduled minutes, assumptions, conflicts, and a plain-language explanation.
8. Offer two or three meaningfully different alternatives where feasible, such as earlier completion, fewer sessions, or preferred focus periods. Do not manufacture distinct options when only one is feasible.
9. Let users edit, select, reject, or regenerate proposals and adjust effort estimates before approval.
10. Keep ordinary edits to an existing active plan separate from creating a new recovery version. Neither should rewrite an earlier immutable snapshot.

If the work cannot fit, show the shortfall and offer useful choices: change scope, split work, select a later recovery target, ask for help, or explicitly expand permitted hours. Do not extend a deadline, book over a meeting, or assign work to another teammate silently.

Represent instants in UTC and preserve IANA time zones and the user's local scheduling intent. Use date-only values for date-only deadlines and define their cutoff in the deadline owner's time zone. Handle daylight saving changes, ambiguous local times, and nonexistent local times explicitly.

### 9. Deadline risk, stalled progress, and notifications

Build background evaluation that runs independently of the user's browser and produces actionable notifications.

Identify at least these conditions:

- A deadline is approaching and meaningful progress is absent or insufficient.
- Remaining effort exceeds available permitted time before the deadline.
- A task remains blocked and threatens dependent tasks or project completion.
- A task or project has missed its deadline and remains unfinished.
- A plan proposal needs review or an approved calendar write has failed.

Use explainable risk signals, not arbitrary claims that someone is late. Distinguish:

- **No recent update:** progress information is stale or missing.
- **At risk:** known effort, dependencies, or capacity suggest a problem.
- **Overdue:** the actual deadline has passed and work is incomplete.

A comment, title edit, calendar sync, or assistant conversation is not automatically meaningful progress. Qualifying signals include an explicit progress check-in, changed remaining effort, completed subtasks, a relevant work log, or changed completion state. Record `last_meaningful_progress_at` separately from generic `updated_at`.

Sensible initial defaults, all configurable:

- Approaching-deadline checkpoints at 72 hours and 24 hours when the item's lead time makes them applicable.
- A stale-progress signal after two working days without a meaningful update, evaluated against the owner's working calendar.
- Capacity risk whenever known remaining effort cannot fit before the deadline.
- One initial overdue alert, then a daily digest rather than repeated immediate alerts.
- Configurable quiet hours, snooze, notification channels, and per-project overrides.

Implementation requirements:

- In-app notification center is required. Browser notifications are optional and require permission. Email is optional and requires a configured delivery provider.
- In-app notifications must work without an email provider or browser-push permission.
- Deliver server-side alerts through Convex scheduled internal functions with durable notification and delivery records. Support bounded retries and a failed-delivery inspection path.
- Deduplicate by recipient, work item or plan, risk condition, and escalation window. A scheduled-function retry must not create another notification.
- Schedule relevant checks when tasks, deadlines, progress, dependencies, or calendar availability change. Use indexed next-evaluation timestamps for bounded reconciliation; do not scan every user's full task history on every tick.
- Aggregate project risk to avoid spamming users with a parent alert plus many identical child alerts.
- Notify the assignee and only authorized project owners or managers according to visible rules. Do not expose private task data to unauthorized recipients.
- Acknowledge and snooze affect notification behavior, not task completion or progress.
- Suppress obsolete alerts after completion, cancellation, permission removal, or resolution of the underlying risk.
- Use supportive language and actionable buttons: Update progress, Review plan, Adjust estimate, or Snooze.

Example notification:

> “API integration is due tomorrow. You have about 3 hours remaining and 90 minutes free before the deadline. Review a recovery plan or update your estimate.”

If information is incomplete, say so: “No progress update has been recorded,” rather than asserting that no work happened.

### 10. Recovery planning and preserved history

This is Kazi's defining workflow. Implement it as a first-class domain feature.

Trigger a recovery proposal when an unfinished task or project misses its deadline, when a user requests replanning, or when an explicitly enabled policy detects an impending capacity problem.

The sequence is:

1. Read the latest authorized state, progress, remaining work, dependencies, and calendar availability.
2. Keep the prior plan, original deadline, original session records, comments, and completion facts intact.
3. Generate a **proposal** for a new plan using only unfinished work and current constraints.
4. Explain the triggering problem and show what is carried forward, already completed, changed, unscheduled, or awaiting information.
5. Follow the affected user's effective review setting before applying the proposal.
6. When accepted or authorized for automatic application, create the next numbered immutable plan version and its linked execution records.
7. Synchronize new work sessions, report the actual outcome, and retain a navigable chain back to all earlier plans.

Lineage rules:

- Use stable IDs for the underlying project, task, and plan lineage.
- Every accepted version has its own ID, monotonic version number, parent version ID, root lineage ID, trigger, creator, creation time, and a snapshot of relevant inputs.
- Plan 2 must explicitly identify Plan 1 as its predecessor. Plan 3 must retain the full chain.
- For project-wide recovery, create a linked project iteration associated with the new plan version.
- For each unfinished task carried into the new version, create a task attempt linked to the canonical task and previous attempt where present.
- Completed work remains completed. Carrying a task forward must not duplicate completion credit, logged effort, or the business task in ordinary workload totals.
- If the user explicitly requests a fresh task or a separate replacement project, support it with `derived_from_task_id` or `derived_from_project_id` and a shared lineage reference. Display the relationship in both directions.
- Present iterations as the same topic with a visible history: “Website launch · Plan 2 · Recovery from Plan 1.” Do not scatter unrelated-looking duplicates throughout the project list.
- Rejected proposals do not become accepted plan versions or consume a visible version number. Concurrent acceptance must allocate one unique number transactionally.
- A previous version becoming superseded is an append-only lifecycle event or metadata relation; do not rewrite its original schedule snapshot.

Preservation of calendar events:

- Recovery planning must not move, delete, or silently rewrite the old plan's Google Calendar events.
- Keep historical sessions visible in plan history; offer an optional overlay for comparing old and new plans.
- Old future events that are still busy continue to block availability. Do not ignore them simply because the plan is old.
- If obsolete future Kazi sessions prevent a feasible plan, offer a separate, explicit action to release those future reservations. Show exactly which events would change and keep their original snapshots in history.
- Automatic recovery scheduling alone does not authorize releasing or editing previous reservations. Never modify past calendar events as a side effect of recovery planning.
- Do not reinterpret all old calendar sessions as incomplete tasks. Use actual task state and progress.

Recovery targets:

- A missed original deadline stays visible as missed even when a recovery target is scheduled.
- Show the original deadline and proposed recovery target side by side.
- Changing a contractual or user-defined deadline is a separate explicit operation with history.
- A recovery plan may be partially feasible. Disclose the remainder; never label an incomplete allocation a fully scheduled plan.

### 11. Review setting and automatic replanning

Use one clearly labeled control:

**Review new plans before scheduling**

Default: **ON**.

| Setting | Required behavior |
| --- | --- |
| ON | Generate a proposal and notify the user. No accepted recovery version, new execution attempt, or external calendar event is created until the appropriate user approves the specific proposal. |
| OFF | Treat this as the user's explicit opt-in to automatic recovery planning within their saved constraints. Create and schedule eligible new versions, preserve earlier plans, and notify the user afterward. |

Explain the OFF state in plain language: “Kazi can create and schedule recovery plans automatically within your planning preferences.” Show the affected scope before saving it.

Policy rules:

- Persist a default per user and allow visible project overrides. Display the effective policy on each proposal.
- Project overrides cannot remove another teammate's personal approval requirement or grant calendar-write authority.
- Turning review OFF requires an authenticated, deliberate setting change. Never infer opt-in from inactivity, an expired notification, a comment, or an LLM suggestion.
- Record who changed the setting, when, its scope, and the applicable constraints.
- Re-read the policy immediately before any side effect. If review is turned ON while an automatic job is queued, stop automatic application and leave a proposal for review.
- Automatic mode cannot override working hours, pinned events, permissions, missing calendar consent, unknown required estimates, dependency rules, or limits on the planning horizon.
- In team plans, approval and calendar authority are evaluated per affected person. A manager's approval does not authorize writes to a teammate's calendar. Show which portions await another person's approval; do not label the entire plan fully applied while required approvals or writes are pending.
- Simple personal focus blocks are the first-release scheduling target. Joint meetings and attendee invitations require a distinct, explicit workflow and may be added later.
- Provide a history of automatically created plans, an easy switch back to review mode, and a clearly scoped cancel action for newly created sessions. Canceling does not restore or rewrite a prior historical plan.

### 12. Proposal approval, concurrency, and reliable application

Use explicit state transitions for proposals and application, such as Draft, Awaiting approval, Approved, Applying, Applied, Rejected, Expired, Partially applied, and Failed. Keep accepted plan snapshots immutable; maintain current lifecycle state in events or separate projections.

Required guarantees:

- A proposal includes a revision/hash, its parent plan version, effort assumptions, calendar freshness, and relevant task revisions.
- Approval binds to that exact proposal revision. An edit invalidates the old approval.
- Before application, recheck calendar availability, task completion, estimates, dependencies, permission, and the effective review policy.
- If material facts changed, mark the proposal stale and regenerate or request review as appropriate. Never knowingly schedule over a newly added meeting.
- Repeated approval, webhook delivery, deadline evaluation, or scheduled-function retry must not create another accepted plan or duplicate calendar events.
- Deduplicate recovery triggers for the same scope and incident; reuse or refresh the existing pending proposal when appropriate.
- Enforce competing-update invariants inside Convex transactional mutations using indexed business-key checks, current revisions, and atomic state transitions. Define explicit idempotency records; do not assume that declaring an index creates a SQL-style uniqueness constraint.
- Persist external-write intent transactionally and dispatch it through Convex scheduled actions, with stable idempotency identifiers and provider-event reconciliation after uncertain responses. Do not assume that external API actions retry automatically or inherit the initiating caller's authentication context. Resolve the stored actor and recheck current permission and policy before a side effect.
- Do not claim a database transaction makes Google Calendar writes atomic. Track each write and recover from partial success or a crash.
- Show pending, partially applied, and failed states honestly, including which sessions were created. Retry only unresolved writes.
- Do not blindly compensate by deleting successfully created calendar events. Any rollback must be explicitly designed, limited to Kazi-owned resources, and visible to the user.
- Keep ordinary task operations available during provider outages where they do not depend on current calendar state.

### 13. MCP and conversational workflows

Provide a real, authenticated MCP server using the current supported protocol and SDK. This is a primary interface, not a decorative integration page.

Support external MCP-compatible assistants, including Codex and Claude Code where the selected client's capabilities permit. Document actual tested clients and connection requirements. Implement a remote HTTP transport with appropriate authentication on the selected hosted stack, verifying SDK and runtime compatibility. Any transport adapter must call the same authorized Convex functions and must not create a second source of truth. An optional local stdio adapter may share these contracts.

Expose a focused tool surface covering:

- Workspace and authorized member discovery.
- Project creation, listing, retrieval, and updates.
- Task creation, listing, updates, assignment, progress updates, and completion.
- Inbox capture without a project argument.
- Authorized availability queries and a weekly workload summary.
- Plan proposal generation, proposal retrieval, review, rejection, and application under the policy rules.
- Recovery-plan proposal generation and plan-version history.
- Notification listing and acknowledgement.
- Reading planning preferences and an explicit, protected workflow for changing automatic scheduling settings.

Example names may include `create_project`, `create_task`, `assign_task`, `record_progress`, `get_week_availability`, `propose_plan`, `propose_recovery_plan`, `approve_plan`, and `get_plan_history`. Choose consistent names and document their schemas.

MCP requirements:

1. Authenticate the caller and derive actor identity and workspace access from the session or token, not from a user-supplied actor ID.
2. Use narrowly scoped authorization for task access, calendar reading, scheduling, and plan approval. Offer revocation.
3. Reuse the same domain validation, permission checks, planning policies, and audit mechanisms as the UI.
4. Return structured IDs, human-readable summaries, validation errors, and useful next steps.
5. Distinguish proposal generation from scheduling. A `propose_*` call never writes calendar events.
6. An `approve_plan` call must identify the proposal and current revision and use an authorized confirmation workflow. Do not allow a generic `confirmed: true` argument to bypass missing permissions, missing preview, or the user's review policy.
7. Support explicit approval in a capable conversational client. Where a client cannot convey the required confirmation, return a secure in-app review link.
8. Treat task descriptions, comments, calendar event text, and retrieved content as untrusted data. They cannot grant permissions, change review settings, or issue hidden tool instructions.
9. Support client retries and idempotency for mutations, plus pagination for list operations.
10. Provide connection instructions, a capability list, smoke tests, and actionable authentication diagnostics. Do not fake successful tool execution.

Example user intents to support end to end:

> “Create a project called Cloud Certification and add tasks for networking, practice exams, and reviewing mistakes.”

> “Add ‘renew my passport.’”

> “Assign API integration to Amira and interface testing to Daniel in the Website Launch project.”

> “I need four hours for the certification project this week. Find several free periods around my calendar and show me a plan.”

> “I missed the deadline. Keep the old plan and suggest Plan 2 using my remaining work and current availability.”

> “Approve the second option for Plan 2.”

> “Show me what changed between Plan 1 and Plan 2.”

If the referenced project, person, week, or alternative is ambiguous, ask a narrow clarification. Natural-language convenience must not cause writes to the wrong workspace or calendar.

### 14. User experience and screen requirements

Design for fast capture and clear next actions. Avoid a feature-heavy enterprise dashboard. Use familiar language, readable typography, restrained color, keyboard support, and a responsive layout.

Primary navigation:

- **Today:** next sessions, assigned work, deadlines, and a few actionable alerts.
- **Inbox:** fast task capture and later organization.
- **Projects:** project list, project detail, task list, board, and people responsible.
- **My week:** connected calendar, work sessions, availability, and Plan my week.
- **Plans:** current plan, pending proposals, version history, and comparison.
- **Notifications:** actionable alerts, snooze, and history.
- **Team and settings:** invitations, access, calendar connection, planning preferences, review control, and MCP connection instructions.

Required flows:

1. **First use:** create an account, choose personal or team use, get an Inbox, add the first task, and optionally connect a calendar. Calendar connection must not block basic task capture.
2. **Project setup:** create a project, add several tasks, assign teammates, and define realistic deadlines and estimates.
3. **Weekly planning:** choose scope and week, review effort and availability, compare feasible session arrangements, then apply one.
4. **Deadline alert:** understand why an item is at risk and update progress or open a recovery proposal.
5. **Recovery review:** see the original plan and deadline, remaining work, proposed recovery target, new sessions, unscheduled work, and a clear Approve and schedule button.
6. **Automatic recovery:** understand the setting before enabling it, then inspect the new plan and scheduling receipt afterward.
7. **Team invitation:** invite someone with the intended role, accept the invitation, and see assigned work without exposing unrelated projects.

Every data-driven screen needs loading, empty, error, and permission-denied states. Show save and sync status. Avoid generic “Something went wrong” messages when a specific repair is possible.

Make important distinctions visible: proposed versus scheduled, deadline versus recovery target, assigned versus unassigned, and pending sync versus confirmed calendar creation. Keep implementation terms such as job IDs and OAuth scopes out of ordinary user flows unless needed in a diagnostics panel.

PWA behavior must be explicit: cache the application shell, provide install and update guidance, and offer a clearly marked last-synced read-only view where private-data caching is implemented. Keep caches account-scoped and clear private cached data on sign-out or account changes. Require connectivity for initial sign-in, server-confirmed mutations, plan approval, and calendar application. Do not imply that installing a service worker makes Convex data automatically available offline or enables reliable background execution on the device. Backend reminders continue through Convex; permission-based Web Push depends on browser and device support, with appropriate Home Screen installation guidance on supported iPhone/iPad versions.

Meet practical accessibility requirements: semantic controls, keyboard navigation, visible focus, labeled inputs, readable contrast, screen-reader announcements for important changes, and no reliance on color alone.

### 15. Persistence and service design

Design an explicit Convex document schema, typed references, indexes, validators, and controlled data evolution. Model relationships deliberately without assuming SQL joins or foreign-key constraints. At minimum cover:

- Kazi user profiles linked to immutable Clerk user IDs, workspaces, memberships, and invitations. Clerk owns login credentials and sessions; do not duplicate them in Kazi's application tables.
- Projects, project membership, Inbox preferences, tasks, subtasks, dependencies, comments, and progress records.
- Calendar connections, calendar selection, availability preferences, sync cursors, and external event mappings.
- Plan lineages, proposals and candidate alternatives, immutable plan versions, project iterations, task attempts, and work sessions.
- Approval records, policy changes, current lifecycle projections, and an append-only audit trail for important actions.
- Notification preferences, notifications, delivery attempts, risk incidents, durable jobs, and outbox entries.

Include workspace/tenant keys on applicable documents and validate consistent cross-record tenancy in every relevant Convex function. Check that referenced documents exist and belong to the correct workspace. A task cannot reference another workspace's project, assignee, plan, or calendar through a guessed ID. Internal and scheduled functions must also enforce the current actor's authority rather than relying on earlier client checks.

Keep scheduling inputs and decisions reproducible. Store the relevant input snapshot, availability watermark, algorithm version, assumptions, and the reason each work item was or was not scheduled. Do not copy unrelated private calendar event contents into plan snapshots.

Use indexed lookups and transactional mutation checks to prevent duplicate plan-version numbers, duplicate accepted application of a proposal revision, duplicate task attempts for the same accepted scope, and duplicate provider writes. Test concurrent acceptance against Convex's actual transaction semantics.

Provide typed Convex APIs and documented HTTP/MCP contracts with structured errors, pagination, authorization, request validation, and clear mutation semantics. Scheduled work must call the same domain helpers and authorized internal operations rather than duplicating business logic. Bound realtime query result sizes and unsubscribe from screens that are no longer active.

### 16. Security, privacy, and operational behavior

- Enforce authentication, workspace isolation, project permissions, and per-person calendar authority on every entry point, including MCP and jobs.
- Keep secrets server-side. Use environment-based configuration, encrypted credential storage, revocation, and redacted logs.
- Validate OAuth redirects and state, protect browser sessions and mutations appropriately, and validate webhook authenticity where the provider supports it.
- Expire invitations and review links; prevent replay or use outside their intended account, resource, and revision.
- Limit requests and expensive planning operations without imposing arbitrary product paywalls.
- Log important actions with actor, source, timestamp, resource, and result; avoid logging sensitive task descriptions or full calendar payloads by default.
- Offer export of the user's authorized projects, tasks, and plan history in a portable format. Document backup, restoration, account disconnection, and deletion behavior, including which Google events would remain.
- Use synthetic seed data and mocked provider fixtures in automated tests. Do not read live personal calendars merely to make a demo look populated.
- Include health checks and enough diagnostics to identify failed jobs, stale calendar sync, notification failures, and partially applied plans.
- Support backend restarts, concurrent scheduled executions, and uncertain action outcomes without losing reminders or creating duplicate side effects.
- Document local setup, secrets required for real integrations, schema/data evolution, Convex job inspection and recovery, manual export/backup and restoration procedures, and the chosen free-tier deployment path. Do not assume a paid backup feature exists on the selected plan.
- Measure current service usage and show actionable diagnostics for quota exhaustion. Do not automatically upgrade plans or silently enable pay-as-you-go billing to keep the app running.
- Do not publish the application, change live external resources, or incur paid services merely to finish a local build. Prepare everything feasible for review and clearly identify the remaining user-authorized connection or deployment step.

### 17. Quality targets and product measures

Use these initial targets as engineering and usability goals, not claims of measured production performance:

- A user can capture a task from the primary interface without first creating a project or connecting a calendar.
- A new user can reach a useful first project and first planning preview through a short guided onboarding flow.
- A representative weekly proposal for 100 tasks across a small team should normally complete within five seconds on documented development hardware, excluding provider network delays. Benchmark and report actual results.
- Core task APIs should normally respond within 500 ms against a documented local dataset, excluding third-party calls.
- Deadline evaluation should enqueue applicable alerts within five minutes under healthy scheduled-function operation. Actual delivery may be deferred by quiet hours or provider failure and must be visible.
- Zero unauthorized cross-workspace access or calendar writes in the permission test suite.
- Zero duplicate calendar events or accepted versions in retry and concurrency fixtures.
- Every accepted recovery plan has a complete lineage and preserves the previous version's immutable content.
- No mandatory AI provider or email provider is required to run the core automated tests or perform ordinary project management.

Track useful operational measures without requiring third-party analytics: proposal approval/rejection, unscheduled minutes, stale proposal rate, calendar-write failure rate, notification deduplication, and recovery-plan completion. Do not collect task or event text as analytics by default.

### 18. Required acceptance scenarios

Write meaningful automated tests for these behaviors. Use explicit clocks, time zones, and provider fixtures where needed.

| ID | Given / When | Required result |
| --- | --- | --- |
| A01 | A signed-in user creates a task without a project through the UI or MCP. | The task persists in the correct default Inbox, with no guessed team destination. |
| A02 | A project has tasks assigned to three teammates. | Each person sees authorized assignments; ownership remains clear in project and personal views. |
| A03 | An unauthorized user guesses a project, task, plan, or calendar ID. | Read and write access are denied without leaking the resource's contents. |
| A04 | A task has six estimated hours, two hours of confirmed completed effort, and four hours of authorized free time. | The proposal allocates only the four remaining hours, across valid sessions; it does not mark the task complete. |
| A05 | A deadline is near and progress has not meaningfully changed. | An explainable, actionable notification is generated according to the user's thresholds and quiet hours. |
| A06 | The same risk evaluation and delivery jobs run repeatedly. | No duplicate active incident or duplicate notification delivery is produced. |
| A07 | An unfinished task misses its deadline with review ON. | A recovery proposal appears. Plan 1 and its external events remain unchanged; no new calendar writes or accepted Plan 2 occur yet. |
| A08 | The user approves the current recovery proposal. | Plan 2, its linked iteration/attempts, and new sessions are created once, with visible links to Plan 1. The missed original deadline remains visible. |
| A09 | The user has explicitly turned review OFF and an eligible deadline is missed. | A new version is automatically created and scheduled within policy, followed by a notification and an accurate scheduling receipt. |
| A10 | Review is turned ON after an automatic job is queued but before it applies. | The job performs no automatic scheduling and leaves the proposal awaiting review. |
| A11 | A meeting occupies a proposed slot before approval. | Revalidation catches the conflict; the stale proposal cannot silently schedule over it. |
| A12 | Concurrent backend jobs or repeated approvals attempt to apply the same proposal. | Exactly one accepted version and one provider event per intended session are created. |
| A13 | A provider times out after creating an event, or a backend action fails mid-application. | Reconciliation finds existing events and resumes without duplicates. Partial completion remains visible. |
| A14 | Remaining effort exceeds available time before the deadline. | The proposal shows a quantified shortfall and asks for a choice; it does not invent availability or silently extend the deadline. |
| A15 | A work session ends without a progress update. | The task remains incomplete; Kazi may request a progress check-in. |
| A16 | Old future Plan 1 sessions remain busy when Plan 2 is proposed. | They still block availability. Releasing them requires a distinct explicit action and never destroys the historical snapshot. |
| A17 | A manager proposes work for a teammate whose review remains ON. | The manager cannot disable that teammate's review requirement or write to their calendar without authority. |
| A18 | A task is completed, reassigned, or its estimate changes after a proposal is generated. | Application detects the changed facts and updates or invalidates the proposal before side effects. |
| A19 | A user's calendar token is revoked or availability data is stale. | Tasks remain usable; scheduling is paused or appropriately limited with a clear reconnect action, and unknown time is not reported as free. |
| A20 | Planning crosses a daylight saving transition or uses a date-only deadline. | Sessions and cutoff calculations follow the documented local-time rules without shifted or nonexistent times. |
| A21 | A task description contains instructions to disable approvals or access another workspace. | It is treated as data and cannot alter permissions or planning policy. |
| A22 | A user rejects or edits a proposal, or two alternatives compete. | Rejected options are not scheduled; edited approvals are invalidated; only the selected current alternative can be applied. |
| A23 | No AI key, email provider, or browser notification permission exists. | Core projects, tasks, deterministic proposals, MCP capabilities, and in-app reminders still function. |
| A24 | An invited teammate accepts, then later loses workspace access. | Initial access matches the invitation; removal revokes future access and unauthorized jobs while preserving history. |
| A25 | The system restarts or the browser is closed while a reminder is due. | Durable scheduled functions still evaluate and deliver the applicable reminder once. |
| A26 | A project reaches Plan 3 and some work finished under Plan 1. | The complete lineage remains navigable, finished work is not duplicated, and ordinary workload totals count remaining work once. |
| A27 | The production frontend build is served over HTTPS and installed on a supported device. | The PWA has correct icons, navigation, an update flow, and a useful offline shell; unsupported capabilities are explained honestly. |
| A28 | A user signs out or another user signs in on the same device. | Cached private data and subscriptions cannot leak across accounts. Offline views are marked stale; approving a plan or confirming a calendar write requires current server connectivity. |
| A29 | The application runs on the selected free service plans. | Projects, teams, planning, reminders, and the hosted frontend need no extra server, paid organization feature, or mandatory AI provider. Usage exhaustion is visible and does not trigger an automatic paid upgrade. |

Also test the scheduling algorithm independently: interval subtraction, effort accounting, dependency ordering and cycles, buffers, daily limits, multiple calendars, free/busy differences, deterministic output, and multi-person permission boundaries.

### 19. Build sequence and reviewable deliverables

Implement working slices in this order, keeping each executable:

1. **Foundation:** React/Vite PWA scaffold, Clerk identity, Convex schema/functions, workspace isolation, data setup, and synthetic seed data.
2. **Work management:** Inbox capture, projects, tasks, ownership, progress, permissions, invitations, and team onboarding.
3. **Calendar:** OAuth, calendar selection, availability, synchronization, diagnostics, and provider test fixtures.
4. **Planning:** deterministic allocation, weekly preview, multiple sessions, candidate alternatives, and approval/application.
5. **Recovery:** version lineage, iterations and attempts, preserved history, missed-deadline flow, and the review/automatic policy.
6. **Reminders:** risk evaluation, in-app notifications, deduplication, quiet hours, and optional delivery adapters.
7. **MCP:** authenticated tool surface using the same services, with connection instructions and a verified end-to-end conversational workflow.
8. **Completion:** PWA installation and offline behavior, accessibility, failure recovery, concurrency tests, quota checks, Cloudflare deployment preparation, operational documentation, and final validation.

Prepare at least:

- The working React/Vite PWA, Convex backend and scheduled jobs, Clerk integration, and authenticated MCP interface.
- Convex schema, indexes, any required data-migration scripts, and synthetic development seed data.
- `.env.example` containing names and safe placeholders, never real secrets.
- A documented local development path using the selected services and fixture-backed tests. Containerized self-hosting is not a first-release deliverable.
- A root README with exact install, development, seed/data-update, test, Convex deployment, and Cloudflare frontend deployment commands, plus Clerk and domain configuration steps.
- Product behavior and permission documentation.
- Architecture and data model documentation, including plan lineage and immutable history.
- Planning and replanning rules, including approval state transitions and concurrency strategy.
- API and MCP schemas, setup instructions, and tested client examples.
- Calendar setup and troubleshooting guidance.
- Operational guidance for reminders, synchronization, export/backup and restoration, PWA updates, quota monitoring, and the selected free-tier hosting setup.
- A test report listing what was actually run, results, and any externally blocked checks.
- A concise decision log distinguishing product requirements from implementation assumptions.

Use screenshots or a short local walkthrough to demonstrate the first task, team assignment, weekly proposal, overdue alert, Plan 2 review, automatic recovery, and plan comparison. A polished screenshot does not substitute for a working backend.

### 20. Definition of done and final handoff

The first release is complete only when the required workflows operate against persistent Convex storage, Clerk identity and Kazi permissions are enforced, scheduled work survives restarts, MCP calls reach the real domain services, the PWA works on supported devices, and the acceptance scenarios pass. A public deployment is a separate authorized step; prepare the selected hosting configuration and report whether live deployment was actually performed.

Run the appropriate build, type checks, static checks, integration tests, and critical end-to-end tests. Fix failures introduced by the implementation. Do not add superficial tests that merely repeat implementation details.

Be candid about integration verification:

- A mocked Google Calendar test is not a live Google Calendar connection test.
- An unconfigured email adapter is not a working email notification channel.
- A generated MCP configuration is not proof that a client connected successfully.
- A local build is not a deployed service.

If credentials or external access are missing, finish and verify everything independent of them, preserve a runnable fixture-backed development mode, and provide exact connection steps. Keep those limitations visible rather than claiming full integration completion.

At handoff, state:

1. What was built and where it runs.
2. How to run the PWA and Convex development backend, inspect scheduled work, and deploy the frontend to Cloudflare when authorized.
3. How to create a personal task and onboard a team.
4. How to connect Google Calendar and an MCP client.
5. How review mode, automatic mode, and preserved plan history behave.
6. What was tested and any remaining external configuration or material limitations.

Start now by inspecting the target workspace, recording the small number of necessary assumptions, and implementing the foundation. Continue through the required features; do not end after a plan or a visual mockup.

## END MASTER PROMPT
