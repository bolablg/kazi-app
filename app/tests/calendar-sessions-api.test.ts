// @vitest-environment edge-runtime
import { afterEach, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Command } from "../shared/model";
import { crossTeamReservations } from "../convex/store";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());
const identity = {
  subject: "calendar-owner",
  name: "Calendar Owner",
  email: "calendar@example.test",
  emailVerified: true,
};
const now = Date.parse("2026-10-26T13:00:00Z"),
  start = Date.parse("2026-10-26T14:00:00Z");
const create: Command = {
  type: "create_task",
  title: "A focused delivery",
  description: "",
  status: "todo",
  priority: "high",
  estimatedMinutes: 120,
  dependencies: [],
  labels: [],
};
it("returns exact lost-response retries after revisions and start dates change, and rejects key reuse", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules),
    owner = t.withIdentity(identity),
    workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!,
    taskId = await owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify(create),
      requestId: "task",
    });
  const invoke = (command: Command, requestId: string) =>
    owner.action(api.commands.calendar, {
      workspaceId,
      command: JSON.stringify(command),
      requestId,
    });
  const schedule: Command = {
    type: "schedule_calendar_session",
    taskId,
    start,
    end: start + 3600000,
  };
  const sessionId = await invoke(schedule, "schedule-retry");
  const update: Command = {
    type: "update_calendar_session",
    sessionId,
    revision: 1,
    start: start + 2 * 3600000,
    end: start + 3 * 3600000,
  };
  expect(await invoke(update, "update-retry")).toBe(sessionId);
  const before = (await owner.query(api.commands.snapshot, { workspaceId }))
    .calendarSessions;
  vi.setSystemTime(start + 4 * 3600000);
  expect(await invoke(update, "update-retry")).toBe(sessionId);
  expect(await invoke(schedule, "schedule-retry")).toBe(sessionId);
  expect(
    (await owner.query(api.commands.snapshot, { workspaceId }))
      .calendarSessions,
  ).toEqual(before);
  await expect(
    invoke({ ...schedule, end: start + 30 * 60000 }, "schedule-retry"),
  ).rejects.toThrow("different action");
});
it("uses the verified calendar action, persists idempotently and rechecks concurrent conflicts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules),
    owner = t.withIdentity(identity),
    workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
  const taskId = await owner.mutation(api.commands.execute, {
    workspaceId,
    command: JSON.stringify(create),
    requestId: "task",
  });
  const command: Command = {
    type: "schedule_calendar_session",
    taskId,
    start,
    end: start + 3600000,
    reminderMinutes: 15,
  };
  await expect(
    owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify(command),
      requestId: "unverified",
    }),
  ).rejects.toThrow("verified action");
  const invoke = (cmd: Command, requestId: string) =>
    owner.action(api.commands.calendar, {
      workspaceId,
      command: JSON.stringify(cmd),
      requestId,
    });
  const id = await invoke(command, "one-reservation");
  expect(await invoke(command, "one-reservation")).toBe(id);
  let state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.calendarSessions).toHaveLength(1);
  expect(state.tasks[0].status).toBe("todo");
  await expect(
    invoke(
      { ...command, start: start + 30 * 60000, end: start + 90 * 60000 },
      "overlap",
    ),
  ).rejects.toThrow("overlaps");
  const out = await Promise.allSettled([
    invoke(
      { ...command, start: start + 2 * 3600000, end: start + 3 * 3600000 },
      "racer-a",
    ),
    invoke(
      { ...command, start: start + 2 * 3600000, end: start + 3 * 3600000 },
      "racer-b",
    ),
  ]);
  expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.calendarSessions).toHaveLength(2);
  const stranger = t.withIdentity({ ...identity, subject: "other-owner" });
  await expect(
    stranger.action(api.commands.calendar, {
      workspaceId,
      command: JSON.stringify(command),
      requestId: "denied",
    }),
  ).rejects.toThrow("unavailable");
  await invoke(
    { type: "cancel_calendar_session", sessionId: id, revision: 1 },
    "cancel",
  );
  await vi.advanceTimersByTimeAsync(start - 15 * 60000 - Date.now());
  await t.finishInProgressScheduledFunctions();
  state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(
    state.notifications.some((n) => n.key === `calendar-reminder:${id}:1`),
  ).toBe(false);
});
it("uses planned focus across teams for both conflict and daily capacity limits", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules),
    owner = t.withIdentity(identity),
    a = (await owner.mutation(api.commands.bootstrap, {}))!,
    b = await owner.mutation(api.commands.createTeam, { name: "Delivery" });
  const taskA = await owner.mutation(api.commands.execute, {
      workspaceId: a,
      command: JSON.stringify(create),
      requestId: "a-task",
    }),
    taskB = await owner.mutation(api.commands.execute, {
      workspaceId: b,
      command: JSON.stringify(create),
      requestId: "b-task",
    });
  const reserve = (
    workspaceId: typeof a,
    taskId: string,
    at: number,
    minutes: number,
    key: string,
  ) =>
    owner.action(api.commands.calendar, {
      workspaceId,
      command: JSON.stringify({
        type: "schedule_calendar_session",
        taskId,
        start: at,
        end: at + minutes * 60000,
      }),
      requestId: key,
    });
  await reserve(a, taskA, start, 90, "first");
  await reserve(a, taskA, start + 105 * 60000, 90, "second");
  await reserve(a, taskA, start + 210 * 60000, 90, "third");
  await expect(reserve(b, taskB, start, 60, "cross-overlap")).rejects.toThrow(
    "overlaps",
  );
  await expect(
    reserve(b, taskB, start + 315 * 60000, 60, "cross-limit"),
  ).rejects.toThrow("daily focus limit");
  await reserve(b, taskB, start + 315 * 60000, 30, "last-half-hour");
  await owner.mutation(api.commands.execute, {
    workspaceId: a,
    command: JSON.stringify({
      type: "update_task",
      id: taskA,
      patch: { status: "done" },
    }),
    requestId: "complete",
  });
  const released = await owner.query(api.commands.snapshot, { workspaceId: a });
  expect(
    released.calendarSessions!.every((row) => row.status === "released"),
  ).toBe(true);
  expect(
    released.calendarSessions!.every(
      (row) => row.history.at(-1)?.action === "released",
    ),
  ).toBe(true);
  await reserve(b, taskB, start, 60, "now-free");
});
it("fails closed if membership count exceeds complete cross-team availability coverage", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity(identity),
    workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
  await t.run(async (ctx) => {
    const profile = await ctx.db.query("memberships").first();
    for (let i = 0; i < 10; i++) {
      const other = await ctx.db.insert("workspaces", {
        key: "coverage-team-" + i,
        name: "Coverage",
        kind: "team",
        ownerId: identity.subject,
        inboxId: "inbox-" + i,
        nextEvaluationAt: 0,
      });
      await ctx.db.insert("memberships", {
        workspaceId: other,
        key: identity.subject,
        subject: identity.subject,
        data: profile!.data,
      });
    }
  });
  await expect(
    t.run((ctx) => crossTeamReservations(ctx, identity.subject, workspaceId)),
  ).rejects.toThrow("at most ten");
});
it("restores exact series snapshots atomically and rejects a stale batch before changing any record", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules),
    owner = t.withIdentity(identity),
    workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!,
    taskId = await owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify(create),
      requestId: "task",
    });
  const invoke = (command: Command, requestId: string) =>
    owner.action(api.commands.calendar, {
      workspaceId,
      command: JSON.stringify(command),
      requestId,
    });
  await invoke(
    {
      type: "schedule_calendar_session",
      taskId,
      start,
      end: start + 3600000,
      recurrence: {
        frequency: "weekly",
        count: 3,
        timezone: "America/Chicago",
      },
    },
    "series",
  );
  const original = (await owner.query(api.commands.snapshot, { workspaceId }))
    .calendarSessions!;
  await invoke(
    {
      type: "update_calendar_session",
      sessionId: original[1].id,
      revision: 1,
      start: original[1].start + 2 * 3600000,
      end: original[1].end + 2.5 * 3600000,
    },
    "exception",
  );
  const before = (await owner.query(api.commands.snapshot, { workspaceId }))
    .calendarSessions!;
  await invoke(
    {
      type: "update_calendar_session",
      sessionId: before[0].id,
      revision: 1,
      start: before[0].start + 3600000,
      end: before[0].end + 3600000,
      scope: "series",
    },
    "move-all",
  );
  const moved = (await owner.query(api.commands.snapshot, { workspaceId }))
    .calendarSessions;
  const targets = before.map((row) => ({
    sessionId: row.id,
    revision: row.revision + 1,
    start: row.start,
    end: row.end,
    status: row.status,
    reminderMinutes: row.reminderMinutes ?? null,
  }));
  await expect(
    invoke(
      {
        type: "restore_calendar_sessions",
        sessions: targets.map((row, i) =>
          i === 1 ? { ...row, revision: 1 } : row,
        ),
      },
      "stale-undo",
    ),
  ).rejects.toThrow("changed");
  expect(
    (await owner.query(api.commands.snapshot, { workspaceId }))
      .calendarSessions,
  ).toEqual(moved);
  await invoke(
    { type: "restore_calendar_sessions", sessions: targets },
    "undo",
  );
  const restored = (await owner.query(api.commands.snapshot, { workspaceId }))
    .calendarSessions!;
  for (const prior of before)
    expect(restored.find((row) => row.id === prior.id)).toMatchObject({
      start: prior.start,
      end: prior.end,
      status: prior.status,
      revision: prior.revision + 2,
    });
});
