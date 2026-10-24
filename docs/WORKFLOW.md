# Tasks, projects, and timeline

Tasks has one collection with List, Board, and Archive tabs. Project, assignee, stage, priority, work-category label, due-date, and sort controls filter the same records. There is no All tasks / In boards / Inbox split. The default Personal planning project represents work outside a named project; its stable internal `inboxId` remains for historical compatibility. It can be favorited but cannot be archived. Old Inbox and Assigned to me bookmarks redirect to the corresponding Tasks filters.

| Task stage  | Meaning                                 | Scheduling                             |
| ----------- | --------------------------------------- | -------------------------------------- |
| Backlog     | Keep for later prioritization           | No allocation                          |
| To do       | Committed, ready to plan                | Eligible with owner/estimate/capacity  |
| In progress | Execution has started                   | Eligible remaining effort              |
| To validate | Finished work waiting for acceptance    | No new work sessions; review reminders |
| Completed   | Accepted finished work                  | Immutable completion fact              |
| Archive     | Rejected, blocked, or discontinued work | Excluded; restore to Backlog           |

Stages can be changed directly, by pointer/touch/keyboard drag, or through the status field in the full task view. Touch devices can scroll the board horizontally; the drag handle has its own touch activation. New tasks may start as Backlog or To do. Quick capture in Personal planning adds to Backlog. Archiving never counts as completion. List always shows the five active stages, including zero counts, followed by a collapsed Archive section. Board shows only the five active stages; the Archive tab opens archived work. Archive contents only mount when expanded. Task details remain available for review and restoration.

Global and project boards never copy tasks. Both call `update_task` on the same ID and receive the same Convex subscription. A move updates all views and reporting. Native future reservations are released when work leaves execution or its owner changes; accepted plan snapshots remain unchanged. Previously created external Google events use their explicit verified release workflow.

Overview owns Calendar and Schedule. It no longer duplicates the task list. Plans owns proposal review and immutable accepted history. A previous Overview List bookmark redirects to Tasks.

## Project lifecycle

Planned → In progress → On hold / Delivered is a separate project property. The header exposes it to authorized managers; project settings also edit dates and ownership. Internal `done` means Delivered for projects and Completed for tasks. A project’s delivery decision does not force task statuses or mark unfinished work complete. Progress uses non-archived tasks. Archiving a project preserves history.

## Timeline

The project Timeline is a horizontally scrollable Gantt-style date view with week/month scales. It uses explicit `startDate` and original deadline; dates are editable in task details and through MCP. Start-only tasks appear as one-day bars; deadline-only tasks appear as markers, without an invented start. Milestones use diamonds. Tasks without dates are counted separately. Dependency names appear on each row, and a prerequisite due after its successor’s planned start is flagged for review. There is no automatic cascading reschedule or critical-path solver in this version. Date validation rejects a start after its deadline. Allocation respects planned starts.

Reference: [Asana timeline and dependencies](https://help.asana.com/s/article/managing-tasks-and-dependencies-with-timeline).

## Full-page tasks and responsibilities

Clicking a task opens a URL-backed full page across the main content area. The title comes first, followed immediately by Description and then compact responsibility, status, project, and date fields. Close, All tasks, or Escape returns to Tasks; the existing Tasks view/filter is retained when available. Browser Back/Forward still follows resource navigation. Columns have bounded height and independently scrolling cards. Cards show a worker avatar with an accessible name; full responsibility fields are in the task page.

The **task owner** requests and accepts the work; the **worker** executes it. The same person can fill both roles. Submitting to To validate notifies the owner. The owner approves to complete, or returns to In progress with a required explanation and a worker notification. Administrators retain administrative authority. A worker cannot change the reviewer or approve another owner's work by changing the status field.

Dependencies are separate tasks that must finish first. The task page displays connected nodes with status text: green Completed, yellow In progress/To validate, and red waiting work. Subtasks remain a separate section. Collaborators use removable avatar/name chips. Circular dependencies are rejected by shared validation.

## Backlog review and history

**To Brainstorm** is a backlog disposition, not another stage. Give retained ideas a review date; until that date, they do not count as overdue backlog. Review reminders prompt promotion, archiving, or a later review. Saved per-person thresholds default to Backlog 90 days, To do 14, In progress 7, and To validate 2.

Every task/project change appends a timestamped immutable lifecycle fact in the transaction. The task page shows paginated history; Reports → Workflow calculates mean/median stage duration from known entries/exits and flags current aging work. Unknown historical entries are disclosed rather than invented.

References: [Asana navigation and task details](https://help.asana.com/s/article/navigating-asana), [dependencies](https://help.asana.com/s/article/use-dependencies-to-kick-work-off-at-the-right-time), and [approval workflow](https://help.asana.com/s/article/giving-feedback-and-approvals).

Board cards use click-to-open and pointer/touch/keyboard dragging. They do not contain Move to dropdowns. Main and board scroll areas use thin native thumbs with transparent tracks; each thumb remains proportional to its content and moves with scrolling. The full task page has one main scrolling region.

Visual reference: [Asana task actions and full-screen mode](https://help.asana.com/s/article/task-actions?language=en_US). Kazi follows the user-requested description-first order rather than copying Asana’s field order.
