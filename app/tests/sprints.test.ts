import { describe, expect, it } from "vitest";
import { execute, visibleState } from "../shared/domain";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import type { Command, Context, Sprint, State, Task } from "../shared/model";
import { defaults } from "../shared/model";
import { allocate, localInstant } from "../shared/scheduler";
import { mergeTeamStates } from "../shared/teams";

const now = Date.parse("2026-10-26T13:00:00Z");
let sequence = 0;
const context = (actorId = DEMO_USER): Context => ({
  actorId,
  now,
  id: () => `sprint-test-${++sequence}`,
  verifiedCalendar: true,
});
const create = (taskIds = ["work-a"]): Command => ({
  type: "create_sprint",
  title: "First shared task",
  objective: "A new teammate can complete their first shared task",
  successCriteria: "An invited teammate completes the flow",
  startDate: "2026-10-26",
  endDate: "2026-11-08",
  timezone: "America/Chicago",
  taskIds,
});
function base(): State {
  const state = fixtureState(now);
  const template = state.tasks[0];
  state.tasks = ["work-a", "work-b", "work-c"].map((id) => ({
    ...structuredClone(template),
    id,
    title: id,
    projectId: "website",
    status: "todo",
    ownerId: DEMO_USER,
    assigneeId: DEMO_USER,
    dependencies: [],
    parentId: undefined,
    deadline: "2026-11-08",
    remainingMinutes: 60,
    estimatedMinutes: 60,
  }));
  state.proposals = [];
  state.versions = [];
  state.iterations = [];
  state.attempts = [];
  state.busy = [];
  return state;
}
function setup(taskIds = ["work-a"]) {
  const result = execute(base(), create(taskIds), context());
  return { state: result.state, sprint: result.state.sprints![0] };
}
function start(state: State, sprint = state.sprints![0]) {
  return execute(
    state,
    { type: "start_sprint", id: sprint.id, revision: sprint.revision },
    context(),
  ).state;
}
function preview(state: State, sprint = state.sprints![0]) {
  return execute(
    state,
    {
      type: "propose",
      sprintId: sprint.id,
      startDate: "2026-10-01",
      days: 28,
      trigger: "weekly",
    },
    context(),
  );
}

describe("sprint commitments and permissions", () => {
  it("adds a sprint to legacy state without copying tasks or modifying stages and deadlines", () => {
    const before = base(),
      { state } = execute(before, create(), context());
    expect(before.sprints).toBeUndefined();
    expect(state.tasks).toEqual(before.tasks);
    expect(state.sprints?.[0]).toMatchObject({
      status: "planned",
      revision: 1,
      taskIds: ["work-a"],
      projectIds: ["website"],
    });
    expect(visibleState(before, DEMO_USER).sprints).toEqual([]);
  });
  it("requires an objective, valid dates and a nonempty selection before activation", () => {
    const { state, sprint } = setup();
    sprint.objective = "";
    expect(() => start(state)).toThrow("objective");
    expect(() =>
      execute(
        base(),
        { ...create(), endDate: "2026-12-08" } as Command,
        context(),
      ),
    ).toThrow("28 days");
    expect(() =>
      execute(
        base(),
        { ...create(), endDate: "2026-10-25" } as Command,
        context(),
      ),
    ).toThrow("28 days");
    const empty = execute(base(), create([]), context()).state;
    expect(() => start(empty)).toThrow("Select work");
  });
  it("allows only one active sprint per workspace and uses exact revisions", () => {
    let { state } = setup();
    state = execute(state, create(["work-b"]), context()).state;
    state = start(state);
    expect(() => start(state, state.sprints![1])).toThrow(
      "current active sprint",
    );
    expect(() =>
      execute(
        state,
        {
          type: "update_sprint",
          id: state.sprints![0].id,
          revision: 1,
          patch: { objective: "Changed" },
        },
        context(),
      ),
    ).toThrow("changed");
    expect(() =>
      execute(
        state,
        {
          type: "update_sprint",
          id: state.sprints![0].id,
          revision: 2,
          patch: { endDate: "2026-11-09" },
        },
        context(),
      ),
    ).toThrow("keeps its dates");
  });
  it("rejects other-workspace IDs, duplicate selection, parents, and tasks in another open sprint", () => {
    const { state } = setup();
    expect(() => execute(state, create(["work-a"]), context())).toThrow(
      "another open sprint",
    );
    expect(() =>
      execute(base(), create(["work-a", "work-a"]), context()),
    ).toThrow("only be selected once");
    expect(() =>
      execute(base(), create(["another-team-task"]), context()),
    ).toThrow("unavailable");
    const parent = base();
    parent.tasks[1].parentId = "work-a";
    expect(() => execute(parent, create(), context())).toThrow(
      "individual subtasks",
    );
    expect(() =>
      execute(
        state,
        { type: "update_task", id: "work-b", patch: { parentId: "work-a" } },
        context(),
      ),
    ).toThrow("Remove the parent");
  });
  it("enforces sprint ownership, task editing rights, and the complete historical project boundary", () => {
    let { state, sprint } = setup();
    expect(() =>
      execute(
        state,
        { type: "start_sprint", id: sprint.id, revision: 1 },
        context("demo-amira"),
      ),
    ).toThrow("sprint owner");
    expect(() =>
      execute(state, create(["work-b"]), context("demo-amira")),
    ).toThrow("assignee");
    state.tasks.push({
      ...state.tasks[0],
      id: "private-work",
      projectId: "learning",
    });
    state = execute(
      state,
      {
        type: "update_sprint",
        id: sprint.id,
        revision: 1,
        patch: { taskIds: ["private-work"] },
      },
      context(),
    ).state;
    expect(visibleState(state, "demo-amira").sprints).toEqual([]);
    sprint = state.sprints![0];
    state = execute(
      state,
      {
        type: "update_sprint",
        id: sprint.id,
        revision: sprint.revision,
        patch: { taskIds: ["work-a"] },
      },
      context(),
    ).state;
    expect(visibleState(state, "demo-amira").sprints).toEqual([]);
    expect(visibleState(state, DEMO_USER).sprints).toHaveLength(1);
  });
  it("hides the complete sprint and its previews if a selected task moves to a restricted project", () => {
    const result = preview(setup().state),
      state = result.state;
    expect(visibleState(state, "demo-amira").proposals).toHaveLength(1);
    state.tasks[0].projectId = "learning";
    const visible = visibleState(state, "demo-amira");
    expect(visible.sprints).toEqual([]);
    expect(visible.proposals).toEqual([]);
  });
  it("merges sprints with workspace routing while preserving empty legacy workspaces", () => {
    const { state, sprint } = setup();
    const merged = mergeTeamStates(
      [
        { id: "team-1", state },
        {
          id: "team-2",
          state: { ...base(), workspace: { ...state.workspace, id: "other" } },
        },
      ],
      DEMO_USER,
    );
    expect(merged.sprints).toEqual([sprint]);
    expect(merged.resourceTeams?.[sprint.id]).toBe("team-1");
  });
});

describe("sprint calendar planning", () => {
  it("keeps one shared plan lineage when different authorized people propose sprint work", () => {
    let state = setup().state;
    state.tasks[0].assigneeId = "demo-amira";
    Object.assign(
      state.calendars.find((calendar) => calendar.ownerId === "demo-amira")!,
      { status: "demo", destinationId: "fixture-amira" },
    );
    state = execute(
      state,
      {
        type: "propose",
        sprintId: state.sprints![0].id,
        startDate: "2026-10-26",
        days: 14,
        trigger: "weekly",
      },
      context("demo-amira"),
    ).state;
    state = execute(
      state,
      { type: "approve", id: state.proposals[0].id, revision: 1 },
      context("demo-amira"),
    ).state;
    const first = state.versions[0];
    state = preview(state).state;
    expect(state.proposals.at(-1)!.parentVersionId).toBe(first.id);
    state = execute(
      state,
      { type: "approve", id: state.proposals.at(-1)!.id, revision: 1 },
      context("demo-amira"),
    ).state;
    expect(state.versions[1]).toMatchObject({
      parentId: first.id,
      lineageId: first.lineageId,
      number: 2,
    });
  });
  it("includes both partial local working days inside a one-day sprint in another timezone", () => {
    const windowStart = localInstant("2026-10-26", 0, "UTC");
    const windowEnd = localInstant("2026-10-26", 24, "UTC");
    const result = allocate({
      tasks: [
        { ...base().tasks[0], deadline: undefined, remainingMinutes: 600 },
      ],
      busy: [],
      preferences: {
        [DEMO_USER]: {
          ...defaults,
          timezone: "Pacific/Kiritimati",
          bufferMinutes: 0,
          dailyMinutes: 720,
        },
      },
      startDate: "2026-10-26",
      days: 1,
      now: windowStart,
      windowStart,
      windowEnd,
    });
    expect(result.scheduledMinutes).toBe(480);
    expect(result.remainingMinutes).toBe(120);
    expect(
      result.sessions.every(
        (session) => session.start >= windowStart && session.end <= windowEnd,
      ),
    ).toBe(true);
  });
  it("lets each affected owner release only their own future sprint sessions", () => {
    let state = setup(["work-a", "work-b"]).state;
    state.tasks[1].assigneeId = "demo-amira";
    for (const calendar of state.calendars)
      Object.assign(calendar, {
        status: "native",
        destinationId: "kazi",
        selectedIds: [],
        shareAvailability: true,
        lastSync: now,
      });
    state = preview(state).state;
    const proposal = state.proposals[0];
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: 1 },
      context(),
    ).state;
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: 1 },
      context("demo-amira"),
    ).state;
    const version = structuredClone(state.versions[0]);
    const own = version.sessions.find(
      (session) => session.assigneeId === "demo-amira",
    )!;
    const other = version.sessions.find(
      (session) => session.assigneeId === DEMO_USER,
    )!;
    expect(() =>
      execute(
        state,
        {
          type: "release_sessions",
          versionId: version.id,
          sessionIds: [other.id],
        },
        context("demo-amira"),
      ),
    ).toThrow("your own future");
    state = execute(
      state,
      { type: "release_sessions", versionId: version.id, sessionIds: [own.id] },
      context("demo-amira"),
    ).state;
    expect(
      state.proposals[0].alternatives[0].sessions.find(
        (session) => session.id === own.id,
      )?.status,
    ).toBe("released");
    expect(state.versions[0]).toEqual(version);
  });
  it("retains project-level review requirements for automatic sprint proposals", () => {
    let state = setup().state;
    state.members[0].preferences.reviewRequired = false;
    state.projects.find((project) => project.id === "website")!.reviewRequired =
      true;
    state = preview(state).state;
    expect(() =>
      execute(
        state,
        { type: "approve", id: state.proposals[0].id, revision: 1 },
        { ...context(), automatic: true },
      ),
    ).toThrow("Review was enabled");
  });
  it("plans only selected ready work, preserves deadlines, bounds dates and separates lineages", () => {
    let { state } = setup();
    const deadlines = state.tasks.map((task) => task.deadline);
    const result = preview(state);
    state = result.state;
    const proposal = state.proposals[0];
    expect(Object.keys(proposal.taskRevisions)).toEqual(["work-a"]);
    expect(proposal.inputs).toMatchObject({
      startDate: "2026-10-26",
      windowStart: localInstant("2026-10-26", 0, "America/Chicago"),
      windowEnd: localInstant("2026-11-08", 24, "America/Chicago"),
    });
    expect(proposal.alternatives[0].sessions.length).toBeGreaterThan(0);
    for (const session of proposal.alternatives[0].sessions) {
      expect(session.taskId).toBe("work-a");
      expect(session.start).toBeGreaterThanOrEqual(
        proposal.inputs!.windowStart!,
      );
      expect(session.end).toBeLessThanOrEqual(proposal.inputs!.windowEnd!);
    }
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: proposal.revision },
      context(),
    ).state;
    expect(state.versions[0].sprintId).toBe(state.sprints![0].id);
    expect(state.iterations).toEqual([]);
    const personal = execute(
      state,
      { type: "propose", startDate: "2026-10-27", days: 7, trigger: "weekly" },
      context(),
    ).state.proposals.at(-1)!;
    expect(personal.parentVersionId).toBeUndefined();
    expect(state.tasks.map((task) => task.deadline)).toEqual(deadlines);
  });
  it("invalidates previews on scope changes and rejects approval of a closed sprint", () => {
    let state = start(setup().state);
    state = preview(state).state;
    const proposal = state.proposals[0],
      sprint = state.sprints![0];
    state = execute(
      state,
      {
        type: "update_sprint",
        id: sprint.id,
        revision: sprint.revision,
        patch: { taskIds: ["work-a", "work-b"] },
      },
      context(),
    ).state;
    expect(state.proposals[0].status).toBe("stale");
    expect(() =>
      execute(
        state,
        { type: "approve", id: proposal.id, revision: 1 },
        context(),
      ),
    ).toThrow("fresh proposal");
    state = preview(state).state;
    const pending = state.proposals.at(-1)!;
    state = execute(
      state,
      {
        type: "close_sprint",
        id: sprint.id,
        revision: state.sprints![0].revision,
        outcome: "partial",
        note: "",
        decisions: ["work-a", "work-b"].map((taskId) => ({
          taskId,
          action: "outside",
        })),
      },
      context(),
    ).state;
    expect(() =>
      execute(
        state,
        { type: "approve", id: pending.id, revision: 1 },
        context(),
      ),
    ).toThrow("fresh proposal");
  });
  it("keeps working sessions inside absolute sprint boundaries across timezones and respects earlier deadlines", () => {
    const task: Task = {
      ...base().tasks[0],
      deadline: "2026-10-27",
      remainingMinutes: 600,
    };
    const windowStart = localInstant("2026-10-26", 0, "Pacific/Honolulu"),
      windowEnd = localInstant("2026-10-27", 24, "Pacific/Honolulu");
    const result = allocate({
      tasks: [task],
      busy: [],
      preferences: {
        [DEMO_USER]: {
          ...defaults,
          timezone: "Pacific/Auckland",
          workingDays: [1, 2, 3, 4, 5, 6, 7],
          dailyMinutes: 600,
        },
      },
      startDate: "2026-10-26",
      days: 2,
      now,
      windowStart,
      windowEnd,
    });
    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      expect(session.start).toBeGreaterThanOrEqual(windowStart);
      expect(session.end).toBeLessThanOrEqual(
        Math.min(windowEnd, localInstant("2026-10-27", 24, "Pacific/Auckland")),
      );
    }
  });
  it("requires affected calendar owners and preserves existing reservations", () => {
    let state = setup(["work-a", "work-b"]).state;
    state.tasks[1].assigneeId = "demo-amira";
    Object.assign(
      state.calendars.find((calendar) => calendar.ownerId === "demo-amira")!,
      { status: "demo", destinationId: "fixture-amira" },
    );
    state = preview(state).state;
    const proposal = state.proposals[0];
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: 1 },
      context(),
    ).state;
    expect(state.versions).toHaveLength(0);
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: 1 },
      context("demo-amira"),
    ).state;
    expect(state.versions).toHaveLength(1);
    const accepted = structuredClone(state.versions[0]);
    state = start(state);
    state = execute(
      state,
      {
        type: "close_sprint",
        id: state.sprints![0].id,
        revision: 2,
        outcome: "missed",
        note: "",
        decisions: state.tasks
          .slice(0, 2)
          .map((task) => ({ taskId: task.id, action: "outside" })),
      },
      context(),
    ).state;
    expect(state.versions[0]).toEqual(accepted);
    expect(
      state.proposals[0].alternatives[0].sessions.every(
        (session) => session.status !== "released",
      ),
    ).toBe(true);
  });
});

describe("sprint closeout and historical facts", () => {
  it("requires every unfinished decision, includes To validate, and leaves failed closeouts atomic", () => {
    const state = start(setup(["work-a", "work-b"]).state),
      sprint = state.sprints![0];
    state.tasks[1].status = "to_validate";
    const before = structuredClone(state);
    const command: Command = {
      type: "close_sprint",
      id: sprint.id,
      revision: sprint.revision,
      outcome: "partial",
      note: "",
      decisions: [{ taskId: "work-a", action: "outside" }],
    };
    expect(() => execute(state, command, context())).toThrow(
      "every unfinished",
    );
    expect(() =>
      execute(
        state,
        {
          ...command,
          decisions: [
            { taskId: "work-a", action: "outside" },
            { taskId: "work-a", action: "backlog" },
          ],
        },
        context(),
      ),
    ).toThrow("every unfinished");
    expect(state).toEqual(before);
  });
  it("returns work to Backlog, transfers work, and records closure stages before later edits", () => {
    let state = start(setup(["work-a", "work-b"]).state);
    state = execute(state, create([]), context()).state;
    const target = state.sprints![1];
    state.tasks[0].status = "in_progress";
    state.tasks[1].status = "to_validate";
    const sprint = state.sprints![0];
    state = execute(
      state,
      {
        type: "close_sprint",
        id: sprint.id,
        revision: sprint.revision,
        outcome: "partial",
        note: "One flow needs review",
        decisions: [
          { taskId: "work-a", action: "backlog" },
          { taskId: "work-b", action: "sprint", sprintId: target.id },
        ],
      },
      context(),
    ).state;
    const closed = structuredClone(state.sprints![0]);
    expect(state.tasks[0].status).toBe("backlog");
    expect(state.tasks[1].status).toBe("to_validate");
    expect(state.sprints![1].taskIds).toEqual(["work-b"]);
    expect(closed.closeout?.tasks.map((task) => task.status)).toEqual([
      "in_progress",
      "to_validate",
    ]);
    const events = state.lifecycleEvents?.filter(
      (event) =>
        event.entityId === "work-a" &&
        event.fromStatus === "in_progress" &&
        event.toStatus === "backlog",
    );
    expect(events).toHaveLength(1);
    state = execute(
      state,
      {
        type: "update_task",
        id: "work-a",
        patch: { title: "Later title", status: "todo" },
      },
      context(),
    ).state;
    expect(state.sprints![0]).toEqual(closed);
    expect(() =>
      execute(
        state,
        {
          type: "update_sprint",
          id: sprint.id,
          revision: closed.revision,
          patch: { objective: "Rewrite history" },
        },
        context(),
      ),
    ).toThrow("already closed");
  });
  it("preserves removed original work and separates objective assessment from card completion", () => {
    let state = start(setup(["work-a", "work-b"]).state),
      sprint: Sprint = state.sprints![0];
    state = execute(
      state,
      {
        type: "update_sprint",
        id: sprint.id,
        revision: 2,
        patch: { taskIds: ["work-a", "work-c"] },
      },
      context(),
    ).state;
    state.tasks[0].status = "done";
    state.tasks[2].status = "done";
    sprint = state.sprints![0];
    state = execute(
      state,
      {
        type: "close_sprint",
        id: sprint.id,
        revision: sprint.revision,
        outcome: "missed",
        note: "The end-to-end outcome was not achieved",
        decisions: [],
      },
      context(),
    ).state;
    const closed = state.sprints![0];
    expect(closed.initialTasks?.map((task) => task.id)).toEqual([
      "work-a",
      "work-b",
    ]);
    expect(
      closed.closeout?.originalTasks.find((task) => task.id === "work-b")
        ?.status,
    ).toBe("todo");
    expect(closed.closeout?.outcome).toBe("missed");
    expect(closed.closeout?.tasks.every((task) => task.status === "done")).toBe(
      true,
    );
  });
});
