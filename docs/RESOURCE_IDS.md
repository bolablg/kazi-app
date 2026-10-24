# Resource IDs and links

Names are display data. Projects, tasks, proposals, versions, attempts, iterations, sessions, notifications, activity, and reporting facts use opaque identifiers. A name is never converted into a resource slug, and renaming a resource does not change its ID.

Canonical application links use typed segments:

```text
/project/<project_id>
/project/<project_id>/task/<task_id>
/task/<task_id>                         # stable project-independent task link
/plan/<proposal_id>?revision=<revision>
```

The standalone task link resolves to its current project context. A link with an old project context follows the task's current project when the caller can access that task. Opening a task updates the address while retaining the underlying list/board/report. Refresh reopens it; browser Back closes it, and Forward reopens it. Copy task link produces a standalone permalink. Invalid or unauthorized IDs show an unavailable screen.

New records receive 128-bit opaque IDs. Transactional IDs use Convex's seeded strong PRNG; browser-demo capture uses Web Crypto UUIDs without separators. Deterministic session identities use a namespaced SHA-256 hash truncated to 128 bits, preserving deterministic allocation and retry behavior. Attempts receive new transactional IDs. These IDs identify records; they are not credentials and do not replace authorization. External identity-provider subjects and Google Calendar IDs retain their provider-defined formats.

The synthetic demo's former readable IDs (`website`, `t1`, and similar) are upgraded once across the entire reference graph: dependencies, parent tasks, proposal revision maps, planning inputs, accepted snapshots, session receipts, attempts/iterations, activity, notifications, invitations, due-date projections, and reports. Text and timestamps remain unchanged. Already-opaque IDs remain unchanged. Local aliases keep existing demo bookmarks working and redirect to canonical URLs; aliases are filtered with the same access rules as the resource. The migration never rewrites a live deployment's accepted history. Fresh development seeds use opaque IDs too.

Plan permalinks retain the requested proposal revision. A link to an outdated revision displays an explicit choice to review the current proposal; it does not silently approve a different revision. Old `/projects/<id>` and `/plans?proposal=<id>&revision=<n>` links remain supported.

This follows Asana's separation of a resource's string `gid`, its display name, and its permalink. Asana's current URL model uses typed project/task segments and supports older links through redirects. Kazi keeps its existing single application environment and omits Asana's additional workspace/version prefix. Sources: [resource identifiers and task permalinks](https://developers.asana.com/reference/tasks), [project identifiers](https://developers.asana.com/reference/projects), and [Asana URL format](https://forum.asana.com/t/upcoming-new-v1-asana-url-format-in-the-browser/1011489).
