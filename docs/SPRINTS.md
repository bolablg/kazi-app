# Sprints

Sprints give a personal or team workspace one shared planning period with several concrete objectives. Open **Sprints → New sprint** to use the full-page planner: choose the team and inclusive dates, describe the objectives, and select existing tasks. Desktop places available and selected work beside each other; mobile stacks them. A sprint can last from one to 28 days, contain up to 100 tasks, and have up to 20 objectives. Its dates use the creator's saved timezone.

Names are automatic: **Platform - Sprint - W44** for a team named Platform, or **Perso - Sprint - W44** for a personal workspace. The number is the ISO week of the sprint's start date, padded to two digits. A multiweek sprint uses only its starting week; a December start can therefore be W01. The name follows draft date/team changes and stays fixed after starting. Dates remain visible to distinguish periods with the same week number in different years.

Each objective has an outcome, optional success criterion, and one accountable lead. An optional overall focus can connect them. Assign each selected task to one primary objective or **Other work** for support work. The sprint keeps one authoritative task selection, so objective groups do not duplicate cards or calendar effort.

Sprints are optional. Tasks retain their projects, deadlines, and responsibilities. Tasks can belong to one open sprint at a time; past participation remains in history. Select individual subtasks rather than their parent so effort is counted once. Remove a selected parent from its sprint before adding subtasks.

## Start and carry out the work

**Save draft** stores a Planned sprint and opens its resumable planning page. Incomplete objectives can be saved. **Start sprint** saves first, then starts only when every objective has a clear outcome and at least one selected task. There is one Active sprint per personal or team workspace. Starting records the original objective definitions, assignments, and task selection. Active sprint names and dates stay fixed; its owner or a team manager can edit objectives and selection, with changes recorded in history.

The sprint's Board and List show the same canonical tasks as Tasks and project pages, with a filter for each objective and Other work. Dragging a card uses the existing stage and validation rules. Selecting work in a draft keeps its stage. Starting a sprint promotes selected Backlog tasks to To do when its start date arrives in the sprint timezone; if that date has already arrived, promotion is immediate. Backlog work added to an active sprint after its start date also moves to To do. The server reconciles future starts even when the app is closed, using its minute-based background job. Other stages are preserved, each transition records activity and lifecycle timestamps, and a later manual return to Backlog is respected. Closed, canceled, and expired sprints do not trigger promotions. Overview links to relevant active sprints, and Tasks has a sprint filter.

## Plan calendar sessions

Choose **Preview calendar plan** from the sprint, or choose the sprint in **Plans → New proposal**. The preview includes selected To do and In progress leaf tasks across every objective and Other work, once per task, within the sprint's dates. Backlog and To validate work receives no execution sessions. Missing workers, estimates, availability, and capacity appear through the existing planning checks.

Working hours, each person's saved horizon, dependencies, earlier task deadlines, and existing reservations still apply. Sprint bounds are enforced as absolute instants in its saved timezone, including when calendar owners use other timezones. The preview is a forecast, not a guarantee of delivery. Each affected calendar owner must approve before sessions are scheduled.

Changing a sprint invalidates its pending previews. Accepted plans keep their immutable snapshots. Several calendar plans can belong to one sprint; the internal project plan `iterations` records continue to represent plan lineage independently.

## Close and review

Choose **Close sprint**, assess every objective independently as Achieved, Partly achieved, or Missed, and optionally add an objective note and overall closeout note. Task completion is reported separately from these assessments; several objective results are not combined into an invented overall score.

Every unfinished, unarchived task needs a decision:

- **Return to Backlog** uses the normal task update rules and releases future native Kazi reservations for that task, as other moves out of execution do.
- **Move to a planned sprint** transfers the selection while retaining the task's current stage. In a sprint with objective groups, the card enters Other work until deliberately assigned.
- **Continue outside a sprint** retains its stage and removes it from open sprint selection.

To validate is unfinished until accepted by the owner. Archived work is retained as archived and never counts as completed. There is no automatic rollover.

History preserves original objective definitions and task assignments, later objective/scope changes, task stages at closure, each objective assessment, and unfinished-work decisions. Later task changes do not rewrite those results. Task links open the current task. Closing alone leaves accepted calendar bookings in place; calendar owners can release their future reservations through the plan receipt. Planned sprints can be canceled without altering their tasks.

## Access and agent support

Sprints belong to one existing personal or team workspace and may reference several projects in it. Creating a sprint requires a non-guest membership. Scheduled activation runs on behalf of the person who started or last changed the active task selection, and rechecks that person’s current project and task access. The sprint owner or a team manager controls its lifecycle; changing selected work also requires existing task edit authority. Proposing sessions for other people retains the existing project-manager permission checks.

A sprint and its calendar plans are visible only to people with access to every project linked in its current or historical selection. Removing a restricted task does not remove that history's access boundary. Task moves and later project restrictions also affect visibility. An empty sprint is visible to its owner, objective leads, and team managers. An objective lead must be a member with access to every project linked by the sprint. Sprint selection and objective leadership never grant project access or sprint-management rights.

Agents use `list_sprints`, `get_sprint`, `create_sprint`, `update_sprint`, `start_sprint`, `cancel_sprint`, and `close_sprint`. Sprint writes require the new explicit `sprints:write` credential scope. Starting a sprint, updating task selection, and closeout decisions that return work to Backlog additionally require `tasks:write`. Existing credentials do not acquire the new write scope automatically. `propose_plan` accepts `sprintId` using the existing planning scopes; approval stays separately scoped. Lifecycle edits require the current sprint `revision`, and mutations use stable request IDs for retries.

## Local verification and deployment

The schema changes are additive: existing workspaces load an empty sprint collection without a data migration. Older single-objective sprints appear as one objective with their tasks assigned to it. Their existing names, accepted plan versions, and closed history remain intact; editing a Planned sprint in the new planner adopts automatic naming. Deploy the updated Convex schema/functions along with the frontend before using sprints in a hosted environment.

Focused coverage lives in `app/tests/sprints.test.ts`, `app/tests/sprint-objectives.test.ts`, `app/tests/sprints-api.test.ts`, and `app/tests/e2e/sprints.spec.ts`.

From `app/`, run `npm run build` and `npm run test:e2e -- tests/e2e/sprints.spec.ts`. The full unit/API suite was verified with `NODE_OPTIONS=--no-experimental-webstorage npm test -- --maxWorkers=2`: the storage flag avoids the host's Node 25 global-storage conflict with jsdom. The project declares Node 24 in its engines. On a busy shared machine, fewer test workers also avoid unrelated UI test timeouts.
