import { it, expect } from "vitest";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { execute, evaluateRisks } from "../shared/domain";
import { buildStageReport } from "../shared/lifecycle";
import { isArchivedTask } from "../shared/workflow";
import type { Command, State } from "../shared/model";
const now = Date.parse("2026-10-26T13:00:00Z");
let seq = 0;
const run = (state: State, command: Command, at = now, actorId = DEMO_USER) =>
  execute(state, command, { actorId, now: at, id: () => `review-${++seq}` })
    .state;
it("separates the worker from the reviewer, requires a return reason, and records the full review loop", () => {
  let state = fixtureState(now);
  state.lifecycleEvents = [];
  state.notifications = [];
  state.reportEvents = [];
  const task = state.tasks.find((t) => t.id === "t7")!;
  task.ownerId = DEMO_USER;
  task.status = "in_progress";
  state = run(
    state,
    { type: "update_task", id: task.id, patch: { status: "to_validate" } },
    now,
    "demo-daniel",
  );
  expect(
    state.notifications.some(
      (n) =>
        n.recipientId === DEMO_USER && n.title === "Task ready for validation",
    ),
  ).toBe(true);
  const reminded = evaluateRisks(state, {
    actorId: DEMO_USER,
    now: now + 3 * 86400000,
    id: () => `reminder-${++seq}`,
  });
  expect(
    reminded.notifications
      .filter(
        (n) => n.taskId === task.id && n.title === "Validation is waiting",
      )
      .map((n) => n.recipientId),
  ).toEqual([DEMO_USER]);
  expect(() =>
    run(
      state,
      { type: "review_task", id: task.id, decision: "approve" },
      now + 1,
      "demo-daniel",
    ),
  ).toThrow("task owner");
  expect(() =>
    run(
      state,
      { type: "update_task", id: task.id, patch: { status: "done" } },
      now + 1,
      "demo-daniel",
    ),
  ).toThrow("owner must approve");
  expect(() =>
    run(
      state,
      { type: "update_task", id: task.id, patch: { ownerId: "demo-daniel" } },
      now + 1,
      "demo-daniel",
    ),
  ).toThrow("review ownership");
  expect(() =>
    run(
      state,
      { type: "review_task", id: task.id, decision: "return" },
      now + 1,
    ),
  ).toThrow("reason");
  state = run(
    state,
    {
      type: "review_task",
      id: task.id,
      decision: "return",
      reason: "Please fix the contrast",
    },
    now + 3600000,
  );
  expect(state.tasks.find((t) => t.id === task.id)?.status).toBe("in_progress");
  expect(
    state.notifications.some(
      (n) =>
        n.recipientId === "demo-daniel" && n.body.includes("fix the contrast"),
    ),
  ).toBe(true);
  expect(
    state.lifecycleEvents?.find((e) => e.action === "review_task")?.note,
  ).toBe("Please fix the contrast");
  state = run(
    state,
    { type: "update_task", id: task.id, patch: { status: "to_validate" } },
    now + 2 * 3600000,
    "demo-daniel",
  );
  state = run(
    state,
    { type: "review_task", id: task.id, decision: "approve" },
    now + 3 * 3600000,
  );
  expect(state.tasks.find((t) => t.id === task.id)?.status).toBe("done");
  state = evaluateRisks(state, {
    actorId: DEMO_USER,
    now: now + 4 * 3600000,
    id: () => `notification-${++seq}`,
  });
  expect(
    state.notifications.some(
      (n) =>
        n.recipientId === "demo-daniel" &&
        n.title === "Your task was validated",
    ),
  ).toBe(true);
  expect(
    state.notifications.some(
      (n) => n.taskId === task.id && n.title === "Task ready for validation",
    ),
  ).toBe(false);
  expect(
    state.reportEvents?.filter((event) => event.type === "completed"),
  ).toHaveLength(1);
  expect(
    state.lifecycleEvents
      ?.filter((e) => e.entityId === task.id && e.toStatus)
      .map((e) => e.at),
  ).toEqual([now, now + 3600000, now + 2 * 3600000, now + 3 * 3600000]);
});
it("computes stage mean/median from timestamped transitions, ignores unknown prior entry, and flags aging ideas", () => {
  let state = fixtureState(now);
  state.lifecycleEvents = [];
  state = run(
    state,
    {
      type: "create_task",
      title: "Flow sample",
      description: "",
      priority: "medium",
      dependencies: [],
      labels: [],
      status: "backlog",
    },
    now - 10 * 86400000,
  );
  const id = state.tasks.at(-1)!.id;
  for (const [status, days] of [
    ["todo", 7],
    ["in_progress", 5],
    ["to_validate", 2],
    ["done", 1],
  ] as const)
    state = run(
      state,
      { type: "update_task", id, patch: { status } },
      now - days * 86400000,
    );
  const report = buildStageReport(state, state.lifecycleEvents!, {
    from: "2026-10-01",
    to: "2026-10-26",
    zone: "America/Chicago",
    actorId: DEMO_USER,
    person: "all",
    project: "all",
    now,
  });
  expect(report.stages.map((s) => s.meanDays)).toEqual([3, 2, 3, 1, null]);
  expect(report.stages.map((s) => s.medianDays)).toEqual([3, 2, 3, 1, null]);
  state = run(
    state,
    {
      type: "create_task",
      title: "Old idea",
      description: "",
      priority: "low",
      dependencies: [],
      labels: [],
      status: "backlog",
    },
    now - 100 * 86400000,
  );
  const idea = state.tasks.at(-1)!;
  let aged = buildStageReport(state, state.lifecycleEvents!, {
    from: "2026-10-01",
    to: "2026-10-26",
    zone: "America/Chicago",
    actorId: DEMO_USER,
    person: "all",
    project: "all",
    now,
  });
  expect(
    aged.aged.some(
      (entry) => entry.task.id === idea.id && entry.threshold === 90,
    ),
  ).toBe(true);
  state = run(state, {
    type: "update_task",
    id: idea.id,
    patch: { brainstorm: true, reviewDate: "2026-12-01" },
  });
  aged = buildStageReport(state, state.lifecycleEvents!, {
    from: "2026-10-01",
    to: "2026-10-26",
    zone: "America/Chicago",
    actorId: DEMO_USER,
    person: "all",
    project: "all",
    now,
  });
  expect(aged.aged.some((entry) => entry.task.id === idea.id)).toBe(false);
  expect(aged.brainstorm.map((task) => task.id)).toContain(idea.id);
  expect(state.tasks.find((task) => task.id === idea.id)).toMatchObject({
    status: "backlog",
    brainstorm: true,
    reviewDate: "2026-12-01",
    ownerId: DEMO_USER,
  });
  const later = evaluateRisks(state, {
    actorId: DEMO_USER,
    now: Date.parse("2026-12-02T15:00:00Z"),
    id: () => `risk-${++seq}`,
  });
  expect(
    later.notifications.filter((n) => n.taskId === idea.id).map((n) => n.title),
  ).toContain("Brainstorm review is due");
  state = run(state, {
    type: "update_task",
    id: idea.id,
    patch: { status: "archived" },
  });
  expect(isArchivedTask(state.tasks.at(-1)!)).toBe(true);
});
it("keeps stage entry evidence through reassignment and uses the resource team's review threshold", () => {
  let state = fixtureState(now);
  state.lifecycleEvents = [];
  state = run(
    state,
    {
      type: "create_task",
      title: "Transferred work",
      description: "",
      priority: "medium",
      dependencies: [],
      labels: [],
      status: "backlog",
    },
    now - 10 * 86400000,
  );
  const id = state.tasks.at(-1)!.id;
  state = run(
    state,
    { type: "update_task", id, patch: { assigneeId: "demo-daniel" } },
    now - 6 * 86400000,
  );
  state = run(
    state,
    { type: "update_task", id, patch: { status: "todo" } },
    now - 4 * 86400000,
  );
  state.resourceTeams = { [id]: "review-team" };
  state.teamMemberships = {
    "review-team": state.members.map((member) => ({
      ...member,
      preferences: {
        ...member.preferences,
        agingDays: { backlog: 90, todo: 3, in_progress: 7, to_validate: 2 },
      },
    })),
  };
  const report = buildStageReport(state, state.lifecycleEvents!, {
    from: "2026-10-01",
    to: "2026-10-26",
    zone: "America/Chicago",
    actorId: DEMO_USER,
    person: "demo-daniel",
    project: "all",
    now,
  });
  expect(report.stages[0].meanDays).toBe(6);
  expect(report.stages[0].exits).toBe(1);
  expect(report.aged.find((entry) => entry.task.id === id)?.threshold).toBe(3);
});

it("clears optional dates accurately and does not invent none-to-none deadline changes", () => {
  let state = fixtureState(now);
  state = run(state, {
    type: "create_task",
    title: "An undated task",
    description: "",
    priority: "medium",
    dependencies: [],
    labels: [],
  });
  const id = state.tasks.at(-1)!.id;
  state = run(
    state,
    {
      type: "update_task",
      id,
      patch: { deadline: "", startDate: "", reviewDate: "" },
    },
    now + 1000,
  );
  expect(
    state.activities.filter(
      (event) =>
        event.taskId === id && event.message.includes("deadline changed"),
    ),
  ).toHaveLength(0);
  state = run(
    state,
    { type: "update_task", id, patch: { deadline: "2026-10-30" } },
    now + 2000,
  );
  state = run(
    state,
    { type: "update_task", id, patch: { deadline: "" } },
    now + 3000,
  );
  expect(state.tasks.find((task) => task.id === id)?.deadline).toBeUndefined();
  expect(
    state.lifecycleEvents?.find(
      (event) => event.entityId === id && event.at === now + 3000,
    )?.changes,
  ).toContain("deadline");
  state = run(
    state,
    { type: "update_task", id, patch: { deadline: "" } },
    now + 4000,
  );
  expect(
    state.activities.filter(
      (event) =>
        event.taskId === id && event.message.includes("deadline changed"),
    ),
  ).toHaveLength(2);
});
