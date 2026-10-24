import { describe, expect, it } from "vitest";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { execute, evaluateRisks } from "../shared/domain";
import { allocate, dateInZone } from "../shared/scheduler";
import { buildIcal, foldIcalLine } from "../shared/ical";
import { isArchivedTask } from "../shared/workflow";
import type { Command, Context } from "../shared/model";

const now = Date.parse("2026-10-26T13:00:00Z");
let sequence = 0;
const context = (): Context => ({
  actorId: DEMO_USER,
  now,
  id: () => `workflow-${++sequence}`,
  verifiedCalendar: true,
});
function sample() {
  const state = fixtureState(now);
  state.tasks = [
    {
      ...state.tasks[0],
      dependencies: [],
      estimatedMinutes: 60,
      remainingMinutes: 60,
      startDate: "2026-10-27",
      deadline: "2026-10-30",
    },
  ];
  state.proposals = [];
  state.versions = [];
  state.attempts = [];
  state.busy = [];
  state.notifications = [];
  state.reportEvents = [];
  return execute(state, { type: "use_kazi_agenda" }, context()).state;
}
describe("shared workflow and native agenda", () => {
  it("allocates only committed execution stages and respects planned starts", () => {
    const state = sample(),
      task = state.tasks[0];
    const tasks = (
      [
        "idea",
        "backlog",
        "todo",
        "in_progress",
        "to_validate",
        "blocked",
        "done",
        "rejected",
        "canceled",
      ] as const
    ).map((status) => ({ ...task, id: status, status }));
    const result = allocate({
      tasks,
      busy: [],
      preferences: { [DEMO_USER]: state.members[0].preferences },
      startDate: "2026-10-26",
      days: 5,
      now,
    });
    expect([...new Set(result.sessions.map((s) => s.taskId))].sort()).toEqual([
      "in_progress",
      "todo",
    ]);
    expect(result.unscheduled.some((u) => u.taskId === "blocked")).toBe(false);
    expect(
      result.sessions.every(
        (s) => dateInZone(s.start, "America/Chicago") >= "2026-10-27",
      ),
    ).toBe(true);
    state.tasks[0].status = "backlog";
    expect(() =>
      execute(
        state,
        {
          type: "propose",
          startDate: "2026-10-26",
          days: 5,
          trigger: "weekly",
        },
        context(),
      ),
    ).toThrow("To do");
    expect(
      evaluateRisks(state, { ...context(), now: now + 20 * 86400000 })
        .notifications,
    ).toHaveLength(0);
  });
  it("rejects invalid task/project date ranges before persisting", () => {
    const state = sample();
    expect(() =>
      execute(
        state,
        {
          type: "update_task",
          id: state.tasks[0].id,
          patch: { startDate: "2026-11-10" },
        },
        context(),
      ),
    ).toThrow("planned start");
    expect(() =>
      execute(
        state,
        {
          type: "create_project",
          title: "Dates",
          description: "",
          private: false,
          color: "blue",
          startDate: "2026-11-10",
          deadline: "2026-10-30",
        },
        context(),
      ),
    ).toThrow("Project start");
    expect(() =>
      execute(
        state,
        {
          type: "update_project",
          id: state.tasks[0].projectId,
          patch: { startDate: "2026-11-10", deadline: "2026-10-30" },
        },
        context(),
      ),
    ).toThrow("Project start");
  });
  it("accepts native sessions without Google writes and releases future review work without rewriting snapshots", () => {
    let state = sample();
    const proposal = execute(
      state,
      { type: "propose", startDate: "2026-10-26", days: 5, trigger: "weekly" },
      context(),
    );
    state = proposal.state;
    state = execute(
      state,
      { type: "approve", id: proposal.result, revision: 1 },
      context(),
    ).state;
    const accepted = structuredClone(state.versions[0]),
      receipt = state.proposals[0];
    expect(receipt.status).toBe("applied");
    expect(
      receipt.alternatives[0].sessions.every((s) => s.status === "scheduled"),
    ).toBe(true);
    const ics = buildIcal(state, DEMO_USER, { includeDeadlines: true });
    expect(ics).toContain("TRANSP:OPAQUE");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261030");
    expect(ics).toContain("DTEND;VALUE=DATE:20261031");
    state = execute(
      state,
      {
        type: "update_task",
        id: state.tasks[0].id,
        patch: { status: "to_validate" },
      },
      context(),
    ).state;
    expect(
      state.proposals[0].alternatives[0].sessions.every(
        (s) => s.status === "released",
      ),
    ).toBe(true);
    expect(state.versions[0]).toEqual(accepted);
    expect(
      state.reportEvents?.filter((e) => e.type === "completed"),
    ).toHaveLength(0);
    expect(buildIcal(state, DEMO_USER)).toContain("STATUS:CANCELLED");
    state = execute(
      state,
      { type: "update_task", id: state.tasks[0].id, patch: { status: "done" } },
      context(),
    ).state;
    expect(
      state.reportEvents?.filter((e) => e.type === "completed"),
    ).toHaveLength(1);
    state = execute(
      state,
      {
        type: "update_project",
        id: state.tasks[0].projectId,
        patch: { status: "done" },
      },
      context(),
    ).state;
    expect(
      state.projects.find((p) => p.id === state.tasks[0].projectId)?.status,
    ).toBe("done");
  });
  it("archives rejection and restores to backlog with no completion fact", () => {
    let state = sample();
    const task = state.tasks[0];
    state = execute(
      state,
      { type: "update_task", id: task.id, patch: { status: "rejected" } },
      context(),
    ).state;
    expect(isArchivedTask(state.tasks[0])).toBe(true);
    expect(state.reportEvents).toEqual([]);
    state = execute(
      state,
      { type: "update_task", id: task.id, patch: { status: "backlog" } },
      context(),
    ).state;
    expect(isArchivedTask(state.tasks[0])).toBe(false);
    expect(state.tasks[0].startedAt).toBeUndefined();
  });
  it("rechecks Kazi reservations when a competing plan was approved", () => {
    let state = sample();
    const p = execute(
      state,
      { type: "propose", startDate: "2026-10-26", days: 5, trigger: "weekly" },
      context(),
    );
    state = p.state;
    const other = structuredClone(state.proposals[0]);
    other.id = "other";
    other.status = "applied";
    other.alternatives[0].sessions.forEach((s) => (s.status = "scheduled"));
    state.proposals.push(other);
    expect(() =>
      execute(state, { type: "approve", id: p.result, revision: 1 }, context()),
    ).toThrow("conflicts");
  });
  it("escapes hostile calendar text, folds UTF-8 by octets, and exports only the owner's sessions", () => {
    const state = sample();
    state.tasks[0].title = "A, B; C\\ D\nBEGIN:VEVENT\nSUMMARY:injected";
    const body = buildIcal(state, DEMO_USER, { includeDeadlines: true });
    expect(body.match(/BEGIN:VEVENT\r\n/g) ?? []).toHaveLength(1);
    expect(body).toContain(
      "SUMMARY:Due: A\\, B\\; C\\\\ D\\nBEGIN:VEVENT\\nSUMMARY:injected",
    );
    expect(
      buildIcal(state, "someone-else", { includeDeadlines: true }),
    ).not.toContain("BEGIN:VEVENT");
    const folded = foldIcalLine("SUMMARY:" + "é😀".repeat(80));
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é😀".repeat(80));
  });
});
