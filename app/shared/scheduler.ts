import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "./workflow";
import { stableId } from "./ids";
import { Temporal } from "@js-temporal/polyfill";
import {
  type Allocation,
  type Busy,
  type Preferences,
  type Task,
  type Session,
  fail,
} from "./model";
export const MINUTE = 60000;
export interface Interval {
  start: number;
  end: number;
}
export function localInstant(date: string, hour: number, zone: string): number {
  const day = Temporal.PlainDate.from(date).add({ days: hour === 24 ? 1 : 0 });
  try {
    return Number(
      Temporal.ZonedDateTime.from(
        {
          year: day.year,
          month: day.month,
          day: day.day,
          hour: hour === 24 ? 0 : hour,
          timeZone: zone,
        },
        { disambiguation: "reject" },
      ).epochMilliseconds,
    );
  } catch {
    return fail(
      "LOCAL_TIME",
      "A working-hour boundary is ambiguous or nonexistent during a daylight saving change. Choose a different hour.",
    );
  }
}
export function deadlineAt(deadline: string | undefined, zone: string): number {
  if (!deadline) return Infinity;
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? localInstant(deadline, 24, zone)
    : Number(Temporal.Instant.from(deadline).epochMilliseconds);
}
export function dateInZone(now: number, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function subtractIntervals(
  available: Interval[],
  busy: Interval[],
  buffer = 0,
): Interval[] {
  let result = available.map((x) => ({ ...x }));
  for (const b of [...busy].sort((a, c) => a.start - c.start))
    result = result.flatMap((a) => {
      const start = b.start - buffer,
        end = b.end + buffer;
      if (end <= a.start || start >= a.end) return [a];
      return [
        { start: a.start, end: Math.min(start, a.end) },
        { start: Math.max(end, a.start), end: a.end },
      ].filter((x) => x.end > x.start);
    });
  return result;
}
export function workingIntervals(
  startDate: string,
  days: number,
  p: Preferences,
  now: number,
): Interval[] {
  if (p.endHour <= p.startHour || p.maxSession < p.minSession)
    fail("PREFERENCES", "Working hours and session limits are inconsistent.");
  return Array.from({ length: Math.min(days, p.horizonDays) }, (_, i) =>
    addDays(startDate, i),
  )
    .filter((d) => p.workingDays.includes(Temporal.PlainDate.from(d).dayOfWeek))
    .map((d) => ({
      start: Math.max(now, localInstant(d, p.startHour, p.timezone)),
      end: localInstant(d, p.endHour, p.timezone),
    }))
    .filter((x) => x.end > x.start);
}
export function allocate(input: {
  tasks: Task[];
  allTasks?: Task[];
  confirmedSessions?: Session[];
  busy: Busy[];
  preferences: Record<string, Preferences>;
  startDate: string;
  days: number;
  now: number;
  recoveryTarget?: string;
  windowStart?: number;
  windowEnd?: number;
  strategy?: "early" | "focus" | "compact";
}): Allocation {
  const { tasks, busy, preferences, startDate, days, now, recoveryTarget } =
    input;
  const all = input.allTasks ?? tasks;
  const candidates = tasks.filter(
    (t) =>
      isSchedulableTask(t) && !all.some((child) => child.parentId === t.id),
  );
  const lookup = new Map(all.map((t) => [t.id, t]));
  const done = new Set<string>(),
    visiting = new Set<string>(),
    ordered: Task[] = [];
  const rank = { high: 0, medium: 1, low: 2 };
  function visit(t: Task) {
    if (done.has(t.id)) return;
    if (visiting.has(t.id))
      fail(
        "DEPENDENCY_CYCLE",
        "These tasks depend on each other. Remove the circular dependency before planning.",
      );
    visiting.add(t.id);
    for (const id of [...t.dependencies].sort()) {
      const d = lookup.get(id);
      if (!d) fail("DEPENDENCY", "A prerequisite is unavailable.");
      if (candidates.some((c) => c.id === id)) visit(d);
    }
    visiting.delete(t.id);
    done.add(t.id);
    ordered.push(t);
  }
  [...candidates]
    .sort(
      (a, b) =>
        rank[a.priority] - rank[b.priority] ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.id.localeCompare(b.id),
    )
    .forEach(visit);
  const slots: Record<string, Interval[]> = {};
  for (const [owner, p] of Object.entries(preferences)) {
    const firstDate =
      input.windowStart !== undefined
        ? dateInZone(Math.max(now, input.windowStart), p.timezone)
        : startDate;
    const periodDays =
      input.windowEnd !== undefined
        ? Math.max(
            0,
            Temporal.PlainDate.from(firstDate).until(
              Temporal.PlainDate.from(
                dateInZone(input.windowEnd - 1, p.timezone),
              ),
            ).days + 1,
          )
        : days;
    slots[owner] = subtractIntervals(
      // A sprint can cross two local working dates even when it lasts one day
      // in its own timezone. Each owner's saved horizon still bounds the slots.
      workingIntervals(firstDate, periodDays, p, now)
        .map((interval) => ({
          start: Math.max(interval.start, input.windowStart ?? -Infinity),
          end: Math.min(interval.end, input.windowEnd ?? Infinity),
        }))
        .filter((interval) => interval.end > interval.start),
      busy.filter((b) => b.ownerId === owner),
      p.bufferMinutes * MINUTE,
    );
    if (input.strategy === "focus")
      slots[owner] = slots[owner]
        .map((s) => ({
          ...s,
          start: Math.max(
            s.start,
            localInstant(dateInZone(s.start, p.timezone), 10, p.timezone),
          ),
        }))
        .filter((s) => s.end > s.start);
  }
  const held = (input.confirmedSessions ?? []).filter(
    (session) => session.status === "scheduled" && session.end > now,
  );
  const heldFor = (task: Task) =>
    held.filter(
      (session) =>
        session.taskId === task.id && session.assigneeId === task.assigneeId,
    );
  const heldMinutes = (task: Task) => {
    let until = -Infinity,
      minutes = 0;
    for (const span of heldFor(task).sort((a, b) => a.start - b.start)) {
      const start = Math.max(now, span.start);
      minutes += Math.max(0, span.end - Math.max(until, start)) / MINUTE;
      until = Math.max(until, span.end);
    }
    return minutes;
  };
  const used: Record<string, number> = {},
    finish: Record<string, number> = {};
  for (const task of all) {
    const effort = task.remainingMinutes ?? task.estimatedMinutes;
    if (
      effort !== undefined &&
      heldMinutes(task) >= effort &&
      heldFor(task).length
    )
      finish[task.id] = Math.max(
        ...heldFor(task).map((session) => session.end),
      );
  }
  const focusByDay = new Map<string, { start: number; end: number }[]>();
  for (const focus of [
    ...(input.confirmedSessions ?? [])
      .filter((session) => session.status === "scheduled")
      .map((session) => ({
        ownerId: session.assigneeId,
        start: session.start,
        end: session.end,
      })),
    ...busy.filter((interval) => interval.source === "kazi"),
  ]) {
    const pref = preferences[focus.ownerId];
    if (!pref) continue;
    for (
      let day = dateInZone(focus.start, pref.timezone);
      day <= dateInZone(focus.end - 1, pref.timezone);
      day = addDays(day, 1)
    ) {
      const at = Number(
          Temporal.PlainDate.from(day).toZonedDateTime(pref.timezone)
            .epochMilliseconds,
        ),
        until = Number(
          Temporal.PlainDate.from(day)
            .add({ days: 1 })
            .toZonedDateTime(pref.timezone).epochMilliseconds,
        ),
        key = focus.ownerId + day;
      focusByDay.set(key, [
        ...(focusByDay.get(key) ?? []),
        { start: Math.max(focus.start, at), end: Math.min(focus.end, until) },
      ]);
    }
  }
  for (const [key, spans] of focusByDay) {
    let until = -Infinity;
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      used[key] =
        (used[key] ?? 0) +
        Math.max(0, span.end - Math.max(span.start, until)) / MINUTE;
      until = Math.max(until, span.end);
    }
  }

  const sessions: Allocation["sessions"] = [],
    unscheduled: Allocation["unscheduled"] = [];
  for (const task of ordered) {
    let left = task.remainingMinutes ?? task.estimatedMinutes;
    if (left === undefined) {
      unscheduled.push({
        taskId: task.id,
        minutes: 0,
        reason: "Add a remaining-effort estimate before scheduling.",
      });
      continue;
    }
    left = Math.max(0, left - heldMinutes(task));
    if (left === 0) continue;
    const p = task.assigneeId ? preferences[task.assigneeId] : undefined;
    const missingDependency = task.dependencies.some((id) => {
      const t = lookup.get(id);
      return !t || (t.status !== "done" && finish[id] === undefined);
    });
    const reason =
      task.status === "blocked"
        ? "This task is blocked."
        : !p
          ? "Resolve the assignee and calendar owner."
          : missingDependency
            ? "A prerequisite cannot finish in this plan."
            : undefined;
    if (reason) {
      unscheduled.push({ taskId: task.id, minutes: left, reason });
      continue;
    }
    const owner = task.assigneeId!,
      pref = p!;
    const cutoff = deadlineAt(recoveryTarget ?? task.deadline, pref.timezone);
    const earliest = Math.max(
      now,
      task.startDate ? localInstant(task.startDate, 0, pref.timezone) : now,
      ...task.dependencies.map((id) => finish[id] ?? now),
    );
    const intervals = slots[owner];
    for (let i = 0; i < intervals.length && left > 0; i++) {
      const interval = intervals[i],
        day = dateInZone(interval.start, pref.timezone),
        key = owner + day;
      const start =
        Math.ceil(Math.max(interval.start, earliest) / MINUTE) * MINUTE;
      const capacity = pref.dailyMinutes - (used[key] ?? 0);
      const max =
        input.strategy === "compact"
          ? pref.maxSession
          : Math.max(pref.minSession, Math.min(60, pref.maxSession));
      let amount = Math.floor(
        Math.min(
          left,
          max,
          capacity,
          (Math.min(interval.end, cutoff) - start) / MINUTE,
        ),
      );
      if (left > amount && left - amount < pref.minSession) {
        if (left >= 2 * pref.minSession && left - pref.minSession <= amount)
          amount = left - pref.minSession;
        else continue; // Wait for a larger slot rather than strand a forbidden tiny remainder.
      }
      if (amount < pref.minSession || amount <= 0) continue;
      const end = start + amount * MINUTE;
      sessions.push({
        id: stableId("proposed-session", task.id, start),
        taskId: task.id,
        assigneeId: owner,
        start,
        end,
        status: "proposed",
      });
      used[key] = (used[key] ?? 0) + amount;
      left -= amount;
      interval.start = end + pref.bufferMinutes * MINUTE;
      if (left > 0 && interval.end - interval.start >= pref.minSession * MINUTE)
        i--;
    }
    if (left > 0)
      unscheduled.push({
        taskId: task.id,
        minutes: left,
        reason:
          "Not enough permitted time before the target. Change scope, availability, or the recovery target.",
      });
    else
      finish[task.id] = Math.max(
        now,
        ...heldFor(task).map((session) => session.end),
        ...sessions.filter((s) => s.taskId === task.id).map((s) => s.end),
      );
  }
  const scheduledMinutes = sessions.reduce(
    (n, s) => n + (s.end - s.start) / MINUTE,
    0,
  );
  return {
    sessions,
    unscheduled,
    scheduledMinutes,
    remainingMinutes: unscheduled.reduce((n, u) => n + u.minutes, 0),
    explanations: [
      `${scheduledMinutes} minutes fit within working hours and daily limits.`,
      `${input.strategy === "focus" ? "Later focus periods" : input.strategy === "compact" ? "Longer blocks" : "Earlier completion"} preferred.`,
      recoveryTarget
        ? "Recovery target is separate from the original deadline."
        : "Original deadlines remain unchanged.",
      "Parent effort is excluded when subtasks carry the workload.",
    ],
    algorithm: "kazi-allocator/1.0",
  };
}
