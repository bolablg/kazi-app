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

Resource IDs are opaque strings. Use IDs returned by Kazi instead of constructing them from names. An ID identifies a record; it is not a credential and does not grant access. MCP and application links enforce the current person’s team and project permissions.

Plan permalinks retain the requested proposal revision. A link to an outdated revision displays an explicit choice to review the current proposal; it does not silently approve a different revision. Old `/projects/<id>` and `/plans?proposal=<id>&revision=<n>` links remain supported.
