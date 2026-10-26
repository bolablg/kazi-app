import { describe, it, expect } from "vitest";
import {
  execute,
  visibleState,
  deliverCalendarReminder,
} from "../shared/domain";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import type { Context, State, Command } from "../shared/model";
import {
  calendarDayCapacity,
  calendarSessions,
  calendarReservations,
} from "../shared/calendarPlanning";
import { overviewEvents } from "../shared/overview";
import { buildIcal } from "../shared/ical";
const now = Date.parse("2026-10-26T13:00:00Z"),
  start = Date.parse("2026-10-26T14:00:00Z");
let index = 0;
const ctx = (at = now): Context => ({
  actorId: DEMO_USER,
  now: at,
  id: () => `calendar-${++index}`,
  verifiedCalendar: true,
});
function seed() {
  const state = fixtureState(now);
  state.tasks = ["first", "second"].map((id) => ({
    ...structuredClone(state.tasks[0]),
    id,
    projectId: "website",
    ownerId: DEMO_USER,
    assigneeId: DEMO_USER,
    status: "todo" as const,
    dependencies: [],
    parentId: undefined,
    deadline: undefined,
    startDate: undefined,
    estimatedMinutes: 60,
    remainingMinutes: 60,
    collaborators: [],
  }));
  state.members.find((m) => m.id === DEMO_USER)!.preferences.workingDays = [
    1, 2, 3, 4, 5,
  ];
  state.proposals = [];
  state.versions = [];
  state.busy = [];
  state.calendarSessions = [];
  state.calendars = [
    {
      ownerId: DEMO_USER,
      status: "native",
      destinationId: "kazi",
      selectedIds: [],
      lastSync: now,
    },
  ];
  return state;
}
const reserve = (
  state: State,
  extra: Partial<Extract<Command, { type: "schedule_calendar_session" }>> = {},
) =>
  execute(
    state,
    {
      type: "schedule_calendar_session",
      taskId: "first",
      start,
      end: start + 3600000,
      ...extra,
    },
    ctx(),
  );
describe("durable calendar planning", () => {
  it("rejects poisoned released-restore windows without corrupting the subscription", () => {
    const s = reserve(seed()).state,
      row = s.calendarSessions![0],
      before = structuredClone(s);
    expect(() =>
      execute(
        s,
        {
          type: "restore_calendar_sessions",
          sessions: [
            {
              sessionId: row.id,
              revision: 1,
              start: 0,
              end: Number.MAX_SAFE_INTEGER,
              status: "released",
            },
          ],
        },
        ctx(),
      ),
    ).toThrow("valid future");
    expect(s).toEqual(before);
    expect(() => buildIcal(s, DEMO_USER)).not.toThrow();
  });
  it("rejects adding reservation 1001 atomically while retained history stays readable", () => {
    const s = reserve(seed()).state,
      row = s.calendarSessions![0];
    s.calendarSessions = Array.from({ length: 1000 }, (_, i) => ({
      ...structuredClone(row),
      id: "retained-" + i,
      status: "released" as const,
    }));
    expect(() => reserve(s)).toThrow("calendar history limit");
    expect(s.calendarSessions).toHaveLength(1000);
    expect(() => buildIcal(s, DEMO_USER)).not.toThrow();
  });
  it("never interprets an elapsed prerequisite reservation as proof of completion", () => {
    let s = reserve(seed(), { taskId: "second" }).state;
    s.tasks[0].dependencies = ["second"];
    const at = start + 2 * 3600000;
    expect(() =>
      execute(
        s,
        {
          type: "schedule_calendar_session",
          taskId: "first",
          start: start + 4 * 3600000,
          end: start + 5 * 3600000,
        },
        ctx(at),
      ),
    ).toThrow("prerequisite");
  });
  it("retains monotonic feed metadata through archive/restore without silently rebooking native time", () => {
    let s = seed();
    s.tasks = s.tasks.slice(0, 1);
    s.tasks[0].deadline = "2026-11-05";
    const proposed = execute(
      s,
      { type: "propose", startDate: "2026-10-26", days: 7, trigger: "weekly" },
      ctx(),
    );
    s = execute(
      proposed.state,
      { type: "approve", id: proposed.result, revision: 1 },
      ctx(),
    ).state;
    const history = structuredClone(s.versions);
    const seq = (state: State) =>
      [
        ...buildIcal(state, DEMO_USER, { includeDeadlines: true }).matchAll(
          /SEQUENCE:(\d+)/g,
        ),
      ].map((m) => Number(m[1]));
    const first = seq(s);
    s = execute(
      s,
      { type: "update_project", id: "website", patch: { archived: true } },
      ctx(now + 60000),
    ).state;
    const archived = seq(s);
    expect(s.calendarSessions?.[0].status).toBe("released");
    s = execute(
      s,
      { type: "update_project", id: "website", patch: { archived: false } },
      ctx(now + 120000),
    ).state;
    const restored = seq(s);
    expect(
      restored.every((n, i) => n > archived[i] && archived[i] > first[i]),
    ).toBe(true);
    expect(s.calendarSessions?.[0].status).toBe("released");
    expect(s.versions).toEqual(history);
    expect(buildIcal(s, DEMO_USER)).toContain("LAST-MODIFIED:20261026T130200Z");
  });
  it("keeps an externally published accepted event read-only after native agenda activation", () => {
    let s = seed();
    s.tasks = s.tasks.slice(0, 1);
    const proposal = execute(
      s,
      { type: "propose", startDate: "2026-10-26", days: 7, trigger: "weekly" },
      ctx(),
    );
    s = execute(
      proposal.state,
      { type: "approve", id: proposal.result, revision: 1 },
      ctx(),
    ).state;
    const session = s.proposals[0].alternatives[0].sessions[0];
    session.eventId = "original-google-event";
    expect(() =>
      execute(
        s,
        {
          type: "update_calendar_session",
          sessionId: session.id,
          revision: 1,
          start: session.start + 3 * 3600000,
          end: session.end + 3 * 3600000,
        },
        ctx(),
      ),
    ).toThrow("external calendar");
    const events = overviewEvents(s, {
      actorId: DEMO_USER,
      assigneeId: DEMO_USER,
      projectId: "all",
      zone: "America/Chicago",
      from: "2026-10-26",
      to: "2026-10-26",
      showProposed: false,
    });
    expect(
      events.find((event) => event.kind === "scheduled")?.sessionId,
    ).toBeUndefined();
  });
  it("does not allocate already reserved effort twice and respects its prerequisite finish", () => {
    let s = reserve(seed()).state;
    s.tasks[1].dependencies = ["first"];
    const result = execute(
      s,
      { type: "propose", startDate: "2026-10-26", days: 7, trigger: "weekly" },
      ctx(),
    );
    const sessions = result.state.proposals.find(
      (row) => row.id === result.result,
    )!.alternatives[0].sessions;
    expect(sessions.some((row) => row.taskId === "first")).toBe(false);
    expect(
      sessions.find((row) => row.taskId === "second")!.start,
    ).toBeGreaterThanOrEqual(start + 75 * 60000);
  });
  it("rechecks the focus limit at approval if newer reservations appeared outside the proposed slot", () => {
    let s = seed();
    s.members.find((m) => m.id === DEMO_USER)!.preferences.dailyMinutes = 90;
    s.tasks[0].remainingMinutes = 90;
    s.tasks[0].estimatedMinutes = 90;
    s.tasks[1].status = "backlog";
    const proposal = execute(
      s,
      { type: "propose", startDate: "2026-10-26", days: 1, trigger: "weekly" },
      ctx(),
    );
    s = structuredClone(proposal.state);
    s.tasks[1].status = "todo";
    s.calendarSessions = reserve(seed(), {
      taskId: "second",
      start: start + 3 * 3600000,
      end: start + 4 * 3600000,
    }).state.calendarSessions;
    expect(() =>
      execute(s, { type: "approve", id: proposal.result, revision: 1 }, ctx()),
    ).toThrow("daily focus limit");
  });
  it("enables native publishing without erasing connected external availability", () => {
    const s = seed();
    s.calendars[0] = {
      ownerId: DEMO_USER,
      status: "connected",
      destinationId: "old-google",
      selectedIds: ["external"],
      lastSync: now,
      availabilityFrom: now,
      availabilityUntil: start + 8 * 3600000,
      shareAvailability: true,
    };
    s.busy = [{ ownerId: DEMO_USER, start, end: start + 3600000 }];
    const enabled = execute(s, { type: "use_kazi_agenda" }, ctx()).state;
    expect(enabled.calendars[0]).toMatchObject({
      status: "native",
      selectedIds: ["external"],
      shareAvailability: true,
      availabilityUntil: start + 8 * 3600000,
    });
    expect(enabled.busy).toEqual(s.busy);
    expect(() => reserve(enabled)).toThrow("overlaps");
  });
  it("reserves assigned committed work without changing task stage or due date", () => {
    const s = seed(),
      task = structuredClone(s.tasks[0]);
    const r = reserve(s);
    expect(r.state.calendarSessions).toHaveLength(1);
    expect(r.state.tasks[0]).toEqual(task);
    expect(s.calendarSessions).toEqual([]);
    expect(r.state.calendarSessions![0]).toMatchObject({
      id: r.result,
      revision: 1,
      status: "scheduled",
      history: [{ action: "scheduled", at: now }],
    });
    expect(r.state.activities[0].changes).toEqual(["calendar"]);
    expect(r.state.lifecycleEvents!.at(-1)?.action).toBe("calendar_scheduled");
  });
  it("rejects unverified, other-worker, hidden, Backlog, parent, and invalid-time reservations", () => {
    const s = seed();
    expect(() =>
      execute(
        s,
        {
          type: "schedule_calendar_session",
          taskId: "first",
          start,
          end: start + 3600000,
        },
        { ...ctx(), verifiedCalendar: false },
      ),
    ).toThrow("Fresh calendar");
    s.tasks[0].assigneeId = "demo-amira";
    expect(() => reserve(s)).toThrow("Only the worker");
    s.tasks[0].assigneeId = DEMO_USER;
    s.tasks[0].status = "backlog";
    expect(() => reserve(s)).toThrow("To do or In progress");
    s.tasks[0].status = "todo";
    s.tasks[1].parentId = "first";
    expect(() => reserve(s)).toThrow("subtasks");
    s.tasks[1].parentId = undefined;
    expect(() => reserve(s, { start: now - 3600000, end: now })).toThrow(
      "future",
    );
    expect(() => reserve(s, { end: start + 10 * 60000 })).toThrow(
      "between 30 and 90",
    );
    s.projects.find((p) => p.id === "website")!.private = true;
    s.projects.find((p) => p.id === "website")!.ownerId = "demo-amira";
    s.projects.find((p) => p.id === "website")!.memberIds = [];
    s.members.find((m) => m.id === DEMO_USER)!.role = "member";
    expect(() => reserve(s)).toThrow("do not have access");
  });
  it("rechecks overlaps, buffers, working hours, deadlines and dependency coverage", () => {
    let s = reserve(seed()).state;
    expect(() =>
      reserve(s, {
        taskId: "second",
        start: start + 45 * 60000,
        end: start + 105 * 60000,
      }),
    ).toThrow("overlaps");
    expect(() =>
      reserve(s, {
        taskId: "second",
        start: start + 65 * 60000,
        end: start + 125 * 60000,
      }),
    ).toThrow("buffer");
    expect(() =>
      reserve(seed(), { start: start - 3600000, end: start }),
    ).toThrow("working hours");
    s = seed();
    s.tasks[0].deadline = "2026-10-26T14:30:00Z";
    expect(() => reserve(s)).toThrow("deadline");
    s.tasks[0].deadline = undefined;
    s.tasks[0].dependencies = ["second"];
    expect(() => reserve(s)).toThrow("prerequisite");
    s = reserve(s, { taskId: "second" }).state;
    expect(() =>
      reserve(s, { start: start + 75 * 60000, end: start + 135 * 60000 }),
    ).not.toThrow();
  });
  it("limits daily focus and rejects stale/out-of-range external availability", () => {
    const s = seed();
    s.members.find((m) => m.id === DEMO_USER)!.preferences.dailyMinutes = 60;
    const first = reserve(s).state;
    expect(() =>
      reserve(first, {
        taskId: "second",
        start: start + 75 * 60000,
        end: start + 135 * 60000,
      }),
    ).toThrow("daily focus limit");
    const cal = s.calendars[0];
    cal.selectedIds = ["external"];
    expect(() => reserve(s)).toThrow("Refresh connected");
    cal.availabilityFrom = start;
    cal.availabilityUntil = start + 2 * 3600000;
    expect(() => reserve(s)).not.toThrow();
    cal.lastSync = now - 6 * 60000;
    expect(() => reserve(s)).toThrow("Refresh connected");
  });
  it("retains recurring wall times across DST and skips nonworking days", () => {
    const r = reserve(seed(), {
      recurrence: { frequency: "daily", count: 7, timezone: "America/Chicago" },
    });
    const rows = r.state.calendarSessions!;
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((s) => s.seriesId)).size).toBe(1);
    expect(rows[5].start).toBe(Date.parse("2026-11-02T15:00:00Z"));
    expect(rows[5].start - rows[0].start).toBe(7 * 86400000 + 3600000);
    expect(() =>
      reserve(seed(), {
        recurrence: {
          frequency: "weekly",
          count: 2,
          timezone: "America/New_York",
        },
      }),
    ).toThrow("saved calendar time zone");
  });
  it("edits a series atomically, rejects stale revisions and preserves exceptions", () => {
    let s = reserve(seed(), {
      recurrence: {
        frequency: "weekly",
        count: 3,
        timezone: "America/Chicago",
      },
    }).state;
    const first = s.calendarSessions![0];
    s = execute(
      s,
      {
        type: "update_calendar_session",
        sessionId: first.id,
        revision: 1,
        start: first.start + 2 * 3600000,
        end: first.end + 2 * 3600000,
        scope: "following",
      },
      ctx(),
    ).state;
    expect(s.calendarSessions!.every((row) => row.revision === 2)).toBe(true);
    expect(s.calendarSessions![0].history.at(-1)?.action).toBe("rescheduled");
    expect(() =>
      execute(
        s,
        {
          type: "update_calendar_session",
          sessionId: first.id,
          revision: 1,
          start: first.start + 3 * 3600000,
          end: first.end + 3 * 3600000,
        },
        ctx(),
      ),
    ).toThrow("changed");
    const before = structuredClone(s);
    expect(() =>
      execute(
        s,
        {
          type: "update_calendar_session",
          sessionId: first.id,
          revision: 2,
          start: first.start + 8 * 3600000,
          end: first.end + 8 * 3600000,
          scope: "series",
        },
        ctx(),
      ),
    ).toThrow("working hours");
    expect(s).toEqual(before);
  });
  it("releases and restores with revision-safe Undo, preserving ICS cancellation UID and sequence", () => {
    let s = reserve(seed()).state;
    const row = s.calendarSessions![0],
      ics = buildIcal(s, DEMO_USER);
    s = execute(
      s,
      { type: "cancel_calendar_session", sessionId: row.id, revision: 1 },
      ctx(),
    ).state;
    const canceled = buildIcal(s, DEMO_USER);
    expect(canceled).toContain(`UID:${row.id}@agenda.kazi`);
    expect(canceled).toContain("STATUS:CANCELLED");
    expect(canceled).not.toBe(ics);
    expect(calendarReservations(s)).toHaveLength(0);
    s = execute(
      s,
      {
        type: "update_calendar_session",
        sessionId: row.id,
        revision: 2,
        start: row.start,
        end: row.end,
        restore: true,
      },
      ctx(),
    ).state;
    expect(s.calendarSessions![0].revision).toBe(3);
    expect(s.calendarSessions![0].status).toBe("scheduled");
    expect(buildIcal(s, DEMO_USER)).toContain("STATUS:CONFIRMED");
  });
  it("overlays native accepted sessions without rewriting immutable plan history", () => {
    let s = seed();
    s.tasks = s.tasks.slice(0, 1);
    const proposal = execute(
      s,
      { type: "propose", startDate: "2026-10-26", days: 7, trigger: "weekly" },
      ctx(),
    );
    s = execute(
      proposal.state,
      { type: "approve", id: proposal.result, revision: 1 },
      ctx(),
    ).state;
    const snapshot = structuredClone(s.versions),
      session = calendarSessions(s)[0];
    s = execute(
      s,
      {
        type: "update_calendar_session",
        sessionId: session.id,
        revision: 1,
        start: session.start + 3 * 3600000,
        end: session.end + 3 * 3600000,
      },
      ctx(),
    ).state;
    expect(s.versions).toEqual(snapshot);
    expect(calendarReservations(s)).toHaveLength(1);
    expect(calendarReservations(s)[0].start).toBe(session.start + 3 * 3600000);
    const events = overviewEvents(s, {
      actorId: DEMO_USER,
      assigneeId: DEMO_USER,
      projectId: "all",
      zone: "America/Chicago",
      from: "2026-10-26",
      to: "2026-10-26",
      showProposed: false,
    });
    expect(events.filter((e) => e.kind === "scheduled")).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: session.id,
      sessionRevision: 2,
    });
    expect(buildIcal(s, DEMO_USER).match(/BEGIN:VEVENT/g) ?? []).toHaveLength(
      1,
    );
  });
  it("projects only visible sessions and reports unioned capacity", () => {
    let s = reserve(seed()).state;
    s.busy = [
      {
        ownerId: DEMO_USER,
        start: start + 3 * 3600000,
        end: start + 4 * 3600000,
      },
      {
        ownerId: DEMO_USER,
        start: start + 3 * 3600000,
        end: start + 4 * 3600000,
      },
    ];
    const capacity = calendarDayCapacity(s, DEMO_USER, "2026-10-26", now);
    expect(capacity).toMatchObject({
      scheduledMinutes: 60,
      busyMinutes: 60,
      availableMinutes: 240,
      availabilityFresh: true,
    });
    s.projects.find((p) => p.id === "website")!.private = true;
    s.projects.find((p) => p.id === "website")!.memberIds = [DEMO_USER];
    s.members.find((m) => m.id === "demo-amira")!.role = "member";
    expect(visibleState(s, "demo-amira").calendarSessions).toHaveLength(0);
  });
  it("delivers an at-start reminder when a durable job runs a millisecond late", () => {
    const s = reserve(seed(), { reminderMinutes: 0 }).state,
      row = s.calendarSessions![0];
    const delivered = deliverCalendarReminder(
      s,
      row.id,
      1,
      start + 1,
      ctx().id,
    );
    expect(
      delivered.notifications.find((n) =>
        n.key.startsWith("calendar-reminder:"),
      )?.title,
    ).toBe("Focus session started");
    expect(
      deliverCalendarReminder(
        s,
        row.id,
        1,
        row.end + 1,
        ctx().id,
      ).notifications.some((n) => n.key.startsWith("calendar-reminder:")),
    ).toBe(false);
  });
  it("delivers reminders once, rechecks current authority and rejects stale scheduled jobs", () => {
    let s = reserve(seed(), { reminderMinutes: 15 }).state;
    const row = s.calendarSessions![0],
      at = start - 15 * 60000;
    s = deliverCalendarReminder(s, row.id, 1, at, ctx().id);
    expect(
      s.notifications.filter((n) => n.key.startsWith("calendar-reminder:")),
    ).toHaveLength(1);
    s = deliverCalendarReminder(s, row.id, 1, at, ctx().id);
    expect(
      s.notifications.filter((n) => n.key.startsWith("calendar-reminder:")),
    ).toHaveLength(1);
    const initial = reserve(seed(), { reminderMinutes: 15 }).state,
      target = initial.calendarSessions![0];
    const canceled = execute(
      initial,
      { type: "cancel_calendar_session", sessionId: target.id, revision: 1 },
      ctx(),
    ).state;
    expect(
      deliverCalendarReminder(
        canceled,
        target.id,
        1,
        at,
        ctx().id,
      ).notifications.filter((n) => n.key.startsWith("calendar-reminder:")),
    ).toHaveLength(0);
    initial.tasks[0].assigneeId = "demo-amira";
    expect(
      deliverCalendarReminder(
        initial,
        target.id,
        1,
        at,
        ctx().id,
      ).notifications.filter((n) => n.key.startsWith("calendar-reminder:")),
    ).toHaveLength(0);
  });
});
