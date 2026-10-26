import { Temporal } from "@js-temporal/polyfill";
import type { CalendarSession, Session, State } from "./model";
import { fail } from "./model";
import { isOpenTask, isSchedulableTask } from "./workflow";
import {
  dateInZone,
  deadlineAt,
  localInstant,
  MINUTE,
  subtractIntervals,
} from "./scheduler";

/** Current mutable receipts take precedence over accepted immutable snapshots. */
export function calendarSessions(state: State): CalendarSession[] {
  const result = new Map((state.calendarSessions ?? []).map((s) => [s.id, s]));
  const receipts = [
    ...state.proposals
      .filter((p) => ["applied", "partial", "applying"].includes(p.status))
      .map((p) => ({
        at: p.createdAt,
        by: p.createdBy,
        sessions: p.alternatives[p.selected]?.sessions ?? [],
      })),
    ...state.versions
      .filter((v) => !state.proposals.some((p) => p.id === v.proposalId))
      .map((v) => ({ at: v.createdAt, by: v.createdBy, sessions: v.sessions })),
  ];
  for (const receipt of receipts)
    for (const s of receipt.sessions) {
      if (result.has(s.id) || !["scheduled", "released"].includes(s.status))
        continue;
      result.set(s.id, {
        id: s.id,
        taskId: s.taskId,
        assigneeId: s.assigneeId,
        start: s.start,
        end: s.end,
        status: s.status as CalendarSession["status"],
        revision: 1,
        createdAt: receipt.at,
        updatedAt: s.updatedAt ?? receipt.at,
        createdBy: receipt.by,
        timezone:
          state.members.find((m) => m.id === s.assigneeId)?.preferences
            .timezone ?? "UTC",
        origin: "plan",
        originalStart: s.start,
        originalEnd: s.end,
        history: [],
      });
    }
  return [...result.values()];
}

/** Private reservation intervals: callers must apply their own authorized projection. */
export function calendarReservations(
  state: State,
  excludeIds: string[] = [],
): Session[] {
  const excluded = new Set(excludeIds);
  const overlays = new Set((state.calendarSessions ?? []).map((s) => s.id));
  const taskOpen = (id: string, ownerId: string) => {
    const t = state.tasks.find((t) => t.id === id);
    return (
      !!t &&
      isSchedulableTask(t) &&
      t.assigneeId === ownerId &&
      !state.projects.find((p) => p.id === t.projectId)?.archived
    );
  };
  const pending = state.proposals
    .filter((p) => ["applied", "partial", "applying"].includes(p.status))
    .flatMap((p) => p.alternatives[p.selected]?.sessions ?? [])
    .filter((s) => s.status === "pending" && !overlays.has(s.id));
  return [
    ...calendarSessions(state).filter((s) => s.status === "scheduled"),
    ...pending,
  ].filter((s) => !excluded.has(s.id) && taskOpen(s.taskId, s.assigneeId));
}

export function calendarAvailabilityFresh(
  state: State,
  ownerId: string,
  now: number,
  start?: number,
  end?: number,
) {
  const cal = state.calendars.find((c) => c.ownerId === ownerId);
  if (!cal || !["native", "demo", "connected"].includes(cal.status))
    return false;
  if (
    cal.status === "demo" ||
    (!cal.selectedIds.length && cal.destinationId === "kazi")
  )
    return true;
  return (
    cal.lastSync !== undefined &&
    now - cal.lastSync >= 0 &&
    now - cal.lastSync < 5 * MINUTE &&
    (start === undefined ||
      (cal.availabilityFrom !== undefined && cal.availabilityFrom <= start)) &&
    (end === undefined ||
      (cal.availabilityUntil !== undefined && cal.availabilityUntil >= end))
  );
}
function unionMinutes(intervals: { start: number; end: number }[]) {
  let end = -Infinity,
    total = 0;
  for (const span of intervals.sort((a, b) => a.start - b.start)) {
    total += Math.max(0, span.end - Math.max(end, span.start)) / MINUTE;
    end = Math.max(end, span.end);
  }
  return Math.round(total);
}
export function calendarDayCapacity(
  state: State,
  ownerId: string,
  day: string,
  now = Date.now(),
) {
  const member = state.members.find((m) => m.id === ownerId);
  if (!member)
    return {
      workingMinutes: 0,
      scheduledMinutes: 0,
      busyMinutes: 0,
      availableMinutes: 0,
      overbookedMinutes: 0,
      availabilityFresh: false,
      explanations: ["Calendar availability is private or unavailable."],
    };
  const p = member.preferences,
    working = p.workingDays.includes(Temporal.PlainDate.from(day).dayOfWeek);
  const start = localInstant(day, p.startHour, p.timezone),
    end = localInstant(day, p.endHour, p.timezone);
  const reservations = calendarReservations(state).filter(
    (s) => s.assigneeId === ownerId && s.start < end && s.end > start,
  );
  const shared = state.busy.filter(
    (b) => b.ownerId === ownerId && b.start < end && b.end > start,
  );
  const external = shared.filter((b) => b.source !== "kazi"),
    crossTeam = shared.filter((b) => b.source === "kazi");
  const clip = (s: { start: number; end: number }) => ({
    start: Math.max(start, s.start),
    end: Math.min(end, s.end),
  });
  const scheduledMinutes = unionMinutes(
      [...reservations, ...crossTeam].map(clip),
    ),
    busyMinutes = unionMinutes(external.map(clip));
  const workingMinutes = working ? Math.round((end - start) / MINUTE) : 0;
  const availabilityFresh = calendarAvailabilityFresh(
    state,
    ownerId,
    now,
    Math.min(end, Math.max(start, now)),
    end,
  );
  const free = working
    ? subtractIntervals(
        [{ start: Math.max(start, now), end }],
        [...reservations, ...shared],
        p.bufferMinutes * MINUTE,
      ).filter((i) => i.end > i.start)
    : [];
  const availableMinutes = availabilityFresh
    ? Math.max(
        0,
        Math.min(
          p.dailyMinutes - scheduledMinutes,
          free.reduce((sum, i) => sum + (i.end - i.start) / MINUTE, 0),
        ),
      )
    : 0;
  return {
    workingMinutes,
    scheduledMinutes,
    busyMinutes,
    availableMinutes: Math.floor(availableMinutes),
    overbookedMinutes: Math.max(0, scheduledMinutes - p.dailyMinutes),
    availabilityFresh,
    explanations: [
      ...(!working ? ["Outside your working days."] : []),
      ...(!availabilityFresh
        ? [
            "Refresh connected calendar availability before reserving this time.",
          ]
        : []),
      `Daily focus limit: ${p.dailyMinutes} minutes.`,
      ...(p.bufferMinutes
        ? [`${p.bufferMinutes}-minute buffers protect transitions.`]
        : []),
    ],
  };
}
export function calendarSessionIssues(
  state: State,
  input: { taskId: string; start: number; end: number },
  actorId: string,
  now: number,
  excludeSessionIds: string[] = [],
): string[] {
  const issues: string[] = [],
    task = state.tasks.find((t) => t.id === input.taskId),
    member = state.members.find((m) => m.id === actorId);
  if (!task || !member) return ["This task or calendar is unavailable."];
  if (task.assigneeId !== actorId)
    return ["Only the worker can reserve time on their own calendar."];
  const project = state.projects.find((p) => p.id === task.projectId);
  if (!project || project.archived)
    issues.push("Restore this project before scheduling work.");
  if (!isSchedulableTask(task))
    issues.push(
      "Move this task to To do or In progress before reserving time.",
    );
  if (
    state.tasks.some((child) => child.parentId === task.id && isOpenTask(child))
  )
    issues.push(
      "Reserve time for this task’s subtasks instead of counting their parent twice.",
    );
  if (
    !Number.isSafeInteger(input.start) ||
    !Number.isSafeInteger(input.end) ||
    input.end <= input.start ||
    input.start % MINUTE !== 0 ||
    input.end % MINUTE !== 0
  )
    return [...issues, "Choose a valid start and end time in whole minutes."];
  const p = member.preferences,
    day = dateInZone(input.start, p.timezone),
    endDay = dateInZone(input.end - 1, p.timezone),
    minutes = (input.end - input.start) / MINUTE;
  if (input.start < now) issues.push("Choose a time in the future.");
  if (input.start > now + 183 * 86400000 || input.end > now + 184 * 86400000)
    issues.push("Reserve time within the next six months.");
  if (
    day !== endDay ||
    !p.workingDays.includes(Temporal.PlainDate.from(day).dayOfWeek) ||
    input.start < localInstant(day, p.startHour, p.timezone) ||
    input.end > localInstant(day, p.endHour, p.timezone)
  )
    issues.push("Choose a time inside your saved working hours.");
  if (minutes < p.minSession || minutes > p.maxSession)
    issues.push(
      `Choose a session between ${p.minSession} and ${p.maxSession} minutes.`,
    );
  if (task.startDate && day < task.startDate)
    issues.push("This task’s planned start is later than the selected time.");
  if (input.end > deadlineAt(task.deadline, p.timezone))
    issues.push("This session would finish after the task’s deadline.");
  const reservations = calendarReservations(state, excludeSessionIds).filter(
    (s) => s.assigneeId === actorId,
  );
  const allBusy = [
    ...state.busy.filter((s) => s.ownerId === actorId),
    ...reservations,
  ];
  if (
    allBusy.some(
      (s) =>
        s.start - p.bufferMinutes * MINUTE < input.end &&
        s.end + p.bufferMinutes * MINUTE > input.start,
    )
  )
    issues.push(
      "This time overlaps another reservation, busy event, or transition buffer.",
    );
  const dayStart = localInstant(day, 0, p.timezone),
    dayEnd = localInstant(day, 24, p.timezone);
  if (
    minutes +
      unionMinutes(
        [
          ...reservations,
          ...state.busy.filter(
            (span) => span.ownerId === actorId && span.source === "kazi",
          ),
        ]
          .filter((s) => s.start < dayEnd && s.end > dayStart)
          .map((s) => ({
            start: Math.max(s.start, dayStart),
            end: Math.min(s.end, dayEnd),
          })),
      ) >
    p.dailyMinutes
  )
    issues.push("This session would exceed your daily focus limit.");
  for (const id of task.dependencies) {
    const dep = state.tasks.find((t) => t.id === id);
    if (!dep) {
      issues.push(
        "A prerequisite is unavailable. Resolve it before scheduling.",
      );
      break;
    }
    if (dep.status === "done") continue;
    const spans = calendarReservations(state).filter(
      (s) =>
        s.taskId === id &&
        s.status === "scheduled" &&
        s.start >= now &&
        s.end <= input.start,
    );
    const effort = dep.remainingMinutes ?? dep.estimatedMinutes;
    if (
      !isSchedulableTask(dep) ||
      effort === undefined ||
      spans.reduce((sum, s) => sum + (s.end - s.start) / MINUTE, 0) < effort
    ) {
      issues.push(
        "A prerequisite has not finished or does not have enough reserved time before this session.",
      );
      break;
    }
  }
  const dependents = new Set(
    state.tasks
      .filter((task) => task.dependencies.includes(input.taskId))
      .map((task) => task.id),
  );
  if (
    calendarReservations(state, excludeSessionIds).some(
      (session) =>
        dependents.has(session.taskId) &&
        session.start < input.end &&
        session.start >= now,
    )
  )
    issues.push(
      "This prerequisite would finish after a reserved dependent task starts.",
    );
  if (!calendarAvailabilityFresh(state, actorId, now, input.start, input.end))
    issues.push(
      "Refresh connected calendar availability before reserving this time.",
    );
  return [...new Set(issues)];
}
/** Count includes the first occurrence. Daily recurrence follows saved working days. */
export function calendarOccurrences(
  start: number,
  end: number,
  recurrence:
    | { frequency: "daily" | "weekly"; count: number; timezone: string }
    | undefined,
  workingDays: number[],
) {
  if (!recurrence) return [{ start, end }];
  const first = Temporal.Instant.fromEpochMilliseconds(
      start,
    ).toZonedDateTimeISO(recurrence.timezone),
    duration = end - start;
  const result = [{ start, end }];
  let date = first.toPlainDate();
  for (let i = 0; i < 200 && result.length < recurrence.count; i++) {
    date = date.add({ days: recurrence.frequency === "weekly" ? 7 : 1 });
    if (
      recurrence.frequency === "daily" &&
      !workingDays.includes(date.dayOfWeek)
    )
      continue;
    const local = date.toPlainDateTime(first.toPlainTime());
    try {
      const at = Number(
        local.toZonedDateTime(recurrence.timezone, { disambiguation: "reject" })
          .epochMilliseconds,
      );
      result.push({ start: at, end: at + duration });
    } catch {
      fail(
        "LOCAL_TIME",
        "A recurring session falls in an ambiguous or skipped daylight-saving time. Choose another time.",
      );
    }
  }
  if (result.length !== recurrence.count)
    fail("RECURRENCE", "Choose at least one working day for daily recurrence.");
  return result;
}

/** One exact wall-time transform is shared by refresh bounds and the committing reducer. */
export function shiftedCalendarSessions(
  state: State,
  session: CalendarSession,
  start: number,
  end: number,
  scope: "occurrence" | "following" | "series" | undefined,
  now: number,
) {
  const targets =
    session.seriesId && scope && scope !== "occurrence"
      ? calendarSessions(state).filter(
          (row) =>
            row.seriesId === session.seriesId &&
            row.start >= now &&
            (scope === "series" || row.originalStart >= session.originalStart),
        )
      : [session];
  const from = Temporal.Instant.fromEpochMilliseconds(session.start)
      .toZonedDateTimeISO(session.timezone)
      .toPlainDateTime(),
    to = Temporal.Instant.fromEpochMilliseconds(start)
      .toZonedDateTimeISO(session.timezone)
      .toPlainDateTime(),
    delta = from.until(to, { largestUnit: "days" });
  return targets.map((target) => {
    let next: number;
    try {
      next =
        target.id === session.id
          ? start
          : Number(
              Temporal.Instant.fromEpochMilliseconds(target.start)
                .toZonedDateTimeISO(target.timezone)
                .toPlainDateTime()
                .add(delta)
                .toZonedDateTime(target.timezone, { disambiguation: "reject" })
                .epochMilliseconds,
            );
    } catch {
      fail(
        "LOCAL_TIME",
        "A changed session falls in a skipped or ambiguous daylight-saving hour.",
      );
    }
    return { session: target, start: next, end: next + end - start };
  });
}

/** Published external events stay read-only even after changing the publishing destination. */
export function calendarSessionIsNative(state: State, id: string) {
  const direct = state.calendarSessions?.find((row) => row.id === id);
  if (direct && direct.origin !== "plan") return true;
  for (const proposal of state.proposals) {
    const original = proposal.alternatives[proposal.selected]?.sessions.find(
      (row) => row.id === id,
    );
    if (original) {
      const destination =
        proposal.inputs?.calendarDestinations?.[original.assigneeId];
      return !original.eventId && (!destination || destination === "kazi");
    }
  }
  for (const version of state.versions) {
    const original = version.sessions.find((row) => row.id === id);
    if (original) {
      const destination =
        version.inputs?.calendarDestinations?.[original.assigneeId];
      return !original.eventId && (!destination || destination === "kazi");
    }
  }
  return false;
}
