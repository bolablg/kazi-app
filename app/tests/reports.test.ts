import { describe, expect, it } from "vitest";
import { fixtureState as seedState, DEMO_USER } from "../shared/fixtures";
import { execute, visibleState } from "../shared/domain";
import {
  buildReport,
  reportBounds,
  type ReportFilter,
} from "../shared/reports";
import { deadlineAt } from "../shared/scheduler";
import type { Command, State } from "../shared/model";
const now = Date.parse("2026-10-26T13:00:00Z");
const filter: ReportFilter = {
  from: "2026-10-01",
  to: "2026-10-26",
  zone: "America/Chicago",
  actorId: DEMO_USER,
  person: DEMO_USER,
  project: "all",
  now,
};
let seq = 0;
const run = (s: State, command: Command, at = now, actorId = DEMO_USER) =>
  execute(s, command, { actorId, now: at, id: () => `report-test-${++seq}` })
    .state;
describe("dated reporting facts", () => {
  it("records only real finishes, preserving the original deadline and assignee", () => {
    let s = seedState(now);
    s.reportEvents = [];
    s.tasks[0].deadline = "2026-10-25";
    s = run(s, {
      type: "update_task",
      id: "t1",
      patch: {
        status: "done",
        deadline: "2026-10-30",
        assigneeId: "demo-amira",
      },
    });
    s = run(
      s,
      {
        type: "update_task",
        id: "t1",
        patch: { status: "done", title: "Edited later" },
      },
      now + 1000,
    );
    expect(s.reportEvents).toHaveLength(1);
    expect(s.reportEvents![0]).toMatchObject({
      type: "completed",
      assigneeId: DEMO_USER,
      deadline: "2026-10-25",
      dueAt: deadlineAt("2026-10-25", "America/Chicago"),
      at: now,
    });
    expect(buildReport(s, s.reportEvents!, filter).late).toHaveLength(1);
  });
  it("counts a task once after reopening and completing again in a period", () => {
    let s = seedState(now);
    s.reportEvents = [];
    s = run(
      s,
      { type: "update_task", id: "t1", patch: { status: "done" } },
      now - 3000,
    );
    s = run(
      s,
      { type: "update_task", id: "t1", patch: { status: "todo" } },
      now - 2000,
    );
    s = run(
      s,
      { type: "update_task", id: "t1", patch: { status: "done" } },
      now - 1000,
    );
    const r = buildReport(s, s.reportEvents!, filter);
    expect(s.reportEvents).toHaveLength(2);
    expect(r.completed).toHaveLength(1);
    expect(r.days.reduce((n, d) => n + d.completed, 0)).toBe(1);
    expect(r.completed[0].at).toBe(now - 1000);
  });
  it("attributes actual minutes to the logger and never treats a reservation as actual work", () => {
    let s = seedState(now);
    s.reportEvents = [];
    s = run(
      s,
      {
        type: "progress",
        id: "t1",
        remainingMinutes: 50,
        loggedMinutes: 35,
        note: "Worked",
      },
      now - 1000,
    );
    s = run(s, {
      type: "progress",
      id: "t1",
      remainingMinutes: 50,
      loggedMinutes: 0,
      note: "Estimate only",
    });
    expect(s.reportEvents).toHaveLength(1);
    const r = buildReport(s, s.reportEvents!, filter);
    expect(r.loggedMinutes).toBe(35);
    expect(r.scheduledMinutes).toBe(60);
    expect(r.projects.find((p) => p.project.id === "website")?.minutes).toBe(
      35,
    );
    expect(
      buildReport(s, s.reportEvents!, { ...filter, person: "demo-amira" })
        .loggedMinutes,
    ).toBe(0);
  });
  it("excludes undated legacy totals, future records, and duplicate event ids", () => {
    const s = seedState(now);
    s.tasks[0].loggedMinutes = 400;
    const e = { ...s.reportEvents![0], id: "one", at: now, minutes: 20 };
    const r = buildReport(
      s,
      [e, e, { ...e, id: "future", at: now + 1 }],
      filter,
    );
    expect(r.loggedMinutes).toBe(20);
    expect(r.completed).toHaveLength(0);
  });
  it("uses the assignee timezone for a date-only deadline and saves it against later edits", () => {
    let s = seedState(now);
    s.reportEvents = [];
    s.members[0].preferences.timezone = "Pacific/Honolulu";
    s.tasks[0].deadline = "2026-10-25";
    s = run(
      s,
      { type: "update_task", id: "t1", patch: { status: "done" } },
      Date.parse("2026-10-26T09:00:00Z"),
    );
    s.members[0].preferences.timezone = "Asia/Tokyo";
    expect(buildReport(s, s.reportEvents!, filter).onTimeRate).toBe(100);
    expect(s.reportEvents![0].dueAt).toBe(Date.parse("2026-10-26T10:00:00Z"));
  });
  it("filters private project history and current task access", () => {
    const s = seedState(now),
      scoped = visibleState(s, "demo-amira");
    expect(scoped.reportEvents?.some((e) => e.projectId === "learning")).toBe(
      false,
    );
    const report = buildReport(scoped, s.reportEvents!, {
      ...filter,
      actorId: "demo-amira",
      person: "all",
    });
    expect(report.logs.some((e) => e.projectId === "learning")).toBe(false);
    expect(report.loggedMinutes).toBe(200);
  });
  it("does not double count parent completions and keeps overdue separate from period totals", () => {
    let s = seedState(now);
    s.reportEvents = [];
    s.tasks[1].parentId = "t1";
    s = run(s, { type: "update_task", id: "t1", patch: { status: "done" } });
    const r = buildReport(s, s.reportEvents!, filter);
    expect(r.completed).toHaveLength(0);
    expect(r.overdue.map((t) => t.id)).toContain("t5");
  });
  it("uses half-open local days across daylight saving and rejects invalid spans", () => {
    expect(
      reportBounds("2026-11-01", "2026-11-01", "America/Chicago").to -
        reportBounds("2026-11-01", "2026-11-01", "America/Chicago").from,
    ).toBe(25 * 3600000);
    expect(() =>
      reportBounds("2026-10-27", "2026-10-26", filter.zone),
    ).toThrow();
    expect(() =>
      reportBounds("2025-01-01", "2026-10-26", filter.zone),
    ).toThrow();
  });
});

it("keeps assignee-local overdue instants when preferences are redacted", () => {
  const s = seedState(now);
  s.members[1].preferences.timezone = "Asia/Tokyo";
  s.tasks[1].assigneeId = "demo-amira";
  s.tasks[1].deadline = "2026-10-25";
  const view = visibleState(s, "demo-daniel");
  expect(
    view.members.find((m) => m.id === "demo-amira")!.preferences.timezone,
  ).toBe("America/Chicago");
  expect(view.taskDueAt!["t2"]).toBe(Date.parse("2026-10-25T15:00:00Z"));
  const r = buildReport(view, [], {
    ...filter,
    person: "all",
    now: Date.parse("2026-10-25T16:00:00Z"),
  });
  expect(r.overdue.map((t) => t.id)).toContain("t2");
  expect(view.taskDueAt).not.toHaveProperty("t4");
});

it("automatically records start, cycle, lead, and status age without manual time logs", () => {
  let s = seedState(now);
  s.reportEvents = [];
  const t = s.tasks[1];
  t.createdAt = now - 3 * 86400000;
  s = run(
    s,
    { type: "update_task", id: t.id, patch: { status: "in_progress" } },
    now - 2 * 3600000,
  );
  s = run(
    s,
    { type: "update_task", id: t.id, patch: { status: "to_validate" } },
    now - 3600000,
  );
  s = run(s, { type: "update_task", id: t.id, patch: { status: "done" } });
  const r = buildReport(s, s.reportEvents!, filter);
  expect(r.medianCycleMinutes).toBe(120);
  expect(r.medianLeadMinutes).toBe(3 * 1440);
  expect(r.completed[0].startedAt).toBe(now - 2 * 3600000);
  expect(r.loggedMinutes).toBe(0);
  expect(r.days.reduce((n, d) => n + d.scheduled, 0)).toBe(r.scheduledMinutes);
  s = run(
    s,
    { type: "update_task", id: t.id, patch: { status: "todo" } },
    now + 1000,
  );
  expect(s.tasks.find((x) => x.id === t.id)!.startedAt).toBeUndefined();
  expect(s.tasks.find((x) => x.id === t.id)!.statusChangedAt).toBe(now + 1000);
});
it("does not infer missing start dates and excludes canceled work from project goal percentages", () => {
  let s = seedState(now);
  s.reportEvents = [];
  s.tasks[1].status = "todo";
  delete s.tasks[1].startedAt;
  s = run(s, { type: "update_task", id: "t2", patch: { status: "done" } });
  const report = buildReport(s, s.reportEvents!, filter);
  expect(report.cycleTimes).toHaveLength(0);
  expect(report.medianCycleMinutes).toBeNull();
  s.tasks[0].status = "canceled";
  const goal = buildReport(s, s.reportEvents!, filter).goals.find(
    (g) => g.project.id === "website",
  )!;
  expect(goal.total).toBe(4);
  expect(goal.done).toBe(3);
  expect(goal.percent).toBe(75);
});
