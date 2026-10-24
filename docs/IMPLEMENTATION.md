# Implementation plan and decisions

The master prompt is the product specification. It does not authorize live accounts, deployment, DNS changes, or paid services. The original document is preserved.

## Executable slices

1. Typed React/Vite PWA; reusable domain engine; synthetic local demo; Clerk/Convex production adapter.
2. Inbox, project/task management, ownership, progress, search, board, invitations, permissions and audit.
3. Deterministic scheduling, proposal review, immutable plan lineage and recovery policies.
4. Convex persistence, scheduled risk checks, notification deduplication, calendar OAuth and durable write intents.
5. Authenticated MCP transport, PWA behavior, tests and hosting/operations documentation.

## Decisions

- Local demo uses synthetic fixtures in a browser-only store and labels itself throughout. It never impersonates Clerk identity, a live calendar, or a deployed backend.
- Production requires explicit Clerk and Convex configuration; credentials are not present in this new workspace.
- No LLM is required. Capture is structured, with assistant instructions and MCP for natural-language work.
- The latest user direction uses black text, clear structural dividers, full-width panels, and a single environment with multiple projects. The supplied Height screenshot and Asana view/navigation patterns inform task-oriented layouts. Overview contains Calendar and Schedule; Tasks owns List, Board, and Archive. Plans combines proposal creation/review and accepted history in separate tabs; Tasks uses one collection with project/team filters and Personal planning for work outside named projects. The separate My week calendar is removed. Account and connection controls live under the user menu. The sidebar’s collapsible Favorites list contains only the current person’s starred projects, with the full list under Projects. Colored task labels classify work separately from project colors.
- UTC instants and IANA zones are used for scheduling. Date-only deadlines end at midnight of the following local day. DST ambiguity is rejected rather than silently shifted.
- Review is on by default. Approval binds a revision. An external assistant receives an in-app review URL for any scheduling approval.
- Inbox tasks are private in personal workspaces. Team Inbox is visibly shared. Guests require explicit project access.
- Leaf tasks carry effort; parents with children do not add workload a second time.
- Cloudflare serves static assets; Convex owns data, authorization and durable execution. Remote MCP uses the SDK's web-standard HTTP transport where compatible with Convex.
- RTK instructions were found in `/Users/bolablg/RTK.md`; shell commands use the RTK proxy. No repository/ancestor AGENTS.md existed at inspection.

## External validation gates

Live authentication, Google OAuth consent/refresh/revocation, Convex deployment and scheduler behavior, MCP over a deployed authenticated endpoint, provider concurrency and actual device installation require configured services. They must be reported separately from fixture tests. No live accounts or DNS are changed by this build.

## Final implementation notes

- Added project status/priority/ownership editing, task collaborators/labels, project and deadline filters, and explicit deadline-change activity.
- Accepted versions now retain reproducible scheduling inputs, typed iteration/attempt links and the original calendar destinations. Destination changes invalidate approval and cannot redirect a queued provider write.
- Workspace selection matches stable workspace keys rather than guessing among duplicate names. Live account changes construct a new Convex client and in-memory query cache.
- Minimum session length is enforced without stranding a tiny remainder when a later valid slot exists; the 100-task benchmark allocates all 4,500 remaining minutes.
- MIT is the chosen source license for this local implementation. System fonts are used; historical font license notices are retained. This does not publish or distribute the repository.
- The preserved master prompt SHA-256 is `718e7e088641ebfedc979229fbdd306c7d9ddf39b5f3e48458a1db6e3e558547`.

Latest iteration: canonical five-stage workflow, separate Archive, To Brainstorm with review dates, distinct task reviewer/worker, immutable task/project lifecycle facts, stage-duration analytics, multi-team filtering, optional durable Resend invitations, and full-page task detail view with description before compact metadata. Board columns use available viewport height and independent vertical scrolling. Cards have no Move to dropdown; dragging and the task status field provide transitions. Scrollbars use thin native thumbs and transparent tracks. Development source changes trigger a debounced reload and stale development service workers are removed.
