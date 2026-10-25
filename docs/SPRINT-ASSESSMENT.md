# Sprint and objective assessment

**Status:** First version and the multi-objective planner refinement implemented; see [the sprint guide](SPRINTS.md)
**Date:** 2026-10-25
**Decision:** Recommend optional sprints with one outcome, a fixed period, and a selection of existing tasks. Validate the feature through a small first release.

## Context

Kazi already supports projects, task dependencies, subtasks, milestones, lists, boards, responsibility and validation, estimated remaining effort, calendar proposals, and immutable accepted plan versions. These answer what the work is, who does it, and when work sessions can happen.

The missing question is: **What outcome are we trying to achieve during this period, and which work have we selected to achieve it?** A sprint would answer that question. A group of cards alone would add little beyond projects and tags.

This is an assessment of the current source and documented behavior. It does not establish demand from observed usage or user research.

## Options considered

| Option                                       | Benefit                                                            | Cost and limitation                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Continue with projects, milestones, and tags | No additional concepts or maintenance                              | No explicit period commitment, sprint outcome, or closeout history                                                                |
| Represent sprints with tags or parent tasks  | Quick grouping of existing work                                    | Dates, lifecycle, capacity scope, and historical membership have no reliable home; parent tasks already have scheduling semantics |
| Add a small sprint resource                  | Explicit objective, dates, scope, review, and planning integration | Requires coordinated domain, persistence, permissions, UI, and MCP work                                                           |

Recommend the sprint resource when users regularly select work for a week or two. Keep ordinary task management available for continuous or ad hoc work.

## Product model

| Concept          | Purpose                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Project          | The broader body of work and its access boundary                         |
| Sprint           | Work selected for a fixed period                                         |
| Sprint objective | The outcome that makes the period worthwhile                             |
| Task             | An actionable piece of work, retaining its project and existing workflow |
| Calendar plan    | Proposed or accepted focus sessions for carrying out work                |

A sprint should reference canonical tasks. It should not copy tasks, become a parent task, or change task statuses merely because membership changes.

Example objective: “A new user can create a team, invite a colleague, and complete their first shared task.” The selected cards implement and verify that outcome. “Complete ten cards” measures activity without specifying the desired result.

Keep the objective as a required field when starting a sprint. An optional short success criterion makes the final assessment concrete. A separate objectives or OKR hierarchy is unnecessary for the first release.

## Recommended first release

1. Create a sprint with a name, objective, success criterion, start/end dates, timezone, and responsible owner. Default the period to two weeks, with a simple date override within the planner's current 28-day horizon.
2. Select existing tasks. Each task retains its project, owner, worker, dependencies, deadlines, and review rules. A task can belong to only one open sprint at a time, with earlier participation retained in history.
3. Use planned, active, closed, and canceled sprint states. Require an objective before activation. Allow one active sprint per personal or team workspace initially.
4. Reuse the current list and board components for the selected tasks. Put the objective, dates, task completion, and work awaiting validation above them. Add a sprint filter to Tasks and a compact current-sprint link on Overview.
5. Offer a calendar plan preview for the selected tasks within the sprint period. Use existing estimates, dependencies, working preferences, reservations, and individual approval requirements. Identify missing estimates or availability as unknown. Avoid presenting capacity as a delivery guarantee.
6. Close with an explicit objective assessment: achieved, partly achieved, or missed, plus an optional note. Show unfinished work and let the user explicitly return it to the backlog, place it in another planned sprint, or leave it outside a sprint in its current stage. Never infer task completion from sprint closure.

For scope, a sprint belongs to one existing personal or team workspace. Tasks from different projects in that workspace can participate. Cross-workspace sprints are out of scope. Sprint visibility needs its own explicit audience, with linked project permissions checked on every read and mutation. The first release should reject task additions incompatible with that audience; private project names, objectives, and aggregate counts must not leak through sprint views.

Do not add recurring sprint creation, automatic rollover, story points, velocity targets, burndown charts, extra board stages, or a general goal hierarchy to this first release.

## History and behavior rules

- Record the initial selection when a sprint starts, subsequent additions/removals, and the final state at closure. A mutable task `sprintId` alone cannot preserve this history.
- Keep task membership records separate from canonical tasks. A task can appear in several past sprint histories without being duplicated as work.
- Show original selection, added/removed work, completed work, and unfinished work separately. Removing cards must not silently improve the apparent completion of the original commitment.
- Report task delivery separately from the owner's objective assessment. Completing every selected card does not prove the intended outcome was achieved.
- Treat To validate as unfinished until the existing owner approval succeeds. Archiving is not completion.
- Preserve closed sprint records when tasks are subsequently changed, moved, reopened, or selected for another sprint. Historical views still enforce current access permissions.
- Sprint dates are planning boundaries; do not overwrite original task deadlines. Rescoping or moving work must respect task edit authority.
- Parent tasks and subtasks must not double-count effort. Reuse the existing leaf-work scheduling rule, and define a consistent hierarchy policy for sprint selection and display.
- Scope or date changes invalidate affected unaccepted plan previews. Accepted calendar plans retain their snapshots and existing rules for releasing future reservations. Closing a sprint must not silently erase bookings or rewrite accepted plans.

## Engineering fit and implementation work

The React/Convex architecture can support this without a replacement of the application. The feature is moderate in scope, rather than a board-only change.

- `app/shared/model.ts`: introduce sprint and membership types plus validated lifecycle commands. Add optional sprint context to planning proposals and versions.
- `app/shared/domain.ts`: implement permissions, transitions, membership invariants, start/close snapshots, and explicit sprint task selection for planning. Current proposals select a whole project or the actor's assigned tasks, so a sprint cannot yet be passed through as a simple filter.
- `app/convex/schema.ts`, `validators.ts`, and `store.ts`: add scoped sprint/membership persistence with additive rollout behavior for existing workspaces.
- `app/shared/teams.ts` and `app/src/data.tsx`: include sprint resources in workspace merging, visibility, command routing, and demo state.
- `app/src/WorkPages.tsx`, `TaskBoard.tsx`, and `PlanningPages.tsx`: reuse existing cards and controls; add sprint selection, objective display, lifecycle actions, and planning context.
- `app/shared/capabilities.ts`, the MCP server, and backend API contracts: add appropriate explicit permissions and sprint operations, using the same domain validation as the app.
- Reporting: add durable sprint scope and closure facts instead of deriving historical results from today's task fields. Keep existing task and project metrics intact.

The existing `iterations` table is **accepted project plan lineage**, not sprint storage. `app/shared/domain.ts` creates an iteration on acceptance of a project calendar proposal, linking the accepted version to its predecessor. A single sprint may require multiple calendar plans. Keep these concepts separate.

## Validation before release

- Verify lifecycle authorization, workspace isolation, restricted-project audiences, cross-project membership, and rejection of cross-workspace links through domain and Convex tests.
- Verify that moving work between sprints preserves original selection and closure results, including later task completion and reopening.
- Verify planning uses only eligible selected work, avoids parent/child effort duplication, respects existing reservations and approval rules, and handles stale proposals.
- Verify board/list updates affect the same tasks everywhere and that closing a sprint offers deliberate unfinished-work handling without changing acceptance rules.
- Verify MCP scope enforcement and parity with the app.
- Exercise existing workspaces without sprint data to ensure ordinary task, project, and calendar flows still work.

## Value check

Use the first release for two or three real planning periods. Check whether people can quickly identify the current objective, make more realistic selections using capacity, notice added scope, and make explicit decisions about unfinished work. Recurring use and clearer tradeoffs are stronger evidence than the number of sprint objects created.

Kazi's potential advantage is connecting an outcome and selected work to its existing scheduling and approval workflow. Sprints themselves are an established pattern; value comes from reducing planning friction and making commitments easier to assess.

## References

- [Scrum Guide: Sprint Backlog and Sprint Goal](https://scrumguides.org/scrum-guide.html#sprint-backlog): distinguishes the outcome, selected work, and delivery plan. Kazi can borrow this useful distinction without implementing the full Scrum framework.
- [Linear cycles](https://linear.app/docs/use-cycles): an existing example of time-bounded task selection. Its automatic scheduling and rollover are product choices, not requirements for Kazi.

## Follow-up review: shared period, several objectives

**Status:** Implemented. The full-page planner supports several objectives, accountable leads, optional overall focus, canonical task groups, resumable drafts, and per-objective closeout. Names follow `TeamName - Sprint - W{ISO start week}` or `Perso - Sprint - W{ISO start week}`. Draft names update with the start date; active names stay fixed. The discussion below records the design rationale.

The first version combines one shared period, one outcome, and selected work in one Sprint. A team doing several streams of work in the same period needs a clearer distinction between the planning period and its outcomes.

### Recommended model

- A team sprint defines the shared period and review. Personal workspaces use the same model independently.
- One or more sprint objectives describe the outcomes. Each objective can have one accountable lead, several contributors, a success criterion, and selected existing tasks. Objectives initially inherit the sprint's dates.
- People own and execute tasks across objectives. “My work” is a filtered view, rather than a separate sprint lifecycle for each person.
- Projects remain the existing classification and access boundary; a task keeps its project when selected under a sprint objective.
- Use one primary objective per selected task initially, so scheduling and rollups count work once. Keep support or unplanned work explicit when it does not fit an objective.
- Review objective outcomes separately from task completion at closeout. Keep one deliberate unfinished-work decision per task and avoid inventing a goal-achievement percentage from card counts.

An optional overall team focus can explain how objectives contribute together. Do not force unrelated work into a fictional shared outcome. Strict Scrum defines a single Sprint Goal; this proposed multi-objective planning model would be a deliberate Kazi product choice, not a claim of implementing Scrum.

### Alternatives and boundary

| Model                             | Assessment                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent sprint per person     | Useful in a personal space; a poor team default because shared outcomes and reassignment cross people                                                             |
| Team sprint with objective groups | Recommended when people share dates and review the period together                                                                                                |
| Nested sprints                    | Duplicates date, start/close, carryover, and calendar decisions without an established need                                                                       |
| Separate planning-group sprints   | Appropriate if groups truly need different dates and independent reviews; revisit the current one-active-sprint-per-workspace rule when that need is demonstrated |

The practical rule is: shared dates and review imply one sprint with several objectives; independent calendars and reviews imply separate sprint scopes. Arbitrary sprint nesting is unnecessary for either case. Preserve personal privacy and existing project permissions in any team rollup.

### Creation flow critique

The original SprintForm used the default Modal at a desktop width of 520 px. Inspection at 1440 × 1000 showed a 968 px tall dialog with 1113 px of content and a separately scrolling 260 px task picker. The Create button was below the initial visible area. These observations are from desktop; the mobile layout below is a proposal.

The proposed multi-objective workflow requires composing outcomes, selecting work, and assessing capacity. Recommend a dedicated planning page inside Kazi, retaining application navigation:

1. Team, automatic sprint name, dates, and optional overall focus.
2. Objective groups with success criteria and accountable leads; start with one objective and let additional groups be added when needed.
3. Existing-task selection and a visible selected-work/capacity summary. Desktop can use adjacent panels; mobile should stack the sections.

Provide explicit Save draft and Start sprint actions. Starting remains distinct from approving calendar sessions. Make drafts resumable so planning need not be completed in one sitting. Keep small dialogs for quick, bounded edits.

This is an evolution of the current model: migrate the existing objective into the sprint's first objective, retain canonical task IDs and dates, and preserve accepted calendar and closeout history. Objective membership must have one authoritative representation, and capacity must be calculated across all objectives for each person.

### Supporting references

- [Scrum Guide: Sprint Goal](https://scrumguides.org/scrum-guide.html#sprint-backlog) defines the single-goal Scrum model; the multi-objective recommendation above is our product judgment.
- [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) explains that content outside a modal is inert. This supports the interaction distinction, rather than prescribing a form width or requiring a full page.
