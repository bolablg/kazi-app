# Insights

Open **Insights** for Summary, Workload, Performance, Workflow, and Goals. All share a global team filter, person filter, project filter, and Last 7/30/90 days or a custom period up to 366 days. Days use the viewer's saved timezone. The app does not require manual time logging, and logged minutes are not used as performance metrics.

## Delivery and flow

- **Tasks completed / throughput:** distinct leaf tasks finished in the selected period. If a task is reopened and completed again in the period, its latest finish counts once. Parent-task completions are excluded to avoid counting the same work twice.
- **On-time delivery:** on-time finishes divided by completed tasks with a due date. No-date tasks are excluded from the denominator. The finish record saves the assignee, project, original deadline text and resolved due instant. Later edits cannot rewrite the result. Date-only deadlines expire at the end of the assignee's local day; ISO deadlines retain their exact instant.
- **Finished late:** dated finishes past their saved due instant, with original due date, finish timestamp, delay, and task drill-through.
- **Created vs completed:** daily task creation and completion counts, with exact values in an accessible table. Creation counts use the current authorized task cohort, project/assignee filters, and leaf-task structure; reassignment or moving tasks can change that cohort.
- **Previous period:** an equal-length preceding period for ranges up to 183 days. The UI shows the absolute difference in completed tasks and the prior count. Longer custom periods omit the comparison instead of querying beyond the history range bound.
- **Median lead time:** elapsed calendar time from task creation to the recorded completion. Only finishes with a captured creation timestamp contribute; sample size is displayed.
- **Median cycle time:** elapsed calendar time from the recorded first In progress transition to completion, including waiting/blocked time. Only finishes with a recorded start contribute; sample size is displayed. Reopening clears the old cycle start; entering In progress starts a new cycle. Editing a task or re-saving the same status does not reset its start. Elapsed time is not hours worked.
- **Work in progress / archived:** current leaf tasks executing and work removed from the active flow. Blocked, rejected, and discontinued work is archived, rather than another board stage.
- **Overdue now:** a live snapshot of open leaf tasks past their deadlines, separate from period late finishes. Due instants preserve each assignee's timezone even when the viewer cannot inspect that person's planning preferences.

The Summary's insight cards describe delivery, current flow/backlog, focus allocation, and missing due dates/estimates. They use defined rules and actual counts rather than an opaque productivity score or fabricated predictions.

## Workload and time allocation

Confirmed calendar reservations provide planned focus by project and day. The calendar, project tags, sidebar swatches, and report charts share a palette, with names and values visible alongside color. Private busy events, pending/failed writes, released blocks, and unapproved proposals are excluded from this allocation.

Calendar reservations are plans, not evidence of working time or completion. The current workload table shows open/in-progress tasks and remaining effort estimates by person. Unestimated tasks are marked explicitly. Task counts and reservation lengths are not individual productivity ratings.

## Goals and achievements

Project goals show current task-based progress: completed leaf tasks divided by the current non-archived leaf-task scope, using the selected person/project filters. This is a current snapshot, not a historical percentage or a claim of business impact. Each project can include explicit **Project milestone** tasks, marked from task details; completed milestones appear as achieved. Parent milestones can remain visible without double-counting parent effort in task progress. Completed work in the selected period has direct task links.

## Data, coverage and export

Status changes automatically record start/status-change timestamps. Completing work appends an immutable reporting fact in the same transaction. Command retries use the existing idempotency mechanism, and re-saving an already-done task does not create another finish. Dates are not parsed from activity text or inferred from `updatedAt`.

Earlier completed tasks with no finish date remain in project progress but do not receive invented trend dates. Earlier records without start/creation snapshots are omitted from the corresponding elapsed-time metrics. Historical logged-time fields are retained for compatibility and data preservation, but the Insights interface does not use them. The progress form no longer requests manually worked minutes.

Live history uses a workspace/time index and cursor pagination (100 records per page), independent of the bounded activity feed. The screen waits for all pages before showing totals, including a previous-period window when applicable. Every page checks current workspace membership, present task access, and the reporting fact's historical project access. Private calendar titles and busy-event details are never included.

**Export daily totals** downloads filtered CSV rows with date, created tasks, completed tasks, and scheduled minutes. A full administrative database export, including `reportEvents`, is needed to back up immutable history; the bounded product export is not a full database restore image.

## Industry references

Further reading on the metrics used in Kazi:

- [Linear Insights](https://linear.app/docs/insights): lead/cycle time, issue counts, estimates, and filtered reporting. Kazi includes sample counts and omits unknown starts.
- [Atlassian flow metrics](https://www.atlassian.com/agile/project-management/kanban-metrics/): throughput, work in progress, lead time, and cycle time. Kazi exposes current bottlenecks and creation-versus-completion trends.
- [Asana reporting](https://help.asana.com/s/article/universal-reporting?language=en_US): task/project/goal reporting with scopes and filters. Kazi connects current project progress to explicit milestones and completed work.

Predictive completion dates, cumulative-flow history, business outcome/OKR scoring, and actual activity monitoring are not presented without the required data.

## Stage duration and backlog review

Workflow reports include all five stages, current counts and age, and total, mean, and median duration. Switch between Calendar time and Working time. Repeated visits to a stage are summed per task before calculating averages and medians; the table shows both visit and measured-task counts. Only visits ending during the selected period contribute to completed-duration statistics. Current age is separate. A stage requires a known entry event and an exit event to contribute a completed interval; old tasks without that evidence do not receive guessed durations. Current age uses status-change/creation timestamps and identifies the coverage separately. Calendar time includes nights, weekends, and waiting. Working time intersects each interval with the reporting person’s saved working days, hours, and timezone in Settings → Planning; defaults are Monday–Friday, 09:00–17:00. The same report calendar applies to every selected task so comparisons use a consistent basis. Daylight-saving changes are respected. Changing this calendar recalculates working durations from the original immutable timestamps. Neither measure represents hours worked. Lead and cycle time also expose both calendar and working-period medians. Review thresholds remain calendar days. A closed interval is attributed to its exit record’s person/project; prior entry evidence is retained through reassignment or project movement. Aging limits come from the task owner’s membership in that task’s team. Completed is a final outcome, not an aging queue.

Settings → Planning saves per-person aging thresholds. Defaults are Backlog 90, To do 14, In progress 7, and To validate 2 days. To Brainstorm keeps an idea in Backlog with a separate review date; it is excluded from aging alerts until review is due. The report links to flagged tasks and retained ideas.

Lifecycle facts include entity, action, actor, assignee/owner where applicable, revision, changed fields, timestamp, previous/new status, and a review-return reason. They are immutable and cursor-paginated independently of the short activity feed. All-team reports merge only currently authorized memberships and retain each team's permissions and historical project checks.

Insights is available at `/insights`. Existing `/reports` links redirect with their tab and filters preserved. MCP report tools and CSV formats retain their existing names.
