import { describe, expect, it } from "vitest";
import { evaluateRisks, execute, nextRiskEvaluation } from "../shared/domain";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import type { Context, State, Task } from "../shared/model";
import { localInstant } from "../shared/scheduler";

const now = Date.parse("2026-10-26T13:00:00Z");
let sequence = 0;
const context = (at = now): Context => ({
  actorId: DEMO_USER,
  now: at,
  id: () => `promotion-${++sequence}`,
});
function draft(startDate = "2026-10-26", timezone = "America/Chicago") {
  const state = fixtureState(now);
  state.tasks = ["a", "b", "c", "d", "e", "outside"].map((id) => ({
    ...structuredClone(state.tasks[0]),
    id,
    title: id,
    projectId: "website",
    status: "backlog" as const,
    ownerId: DEMO_USER,
    assigneeId: DEMO_USER,
    dependencies: [],
    parentId: undefined,
    deadline: undefined,
  }));
  state.proposals = [];
  state.versions = [];
  return execute(
    state,
    {
      type: "create_sprint",
      objective: "Ship useful work",
      successCriteria: "It works",
      startDate,
      endDate: "2026-11-08",
      timezone,
      taskIds: ["a"],
    },
    context(),
  ).state;
}
const start = (state: State, at = now) =>
  execute(
    state,
    {
      type: "start_sprint",
      id: state.sprints![0].id,
      revision: state.sprints![0].revision,
    },
    context(at),
  ).state;
const select = (state: State, taskIds: string[]) =>
  execute(
    state,
    {
      type: "update_sprint",
      id: state.sprints![0].id,
      revision: state.sprints![0].revision,
      patch: { taskIds },
    },
    context(),
  ).state;

describe("sprint Backlog activation", () => {
  it("preserves draft selection, then promotes only selected Backlog tasks with one history event", () => {
    let state = draft();
    expect(evaluateRisks(state, context()).tasks[0].status).toBe("backlog");
    state = select(state, ["a", "b", "c", "d", "e"]);
    const otherStages: Task["status"][] = [
      "todo",
      "in_progress",
      "to_validate",
      "done",
    ];
    otherStages.forEach((status, i) => {
      state.tasks[i + 1].status = status;
    });
    const originalSnapshot = structuredClone(state.tasks);
    state = start(state);
    expect(state.tasks.map((task) => task.status)).toEqual([
      "todo",
      ...otherStages,
      "backlog",
    ]);
    expect(state.sprints![0].initialTasks![0].status).toBe("backlog");
    expect(state.sprints![0].backlogPromotedAt).toBe(now);
    expect(state.tasks[0]).toMatchObject({
      statusChangedAt: now,
      updatedAt: now,
      revision: originalSnapshot[0].revision + 1,
    });
    expect(state.tasks.slice(1)).toEqual(originalSnapshot.slice(1));
    const transitions = state.lifecycleEvents!.filter(
      (event) => event.entityId === "a" && event.toStatus === "todo",
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromStatus: "backlog",
      at: now,
      action: "start_sprint",
    });
    expect(
      state.activities.filter(
        (event) => event.taskId === "a" && event.toStatus === "todo",
      ),
    ).toHaveLength(1);
  });

  it("waits for local midnight across the DST boundary and records the actual automatic transition once", () => {
    const boundary = localInstant("2026-11-01", 0, "America/New_York");
    expect(boundary).toBe(Date.parse("2026-11-01T04:00:00Z"));
    let state = start(draft("2026-11-01", "America/New_York"));
    expect(state.tasks[0].status).toBe("backlog");
    expect(state.sprints![0].backlogPromotedAt).toBeUndefined();
    expect(nextRiskEvaluation(state, boundary - 60000)).toBe(boundary);
    state = evaluateRisks(state, context(boundary - 1));
    expect(state.tasks[0].status).toBe("backlog");
    state = evaluateRisks(state, context(boundary));
    expect(state.tasks[0].status).toBe("todo");
    const event = state.lifecycleEvents!.find(
      (event) => event.action === "sprint_activation",
    );
    expect(event).toMatchObject({
      entityId: "a",
      fromStatus: "backlog",
      toStatus: "todo",
      at: boundary,
    });
    expect(
      state.activities.find(
        (event) => event.taskId === "a" && event.toStatus === "todo",
      ),
    ).toMatchObject({ at: boundary, changes: ["status"] });
    const revision = state.tasks[0].revision;
    const count = state.lifecycleEvents!.length;
    state = evaluateRisks(state, context(boundary + 60000));
    expect(state.tasks[0].revision).toBe(revision);
    expect(state.lifecycleEvents).toHaveLength(count);
  });

  it("promotes newly selected active work while respecting a manual return to Backlog", () => {
    let state = start(draft());
    state = execute(
      state,
      { type: "update_task", id: "a", patch: { status: "backlog" } },
      context(),
    ).state;
    state = select(state, ["a", "b"]);
    expect(state.tasks[0].status).toBe("backlog");
    expect(state.tasks[1].status).toBe("todo");
    state = evaluateRisks(state, context(now + 60000));
    expect(state.tasks[0].status).toBe("backlog");
    state = select(state, ["b"]);
    state = select(state, ["a", "b"]);
    expect(state.tasks[0].status).toBe("todo");
  });

  it("does not promote canceled, closed, expired or archived work", () => {
    const future = draft("2026-11-01");
    const sprint = future.sprints![0];
    const canceled = execute(
      future,
      { type: "cancel_sprint", id: sprint.id, revision: 1 },
      context(),
    ).state;
    const atStart = localInstant(sprint.startDate, 0, sprint.timezone);
    expect(evaluateRisks(canceled, context(atStart)).tasks[0].status).toBe(
      "backlog",
    );
    let active = start(future);
    const closed = execute(
      active,
      {
        type: "close_sprint",
        id: sprint.id,
        revision: 2,
        outcome: "missed",
        note: "Stop",
        decisions: [{ taskId: "a", action: "outside" }],
      },
      context(),
    ).state;
    expect(evaluateRisks(closed, context(atStart)).tasks[0].status).toBe(
      "backlog",
    );
    expect(
      evaluateRisks(active, context(Date.parse("2026-11-10T00:00:00Z")))
        .tasks[0].status,
    ).toBe("backlog");
    active.tasks[0].status = "archived";
    expect(evaluateRisks(active, context(atStart)).tasks[0].status).toBe(
      "archived",
    );
  });

  it("rechecks membership and task editing authority before a scheduled promotion", () => {
    let state = start(draft("2026-11-01"));
    state.members = state.members.filter((member) => member.id !== DEMO_USER);
    state = evaluateRisks(
      state,
      context(localInstant("2026-11-01", 0, "America/Chicago")),
    );
    expect(state.tasks[0].status).toBe("backlog");
    expect(
      state.lifecycleEvents?.some(
        (event) => event.action === "sprint_activation",
      ) ?? false,
    ).toBe(false);
  });
});
