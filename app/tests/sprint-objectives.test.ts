import { describe, expect, it } from "vitest";
import { execute, visibleState } from "../shared/domain";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import type { Command, Context, SprintObjective, State } from "../shared/model";
import {
  automaticSprintName,
  sprintAssignments,
  sprintObjectives,
} from "../shared/sprints";

const now = Date.parse("2026-10-26T13:00:00Z");
let sequence = 0;
const context = (): Context => ({
  actorId: DEMO_USER,
  now,
  id: () => `objective-test-${++sequence}`,
  verifiedCalendar: true,
});
const objectives = (): SprintObjective[] => [
  {
    id: "invite",
    title: "A colleague can join",
    successCriteria: "Invitation accepted with correct access",
    leadId: DEMO_USER,
  },
  {
    id: "collaborate",
    title: "A team can complete its first shared task",
    successCriteria: "Owner accepts the result",
    leadId: DEMO_USER,
  },
];
const create = (): Extract<Command, { type: "create_sprint" }> => ({
  type: "create_sprint",
  objective: "",
  successCriteria: "",
  focus: "Make first collaboration useful",
  startDate: "2026-10-26",
  endDate: "2026-11-08",
  timezone: "America/Chicago",
  objectives: objectives(),
  taskIds: ["a", "b", "c"],
  objectiveAssignments: { a: "invite", b: "collaborate" },
});
function base(): State {
  const state = fixtureState(now),
    template = state.tasks[0];
  state.workspace.name = "Platform";
  state.tasks = ["a", "b", "c"].map((id) => ({
    ...structuredClone(template),
    id,
    projectId: "website",
    ownerId: DEMO_USER,
    assigneeId: DEMO_USER,
    status: "todo",
    dependencies: [],
    parentId: undefined,
    remainingMinutes: 60,
    estimatedMinutes: 60,
    deadline: "2026-11-08",
  }));
  state.proposals = [];
  state.versions = [];
  state.attempts = [];
  state.iterations = [];
  state.busy = [];
  state.calendars[0] = {
    ownerId: DEMO_USER,
    status: "native",
    selectedIds: [],
    destinationId: "kazi",
    lastSync: now,
  };
  return state;
}
const setup = () => execute(base(), create(), context()).state;
const start = (state: State) =>
  execute(
    state,
    {
      type: "start_sprint",
      id: state.sprints![0].id,
      revision: state.sprints![0].revision,
    },
    context(),
  ).state;

describe("automatic sprint names", () => {
  it.each([
    ["2026-10-26", "W44"],
    ["2026-02-02", "W06"],
    ["2025-12-29", "W01"],
    ["2026-01-01", "W01"],
    ["2027-01-01", "W53"],
  ])(
    "uses the ISO start week for %s, including ISO year boundaries",
    (startDate, week) => {
      expect(
        automaticSprintName({ name: "Platform", kind: "team" }, startDate),
      ).toBe(`Platform - Sprint - ${week}`);
      expect(
        automaticSprintName(
          { name: "Alex’s private space", kind: "personal" },
          startDate,
        ),
      ).toBe(`Perso - Sprint - ${week}`);
    },
  );
  it("generates names on the server and updates planned names while keeping active names stable", () => {
    let state = setup();
    expect(state.sprints![0]).toMatchObject({
      title: "Platform - Sprint - W44",
      automaticName: true,
    });
    state.workspace.name = "Engineering";
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 1,
        patch: { startDate: "2026-11-02", endDate: "2026-11-15" },
      },
      context(),
    ).state;
    expect(state.sprints![0].title).toBe("Engineering - Sprint - W45");
    state = start(state);
    const title = state.sprints![0].title;
    state.workspace.name = "Renamed team";
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 3,
        patch: { focus: "Revised focus" },
      },
      context(),
    ).state;
    expect(state.sprints![0].title).toBe(title);
    expect(() =>
      execute(
        state,
        {
          type: "update_sprint",
          id: state.sprints![0].id,
          revision: 4,
          patch: { title: "Changed after start" },
        },
        context(),
      ),
    ).toThrow("keeps its dates and name");
  });
  it("uses Perso only for personal workspaces and respects an explicit legacy custom name", () => {
    const state = base();
    state.workspace.kind = "personal";
    expect(execute(state, create(), context()).state.sprints![0].title).toBe(
      "Perso - Sprint - W44",
    );
    expect(
      execute(state, { ...create(), title: "Legacy named sprint" }, context())
        .state.sprints![0],
    ).toMatchObject({ title: "Legacy named sprint", automaticName: false });
  });
});

describe("multiple sprint objectives", () => {
  it("supports resumable incomplete drafts while requiring defined outcomes and work before starting", () => {
    let state = execute(
      base(),
      {
        ...create(),
        objectives: [{ id: "draft", title: "", successCriteria: "" }],
        taskIds: ["a"],
        objectiveAssignments: { a: "draft" },
      },
      context(),
    ).state;
    expect(state.sprints![0].status).toBe("planned");
    expect(() => start(state)).toThrow("clear outcome");
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 1,
        patch: {
          objectives: objectives(),
          taskIds: ["a"],
          objectiveAssignments: { a: "invite" },
        },
      },
      context(),
    ).state;
    expect(() => start(state)).toThrow("each sprint objective");
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 2,
        patch: {
          taskIds: ["a", "b"],
          objectiveAssignments: { a: "invite", b: "collaborate" },
        },
      },
      context(),
    ).state;
    expect(start(state).sprints![0].status).toBe("active");
  });
  it("rejects invalid objective IDs, duplicate objectives, foreign tasks, and inaccessible leads", () => {
    expect(() =>
      execute(
        base(),
        { ...create(), objectiveAssignments: { a: "unknown" } },
        context(),
      ),
    ).toThrow("objective in this sprint");
    expect(() =>
      execute(
        base(),
        { ...create(), objectiveAssignments: { "not-selected": "invite" } },
        context(),
      ),
    ).toThrow("selected tasks");
    expect(() =>
      execute(
        base(),
        { ...create(), objectives: [objectives()[0], objectives()[0]] },
        context(),
      ),
    ).toThrow("different ID");
    expect(() =>
      execute(
        base(),
        {
          ...create(),
          objectives: objectives().map((objective) => ({
            ...objective,
            leadId: "another-workspace-user",
          })),
        },
        context(),
      ),
    ).toThrow("lead from this team");
    const restricted = base();
    restricted.tasks[0].projectId = "learning";
    expect(() =>
      execute(
        restricted,
        {
          ...create(),
          objectives: objectives().map((objective) => ({
            ...objective,
            leadId: "demo-amira",
          })),
        },
        context(),
      ),
    ).toThrow("lead needs access");
  });
  it("allocates selected work once across objectives and Other work, and snapshots objective context", () => {
    let state = start(setup());
    expect(state.sprints![0].taskIds).toEqual(["a", "b", "c"]);
    expect(sprintAssignments(state.sprints![0])).toEqual({
      a: "invite",
      b: "collaborate",
    });
    state = execute(
      state,
      {
        type: "propose",
        sprintId: state.sprints![0].id,
        startDate: "2026-10-26",
        days: 14,
        trigger: "weekly",
      },
      context(),
    ).state;
    const proposal = state.proposals[0];
    expect(proposal.alternatives[0].scheduledMinutes).toBe(180);
    expect(Object.keys(proposal.taskRevisions).sort()).toEqual(["a", "b", "c"]);
    expect(proposal.inputs?.sprintObjectives).toEqual(objectives());
    expect(proposal.inputs?.sprintObjectiveAssignments).toEqual({
      a: "invite",
      b: "collaborate",
    });
    state = execute(
      state,
      { type: "approve", id: proposal.id, revision: 1 },
      context(),
    ).state;
    const version = structuredClone(state.versions[0]);
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 2,
        patch: {
          objectives: objectives().map((objective) => ({
            ...objective,
            title: `Revised ${objective.title}`,
          })),
        },
      },
      context(),
    ).state;
    expect(state.versions[0]).toEqual(version);
    expect(state.sprints![0].initialObjectives).toEqual(objectives());
    expect(state.sprints![0].changes.at(-1)?.objectives?.[0].title).toContain(
      "Revised",
    );
  });
  it("records objective reassignment and invalidates pending calendar previews", () => {
    let state = start(setup());
    state = execute(
      state,
      {
        type: "propose",
        sprintId: state.sprints![0].id,
        startDate: "2026-10-26",
        days: 14,
        trigger: "weekly",
      },
      context(),
    ).state;
    state = execute(
      state,
      {
        type: "update_sprint",
        id: state.sprints![0].id,
        revision: 2,
        patch: { objectiveAssignments: { a: "collaborate", b: "invite" } },
      },
      context(),
    ).state;
    expect(state.proposals[0].status).toBe("stale");
    expect(state.sprints![0].initialObjectiveAssignments).toEqual({
      a: "invite",
      b: "collaborate",
    });
    expect(state.sprints![0].changes.at(-1)?.objectiveAssignments).toEqual({
      a: "collaborate",
      b: "invite",
    });
  });
  it("requires a separate outcome for every objective and preserves closure without averaging", () => {
    const state = start(setup()),
      sprint = state.sprints![0];
    const decisions = sprint.taskIds.map((taskId) => ({
      taskId,
      action: "outside" as const,
    }));
    expect(() =>
      execute(
        state,
        {
          type: "close_sprint",
          id: sprint.id,
          revision: 2,
          outcome: "achieved",
          note: "",
          decisions,
        },
        context(),
      ),
    ).toThrow("every sprint objective");
    const closed = execute(
      state,
      {
        type: "close_sprint",
        id: sprint.id,
        revision: 2,
        note: "One outcome still needs work",
        objectiveOutcomes: [
          {
            objectiveId: "invite",
            outcome: "achieved",
            note: "Invitation accepted",
          },
          { objectiveId: "collaborate", outcome: "missed" },
        ],
        decisions,
      },
      context(),
    ).state;
    expect(closed.sprints![0].closeout?.outcome).toBeUndefined();
    expect(
      closed.sprints![0].closeout?.objectives?.map((result) => result.outcome),
    ).toEqual(["achieved", "missed"]);
    expect(closed.sprints![0].closeout?.objectiveAssignments).toEqual({
      a: "invite",
      b: "collaborate",
    });
    const history = structuredClone(closed.sprints![0]);
    expect(
      execute(
        closed,
        { type: "update_task", id: "a", patch: { title: "Later change" } },
        context(),
      ).state.sprints![0],
    ).toEqual(history);
  });
  it("projects legacy sprints without changing their existing records", () => {
    const state = execute(
      base(),
      {
        type: "create_sprint",
        title: "Old sprint",
        objective: "Original outcome",
        successCriteria: "Original criterion",
        startDate: "2026-10-26",
        endDate: "2026-11-08",
        timezone: "America/Chicago",
        taskIds: ["a"],
      },
      context(),
    ).state;
    const before = structuredClone(state.sprints![0]);
    expect(sprintObjectives(before)[0]).toMatchObject({
      title: "Original outcome",
      successCriteria: "Original criterion",
    });
    expect(Object.keys(sprintAssignments(before))).toEqual(["a"]);
    visibleState(state, DEMO_USER);
    expect(state.sprints![0]).toEqual(before);
  });
});
