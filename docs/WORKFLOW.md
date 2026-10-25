# Tasks, projects, and timeline

Tasks has one collection with List, Board, and Archive tabs. Project, assignee, stage, priority, work-category tag, due-date, and sort controls filter the same records. The default Personal planning project holds work outside a named project. It can be favorited but cannot be archived.

| Task stage  | Meaning                                 | Scheduling                             |
| ----------- | --------------------------------------- | -------------------------------------- |
| Backlog     | Keep for later prioritization           | No allocation                          |
| To do       | Committed, ready to plan                | Eligible with owner/estimate/capacity  |
| In progress | Execution has started                   | Eligible remaining effort              |
| To validate | Finished work waiting for acceptance    | No new work sessions; review reminders |
| Completed   | Accepted finished work                  | Immutable completion fact              |
| Archive     | Rejected, blocked, or discontinued work | Excluded; restore to Backlog           |

Stages can be changed directly, by pointer/touch/keyboard drag, or through the status field in the full task view. Touch devices can scroll the board horizontally; the drag handle has its own touch activation. New tasks start in Backlog in the app and through MCP. Choose To do explicitly when the task is ready to commit. Quick capture in Personal planning also adds to Backlog. Archiving never counts as completion. List always shows the five active stages, including zero counts, followed by a collapsed Archive section. Board shows only the five active stages; the Archive tab opens archived work. Task details remain available for review and restoration.

Global and project boards show the same tasks. Moving a task updates every view and its reporting history. Future Kazi reservations are released when work leaves execution or its owner changes; accepted plan snapshots remain unchanged.

Overview opens directly on the daily dashboard, without a Today tab. Calendar is a separate menu item with Calendar and Schedule tabs. Tasks holds the complete lists and boards; Plans holds proposal review and accepted history; Insights holds analytics.

## Daily overview

Overview is a short daily snapshot within the selected teams, project, and person. Needs attention combines overdue commitments, upcoming deadlines today, and work waiting for your validation. Validation requests belong to the owner even when another person is the worker. Overdue uses the actual deadline instant; a timed deadline that has already passed appears under Overdue rather than Due today. Backlog ideas, completed tasks, and archived work do not count toward deadline attention.

My focus shows In progress first, then To do work whose planned start has arrived and whose prerequisites are completed. The Projects panel's Favorites view uses the same project stars as project pages and the sidebar. The sidebar combines favorite projects and teams in five shortcuts, with More favorites opening the complete list. Recent shows recently updated named projects. Recent activity shows comments and system updates on relevant tasks, including their history after archiving. Every task opens its full task page.

Needs attention, My focus, and Recent activity each display five items per page, with independent previous/next controls and full counts. Changing the person or project starts from page one. Desktop panels share grid rows, so My focus and Recent activity end together. Project shortcuts use compact colored icons with the project name, status, and favorite action. Use Tasks for the complete task collection. Calendar keeps its month, week, and day ranges; Schedule keeps the chronological agenda. Calendar and Schedule live at `/calendar`; old `/?view=calendar` and `/?view=schedule` bookmarks redirect there with their range and filters intact. Person and project filters persist in the URL through reload and browser history. Overview stays focused on daily priorities on phone, tablet, and desktop.

## Project lifecycle

Planned → In progress → On hold / Delivered is a separate project property. The header exposes it to authorized managers; project settings also edit dates and ownership. A project’s delivery decision does not force task statuses or mark unfinished work complete. Progress uses non-archived tasks. Archiving a project preserves history.

## Timeline

The project Timeline is a horizontally scrollable Gantt-style date view with week/month scales. It uses explicit `startDate` and original deadline; dates are editable in task details and through MCP. Start-only tasks appear as one-day bars; deadline-only tasks appear as markers, without an invented start. Milestones use diamonds. Tasks without dates are counted separately. Dependency names appear on each row, and a prerequisite due after its successor’s planned start is flagged for review. There is no automatic cascading reschedule or critical-path solver in this version. Date validation rejects a start after its deadline. Allocation respects planned starts.

## Full-page tasks and responsibilities

Clicking a task opens a URL-backed full page across the main content area. The title comes first, followed immediately by Description and then compact responsibility, status, project, and date fields. Close, All tasks, or Escape returns to Tasks; the existing Tasks view/filter is retained when available. Browser Back/Forward still follows resource navigation. Columns have bounded height and independently scrolling cards. Cards show a worker avatar with an accessible name; full responsibility fields are in the task page.

The **owner** requests and accepts the work; the **worker** executes it. The same person can fill both roles. Submitting to To validate notifies the owner. The owner approves to complete, or returns to In progress with a required explanation and a worker notification. Administrators retain administrative authority. A worker cannot change the reviewer or approve another owner's work by changing the status field.

New tasks start with **Task belongs to**: Personal is private to you; a team task follows that team's project access. Selecting a different scope changes the available projects and people. Subtasks inherit their parent's team and project. Owner and Worker are searchable fields; type a name, username, or email and select a person. Collaborators use the same search with removable person chips. Suggestions only include members of the task's team who already have access to its project. A collaborator can comment and receive updates; collaboration does not grant task-editing or review authority.

Dependencies are separate tasks that must finish first. The task page displays connected nodes with status text: green Completed, yellow In progress/To validate, and red waiting work. Subtasks appear directly under the description as clickable rows; each opens its own task page, with a link back to the parent. Collaborators use removable avatar/name chips. Circular dependencies are rejected by shared validation.

Dependencies may span projects the actor can access **within the same team**. The picker and connected nodes identify the project; another team's tasks are excluded. Subtasks remain within their parent's project. A dependency indicates a prerequisite; it does not copy the task or automatically change its status.

Board titles show at most 96 characters and two lines, with an ellipsis when shortened. The full title remains available on hover, to assistive technology, and on the task page. High, medium, and low priority use red, amber, and green respectively, with a text label in every view.

## Task activity and artifacts

The full task page has one Activity feed with a comment composer and paginated history. Comments, file attachments, and system updates appear together. Status updates show the previous and new stage. Comments support multiline text and up to ten attachments, including attachment-only comments. New comments notify the owner, worker, and collaborators who retain project access. Comments and artifacts are timestamped; they do not count as execution progress or logged time.

Type **@** followed by a name, username, or email in a description or comment, then select a suggestion. A selected mention is highlighted and refers to the person's stable account ID. Mentions add that person as a collaborator and notify them when the description is saved or the comment is posted. Plain typed @text does not notify anyone until a person is selected. Saving an unchanged description does not repeat mention notifications; repeated mentions of the same person in one comment produce one notification. Mentions never grant access to another team's work or a private project. Editing the text of a mention turns it into plain text until a person is selected again.

Attach files directly under Description or under Artifacts. Files are limited to 20 MB each and 100 active artifacts per task. HTTPS links may reference Google Drive or other services; Kazi stores the link without fetching its contents or changing source permissions. Removing an artifact detaches it while preserving the historical activity. An uploader or task editor may remove an artifact. Source documents remain at their original provider.

Files use private storage with authenticated task access. Transfers have single-use credentials that expire after ten minutes; current membership, project visibility, and MCP credential validity are rechecked when used. Downloads use attachment disposition, never inline active content or public storage URLs.

## Backlog review and history

**To Brainstorm** is a backlog disposition, not another stage. Give retained ideas a review date; until that date, they do not count as overdue backlog. Review reminders prompt promotion, archiving, or a later review. Saved per-person thresholds default to Backlog 90 days, To do 14, In progress 7, and To validate 2.

Every task/project change appends a timestamped immutable lifecycle fact in the transaction. The task page shows paginated history; Insights → Workflow calculates mean/median stage duration from known entries/exits and flags current aging work. Unknown historical entries are disclosed rather than invented.
