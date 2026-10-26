import { describe, expect, it } from "vitest";
import { buildCalendarInsights } from "../shared/calendarInsights";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { visibleState } from "../shared/domain";
import type { CalendarSession, State } from "../shared/model";
import type { ReportFilter } from "../shared/reports";

const now = Date.parse("2026-10-26T20:00:00Z");
const filter: ReportFilter = {
  from: "2026-10-26",
  to: "2026-10-26",
  zone: "America/Chicago",
  actorId: DEMO_USER,
  person: DEMO_USER,
  project: "all",
  now,
};
function state(): State {
  const s = fixtureState(now);
  const [a, b, c, d] = s.tasks;
  s.tasks = [
    {
      ...a,
      id: "a",
      status: "todo",
      labels: ["Design", "Research"],
      parentId: undefined,
    },
    {
      ...b,
      id: "b",
      projectId: "brand",
      status: "in_progress",
      labels: ["Marketing"],
      parentId: undefined,
    },
    {
      ...c,
      id: "c",
      projectId: "website",
      status: "todo",
      assigneeId: "demo-amira",
      parentId: undefined,
    },
    {
      ...d,
      id: "private",
      projectId: "learning",
      status: "backlog",
      labels: ["Secret"],
    },
  ];
  s.proposals = [];
  s.versions = [];
  s.calendarSessions = [];
  return s;
}
function reservation(
  id: string,
  taskId: string,
  start = "2026-10-26T14:00:00Z",
  end = "2026-10-26T15:00:00Z",
  patch: Partial<CalendarSession> = {},
): CalendarSession {
  const from = Date.parse(start),
    to = Date.parse(end);
  return {
    id,
    taskId,
    assigneeId: DEMO_USER,
    start: from,
    end: to,
    status: "scheduled",
    revision: 1,
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
    createdBy: DEMO_USER,
    timezone: "America/Chicago",
    originalStart: from,
    originalEnd: to,
    history: [
      {
        at: now - 86400000,
        actorId: DEMO_USER,
        action: "scheduled",
        toStart: from,
        toEnd: to,
      },
    ],
    ...patch,
  };
}

describe("honest calendar planning insights", () => {
  it("counts confirmed reservations only, with multi-tag shares and current ready-task coverage", () => {
    const s = state();
    s.calendarSessions = [
      reservation("one", "a"),
      reservation("two", "b", "2026-10-26T15:00:00Z", "2026-10-26T15:20:00Z"),
      reservation(
        "canceled",
        "a",
        "2026-10-26T17:00:00Z",
        "2026-10-26T18:00:00Z",
        { status: "released" },
      ),
    ];
    s.busy.push({
      ownerId: DEMO_USER,
      start: Date.parse("2026-10-26T18:00:00Z"),
      end: Date.parse("2026-10-26T19:00:00Z"),
    });
    const report = buildCalendarInsights(s, filter);
    expect(report).toMatchObject({
      reservedMinutes: 80,
      overlapMinutes: 0,
      reservations: 2,
      shortReservations: 1,
      longestReservationMinutes: 60,
      coverage: { eligible: 2, scheduled: 2, unscheduled: 0, percent: 100 },
      recordedReschedules: 0,
    });
    expect(report.byProject.map((row) => [row.id, row.minutes])).toEqual([
      ["website", 60],
      ["brand", 20],
    ]);
    expect(
      Object.fromEntries(report.byTag.map((row) => [row.name, row.minutes])),
    ).toEqual({ Design: 30, Research: 30, Marketing: 20 });
    expect(report.daily).toEqual([
      { date: "2026-10-26", minutes: 80, reservations: 2 },
    ]);
  });

  it("does not inflate allocation when legacy reservations overlap, but sums different people's time", () => {
    const s = state();
    s.calendarSessions = [
      reservation("one", "a"),
      reservation("two", "b", "2026-10-26T14:30:00Z", "2026-10-26T15:30:00Z"),
      reservation("teammate", "c", undefined, undefined, {
        assigneeId: "demo-amira",
      }),
    ];
    const mine = buildCalendarInsights(s, filter);
    expect(mine.reservedMinutes).toBe(90);
    expect(mine.overlapMinutes).toBe(30);
    expect(mine.byProject.map((row) => row.minutes)).toEqual([45, 45]);
    expect(mine.byTag.reduce((total, row) => total + row.minutes, 0)).toBe(90);
    const all = buildCalendarInsights(s, { ...filter, person: "all" });
    expect(all.reservedMinutes).toBe(150);
    expect(all.overlapMinutes).toBe(30);
    expect(all.byProject.reduce((total, row) => total + row.minutes, 0)).toBe(
      150,
    );
  });

  it("normalizes duplicate tags and keeps real Untagged tags distinct from untagged work", () => {
    const s = state();
    s.tasks[0].labels = [" Design ", "design", "Untagged"];
    s.tasks[1].labels = [];
    s.calendarSessions = [
      reservation("one", "a"),
      reservation("two", "b", "2026-10-26T15:00:00Z", "2026-10-26T16:00:00Z"),
    ];
    const report = buildCalendarInsights(s, filter);
    expect(report.byTag).toContainEqual(
      expect.objectContaining({ id: "untagged", minutes: 60 }),
    );
    expect(report.byTag).toContainEqual(
      expect.objectContaining({ id: "tag:untagged", minutes: 30 }),
    );
    expect(report.byTag).toContainEqual(
      expect.objectContaining({ id: "tag:design", minutes: 30 }),
    );
    expect(report.byTag).toHaveLength(3);
  });

  it("scopes person, project and dates, and never includes hidden task/session records", () => {
    const s = state();
    s.calendarSessions = [
      reservation("one", "a"),
      reservation("other", "c", undefined, undefined, {
        assigneeId: "demo-amira",
      }),
      reservation("private", "private"),
    ];
    expect(
      buildCalendarInsights(s, { ...filter, project: "brand" }).reservedMinutes,
    ).toBe(0);
    expect(
      buildCalendarInsights(s, { ...filter, person: "demo-amira" })
        .reservedMinutes,
    ).toBe(60);
    expect(
      buildCalendarInsights(s, {
        ...filter,
        from: "2026-10-27",
        to: "2026-10-27",
      }).reservedMinutes,
    ).toBe(0);
    const visible = visibleState(s, "demo-amira");
    const report = buildCalendarInsights(visible, {
      ...filter,
      actorId: "demo-amira",
      person: "all",
    });
    expect(report.byProject.some((row) => row.id === "learning")).toBe(false);
    expect(report.byTag.some((row) => row.name === "Secret")).toBe(false);
    expect(report.reservedMinutes).toBe(120);
    const orphaned = { ...visible, calendarSessions: s.calendarSessions };
    expect(
      buildCalendarInsights(orphaned, {
        ...filter,
        actorId: "demo-amira",
        person: "all",
      }).reservedMinutes,
    ).toBe(120);
  });

  it("counts reservations crossing local midnight once and measures DST by elapsed instants", () => {
    const s = state();
    s.calendarSessions = [
      reservation(
        "overnight",
        "a",
        "2026-11-01T04:30:00Z",
        "2026-11-01T07:30:00Z",
      ),
    ];
    const f = {
      ...filter,
      from: "2026-10-31",
      to: "2026-11-01",
      now: Date.parse("2026-11-02T12:00:00Z"),
    };
    const report = buildCalendarInsights(s, f);
    expect(report.reservations).toBe(1);
    expect(report.reservedMinutes).toBe(180);
    expect(report.daily.map((row) => row.minutes)).toEqual([30, 150]);
    const clipped = buildCalendarInsights(s, { ...f, from: "2026-11-01" });
    expect(clipped.reservedMinutes).toBe(150);
    expect(clipped.longestReservationMinutes).toBe(150);
  });

  it("counts explicit, timestamped moves and cancellations, independent of a session's new date", () => {
    const s = state();
    s.calendarSessions = [
      reservation(
        "moved",
        "a",
        "2026-10-29T14:00:00Z",
        "2026-10-29T15:00:00Z",
        {
          revision: 17,
          history: [
            { at: now - 1000, actorId: DEMO_USER, action: "rescheduled" },
            { at: now - 999, actorId: DEMO_USER, action: "rescheduled" },
            { at: now + 1000, actorId: DEMO_USER, action: "rescheduled" },
            {
              at: Date.parse("2026-10-25T23:00:00Z"),
              actorId: DEMO_USER,
              action: "rescheduled",
            },
          ],
        },
      ),
      reservation("released", "b", undefined, undefined, {
        status: "released",
        revision: 10,
        history: [{ at: now, actorId: DEMO_USER, action: "released" }],
      }),
    ];
    const report = buildCalendarInsights(s, filter);
    expect(report.recordedReschedules).toBe(2);
    expect(report.recordedCancellations).toBe(1);
    expect(report.reservedMinutes).toBe(0);
  });

  it("keeps backlog, validation, parent tasks and tasks created after the period out of ready coverage", () => {
    const s = state();
    s.tasks[1].status = "to_validate";
    s.tasks.push(
      { ...s.tasks[0], id: "parent", status: "in_progress" },
      { ...s.tasks[0], id: "child", parentId: "parent", status: "backlog" },
      { ...s.tasks[0], id: "future", createdAt: now + 86400000 },
    );
    const report = buildCalendarInsights(s, filter);
    expect(report.coverage).toEqual({
      eligible: 1,
      scheduled: 0,
      unscheduled: 1,
      percent: 0,
    });
    expect(report.unscheduledTaskIds).toEqual(["a"]);
    expect(
      buildCalendarInsights(s, { ...filter, person: "nobody" }).coverage
        .percent,
    ).toBeNull();
  });

  it("rejects invalid date ranges before processing data", () => {
    expect(() =>
      buildCalendarInsights(state(), { ...filter, from: "2026-10-27" }),
    ).toThrow();
    expect(() =>
      buildCalendarInsights(state(), { ...filter, from: "2024-01-01" }),
    ).toThrow();
  });
});
