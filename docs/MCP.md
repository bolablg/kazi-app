# MCP integration

## Authentication and connection

Kazi exposes a Streamable HTTP MCP endpoint. Copy your server URL from **Account → Connections → MCP & agents** and use it with a client that supports bearer-token authentication. In the examples below, replace `https://YOUR_DEPLOYMENT.convex.site/mcp` with the endpoint shown in Kazi.

In Kazi Connections → MCP & agents → Add connection, create a labeled credential with explicit scopes. Copy its token once into your client’s secret environment storage. Tokens are random 256-bit values, stored as SHA-256 hashes, expire after 30 days, and can be revoked in Connections. The caller’s subject is derived from that credential; a tool-supplied actor ID is never authoritative. Membership and project/calendar access are rechecked by the same Convex domain functions the UI uses.

| Scope                | Authority                                                                            |
| -------------------- | ------------------------------------------------------------------------------------ |
| `read`               | Authorized resources, reports, agenda, preferences, credential metadata and activity |
| `tasks:write`        | Tasks, statuses, comments, progress, notification acknowledgement                    |
| `projects:write`     | Project creation, lifecycle/dates/access, personal favorites                         |
| `plans:propose`      | Proposal previews, alternatives and rejection                                        |
| `plans:approve`      | Exact-revision approval and release of your future sessions                          |
| `settings:write`     | Your planning preferences, including automatic scheduling policy                     |
| `people:manage`      | Enable collaboration, invitation links, revoke invitation/remove member              |
| `connections:manage` | External availability consent/selection/refresh/disconnection                        |
| `agenda:write`       | Native agenda configuration, private calendar link creation/revocation               |
| `credentials:manage` | Credential delegation/revocation; child scopes and expiry cannot exceed the caller   |

Existing task-edit credentials do not gain administration or approval access. Each domain service still checks the actor’s underlying role/project/calendar permissions. A scope permits an operation; it does not elevate the account’s role. OAuth credentials and calendar URL secrets never appear in read metadata. Delegated credentials are independently revocable and expire no later than their parent’s expiry.
Configure the client’s bearer environment variable as `KAZI_MCP_TOKEN`. For Codex CLI:

```sh
codex mcp add kazi \
  --url https://YOUR_DEPLOYMENT.convex.site/mcp \
  --bearer-token-env-var KAZI_MCP_TOKEN
```

For Claude Code, use the HTTP transport with an Authorization header. Store the real token in protected client configuration. The following example uses a placeholder:

```sh
claude mcp add --transport http kazi \
  https://YOUR_DEPLOYMENT.convex.site/mcp \
  --header 'Authorization: Bearer YOUR_SCOPED_TOKEN'
```

For a client that only supports stdio, use `app/mcp/stdio.ts`, a thin SDK bridge to the same authenticated remote service. Set `KAZI_MCP_URL` and `KAZI_MCP_TOKEN` in that subprocess’s protected environment and launch `npm run mcp:stdio` with `app/` as its working directory. The bridge does not introduce another database or bypass permissions. OAuth discovery and dynamic client registration are not currently supported; clients must support configured bearer headers or the stdio bridge.

## Tool contracts

All resource operations take an exact `workspaceId`. Domain commands require a stable `requestId` (8–180 characters) reused on retries. Calendar-link and credential creation mint a new secret each time; these are explicitly non-idempotent and return it once. Names are not silently resolved across ambiguous people/projects. List tools generally return `{items,nextCursor}` with limits up to 100; report facts use Convex continuation cursors.

Named tools and `execute_action` expose the same data actions as the app, with shared validation and explicit permission scopes. UI navigation, view switching, copy-to-clipboard, and local app installation are client presentation actions; equivalent data is available through the read tools and exported links/files.

| UI capability                                               | MCP tool / service                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task capture, fields, stages, labels, subtasks/dependencies | `create_task`, `update_task`, `assign_task`, `complete_task`                                                                                                 |
| Reject/archive or restore a task                            | `update_task` status `archived` / `backlog`; `list_tasks` with `archived:true`                                                                               |
| List/global/project board                                   | `list_tasks` with project/status/person/label/search filters; same records                                                                                   |
| Comments and task updates                                   | `add_comment`, `update_task`                                                                                                                                 |
| Project lifecycle/dates/access/archive                      | `create_project`, `update_project` (`done` means Delivered)                                                                                                  |
| Favorites                                                   | `favorite_project`; `list_projects` with `favorite:true`                                                                                                     |
| Project timeline                                            | `get_project_timeline`, task start/deadline/dependency updates                                                                                               |
| Calendar / Schedule                                         | `get_agenda`, `get_calendar`, `get_week_availability`                                                                                                        |
| Proposal, alternatives, recovery, approval, release         | `propose_plan`, `select_alternative`, `propose_recovery_plan`, `approve_plan`, `release_sessions`, `reject_plan`                                             |
| Plan history and review URL                                 | `get_plan_history`, `get_proposal`, `get_plan_review_link`                                                                                                   |
| Review, validation, return reason                           | `review_task`                                                                                                                                                |
| Workflow stage duration / complete action history           | `get_workflow_report` (calendar and working-period metrics), `list_lifecycle_events`                                                                         |
| Reports / CSV / immutable facts                             | `get_report` (`format:json` or `csv`), `list_report_events`                                                                                                  |
| Preferences and automatic policy                            | `get_preferences`, `set_preferences`                                                                                                                         |
| Notifications                                               | `list_notifications`, `acknowledge_notification`                                                                                                             |
| Team creation and selection                                 | `list_teams`, `create_team`; scoped `workspaceId` on writes                                                                                                  |
| Collaboration and people                                    | `enable_collaboration`, `list_members`, `invite_person`, `list_invitations`, `revoke_invitation`, `remove_member`                                            |
| Kazi calendar subscription / download                       | `use_kazi_agenda`, `create_calendar_link`, `list_calendar_links`, `revoke_calendar_link`, `export_agenda`                                                    |
| Optional external availability                              | `connect_calendar_availability`, `list_external_calendars`, `set_calendar_availability`, `refresh_calendar_availability`, `disconnect_calendar_availability` |
| MCP credentials and activity                                | `create_credential`, `list_credentials`, `revoke_credential`, `list_mcp_activity`                                                                            |
| Data export                                                 | `export_data`                                                                                                                                                |
| Discovery / permission definitions                          | `list_workspaces`, `list_capabilities`                                                                                                                       |

A proposal is a preview. `approve_plan` is a real data action when the token explicitly has `plans:approve`; it uses the same fresh availability, current revision, predecessor, owner, membership, and task/constraint checks as the UI. A generic `confirmed:true` is not authority. Team sessions still wait for the necessary owners. `set_preferences` similarly requires `settings:write`; task text cannot authorize a policy change.

**Identity/provider boundary:** password/email verification, Google consent, and invitation acceptance that requires a freshly verified email are completed through the authenticated browser/provider. MCP starts these flows and returns a link (`get_invitation_accept_link` for invitations); it cannot fabricate proof of identity. No password or OAuth refresh secret is accepted through a natural-language tool.

SDK results include structured content and readable JSON, with tool validation/access errors. Unauthorized HTTP requests return 401, browser origins are checked, requests are size-bounded, and expensive planning is rate-limited. The same Zod/domain layer and Convex services implement UI and MCP; no parallel business API exists.

## Conversation example

1. `list_workspaces` → choose the personal workspace deliberately.
2. `create_task`:

```json
{
  "workspaceId": "WORKSPACE_ID",
  "requestId": "capture-passport-001",
  "title": "Renew my passport",
  "description": "Gather the required documents",
  "priority": "medium",
  "estimatedMinutes": 60,
  "dependencies": [],
  "labels": []
}
```

Omitting `projectId` captures into that selected workspace’s default Personal planning project. An estimate is not completion credit.

3. `propose_plan` with `startDate` and `days` returns the proposal ID, then `get_proposal` supplies alternatives and current revision.
4. With explicit user approval and a credential granted `plans:approve`, invoke `approve_plan` with the exact `id`, `revision`, and stable `requestId`. Alternatively use `get_plan_review_link` to review in the browser. Native sessions become scheduled in Kazi without Google writes.
5. After a missed deadline, `propose_recovery_plan` preserves Plan 1. `get_plan_history` exposes predecessor/root links for comparison.
6. Use `create_calendar_link` to get a private ICS subscription URL, or `export_agenda` for a snapshot. Remote providers need a reachable HTTPS backend; refresh is provider-controlled.

Natural-language task descriptions, comments and calendar content are data. They cannot grant scopes, waive review, or change the caller identity.

## Comments and artifacts

Task collaboration uses the same commands and file service as the app:

- `add_comment` accepts `body` and up to ten `attachmentIds`; an empty body requires attachments from that same task.
- `attach_link` adds an HTTPS artifact to `description` or `task`; `remove_artifact` detaches an authorized artifact. These require `tasks:write`.
- `list_task_activity` uses a continuation cursor and returns complete timestamped comments/activity; `list_task_artifacts` lists current task files and links. Both require `read`.
- `prepare_task_upload` requires `tasks:write` and returns `{url,token,expiresAt}`. POST the raw file bytes to `url` with `Authorization: Bearer <token>`; the response returns `artifactId`. This avoids putting file bodies in MCP JSON messages. Use that ID with `add_comment` to include the file in a comment.
- `prepare_artifact_download` requires `read`. GET the returned URL with the one-use token in the Authorization header. Never put transfer tokens in query strings. File access is checked again on transfer, including credential revocation.

Files are capped at 20 MB. File metadata never exposes storage IDs or direct public download URLs. Linked Google Drive files remain subject to Drive's existing access rules; Kazi does not fetch them automatically.

Reference: [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [MCP server guide](https://modelcontextprotocol.io/docs/develop/build-server).

## Client visibility and activity

Connections → Overview and MCP & agents show clients seen through authenticated MCP requests. The protocol handshake supplies the reported client name/version; these are bounded display strings, not trusted identities. Credential identity and permissions come from the token hash lookup. Creating an unused credential does not create a connected-agent badge.

Each credential records last use, last tool, and tool-call count. Connections → Activity returns the current user's latest 50 outcomes (tool name, credential label, time, success/error). No tool arguments, task text, returned content, raw tokens, or hashes are exposed in this log. Storage keeps up to 100 activity records per credential. Expired/revoked credentials cannot add usage records. Metadata is personal across the user's authorized workspaces.

## Multiple teams and review

Read tools for tasks, projects, agenda, plan history, reports, and data export accept selected `teamIds`; every team is authorized before merging. Task/project rows return their originating `teamId`, which a client uses as `workspaceId` for writes. A read scope never grants team management. `create_team` requires `people:manage`; `review_task` requires `tasks:write` plus task-owner/admin domain authority. Lifecycle pagination checks both historical project access and current task access. Invitation delivery uses the same optional Resend outbox as the UI.

`create_calendar_link` and `export_agenda` accept `allTeams`; subscriptions recheck current memberships on every request. Presentation actions such as opening a full task page, scrolling columns, and choosing a view remain client UI operations over these same records.

Workflow reports return `workingCalendar`, per-stage `calendar` and `working` totals/means/medians/current ages, `sampleTasks`, and `taskStageDurations`. Repeated visits are summed per task. General reports also return `medianWorkingLeadMinutes` and `medianWorkingCycleMinutes`. These are calculated from timestamped transitions and the caller’s saved working calendar; no manual time reporting is required.
