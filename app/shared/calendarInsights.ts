import type { State } from "./model";
import { overviewEvents } from "./overview";
import { addDays } from "./scheduler";
import { reportBounds, type ReportFilter } from "./reports";
import { isSchedulableTask } from "./workflow";
import { normalizeTaskLabels, taskLabelKey } from "./taskLabels";

export interface CalendarAllocation {
  id: string;
  name: string;
  color?: string;
  minutes: number;
  percent: number;
}

/** Current, authorized calendar reservations in a period, never hours worked. */
export function buildCalendarInsights(state: State, filter: ReportFilter) {
  const bounds = reportBounds(filter.from, filter.to, filter.zone);
  const projects = new Map(
    state.projects
      .filter((project) => !project.archived)
      .map((project) => [project.id, project]),
  );
  const tasks = new Map(
    state.tasks
      .filter(
        (task) =>
          projects.has(task.projectId) &&
          (filter.project === "all" || task.projectId === filter.project),
      )
      .map((task) => [task.id, task]),
  );
  const scheduled = overviewEvents(state, {
    actorId: filter.actorId,
    assigneeId: filter.person,
    projectId: filter.project,
    zone: filter.zone,
    from: filter.from,
    to: filter.to,
    showProposed: false,
  }).filter(
    (event) =>
      event.kind === "scheduled" &&
      !!event.taskId &&
      tasks.has(event.taskId) &&
      Number.isFinite(event.start) &&
      Number.isFinite(event.end) &&
      event.end! > event.start!,
  );
  const projectMinutes = new Map<string, number>();
  const tagMinutes = new Map<string, number>();
  const tagNames = new Map<string, string>();
  const daily = new Map<string, { minutes: number; sessions: Set<string> }>();
  const reservationMinutes = new Map<string, number>();
  const byOwner = new Map<string, typeof scheduled>();
  const reservationId = (event: (typeof scheduled)[number]) =>
    event.sessionId ?? event.id.replace(/:\d{4}-\d{2}-\d{2}$/, "");
  for (const event of scheduled) {
    const id = reservationId(event);
    reservationMinutes.set(
      id,
      (reservationMinutes.get(id) ?? 0) + (event.end! - event.start!) / 60000,
    );
    const day = daily.get(event.date) ?? { minutes: 0, sessions: new Set() };
    day.sessions.add(id);
    daily.set(event.date, day);
    const owner = event.ownerId ?? tasks.get(event.taskId!)!.assigneeId ?? "";
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), event]);
  }
  let reservedMinutes = 0;
  let overlapMinutes = 0;
  // Partition each person's timeline. Overlaps count once and are shared across
  // their active tasks, so allocation shares never claim more than the calendar.
  for (const events of byOwner.values()) {
    const edges = new Map<
      number,
      { opening: typeof scheduled; closing: typeof scheduled }
    >();
    for (const event of events) {
      const start = Math.max(bounds.from, event.start!);
      const end = Math.min(bounds.to, event.end!);
      if (end <= start) continue;
      const opening = edges.get(start) ?? { opening: [], closing: [] };
      opening.opening.push(event);
      edges.set(start, opening);
      const closing = edges.get(end) ?? { opening: [], closing: [] };
      closing.closing.push(event);
      edges.set(end, closing);
    }
    const active = new Map<string, (typeof scheduled)[number]>();
    let prior: number | undefined;
    for (const [at, edge] of [...edges].sort(([a], [b]) => a - b)) {
      if (prior !== undefined && at > prior && active.size) {
        const minutes = (at - prior) / 60000;
        reservedMinutes += minutes;
        if (active.size > 1) overlapMinutes += minutes;
        const activeTasks = [
          ...new Set([...active.values()].map((event) => event.taskId!)),
        ];
        for (const id of activeTasks) {
          const task = tasks.get(id)!;
          const share = minutes / activeTasks.length;
          projectMinutes.set(
            task.projectId,
            (projectMinutes.get(task.projectId) ?? 0) + share,
          );
          const labels = normalizeTaskLabels(task.labels);
          if (!labels.length)
            tagMinutes.set(
              "untagged",
              (tagMinutes.get("untagged") ?? 0) + share,
            );
          else
            for (const label of labels) {
              const key = "tag:" + taskLabelKey(label);
              tagNames.set(key, tagNames.get(key) ?? label);
              tagMinutes.set(
                key,
                (tagMinutes.get(key) ?? 0) + share / labels.length,
              );
            }
        }
        // overviewEvents splits sessions at local midnight; every active span
        // here belongs to the same day, including both sides of DST changes.
        const date = active.values().next().value!.date;
        daily.get(date)!.minutes += minutes;
      }
      for (const event of edge.closing) active.delete(event.id);
      for (const event of edge.opening) active.set(event.id, event);
      prior = at;
    }
  }
  const allocation = (
    minutes: Map<string, number>,
    name: (id: string) => string,
    color?: (id: string) => string | undefined,
  ): CalendarAllocation[] =>
    [...minutes]
      .map(([id, value]) => ({
        id,
        name: name(id),
        ...(color ? { color: color(id) } : {}),
        minutes: Math.round(value * 100) / 100,
        percent: reservedMinutes
          ? Math.round((value / reservedMinutes) * 100)
          : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  const parents = new Set(
    state.tasks.flatMap((task) => (task.parentId ? [task.parentId] : [])),
  );
  const ready = [...tasks.values()].filter(
    (task) =>
      isSchedulableTask(task) &&
      task.createdAt < bounds.to &&
      task.createdAt <= filter.now &&
      !parents.has(task.id) &&
      (filter.person === "all" || task.assigneeId === filter.person),
  );
  const reservedTaskIds = new Set(scheduled.map((event) => event.taskId!));
  const unscheduled = ready
    .filter((task) => !reservedTaskIds.has(task.id))
    .sort(
      (a, b) =>
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.title.localeCompare(b.title),
    );
  const changes = (state.calendarSessions ?? []).flatMap((session) =>
    tasks.has(session.taskId) &&
    (filter.person === "all" || session.assigneeId === filter.person)
      ? (session.history ?? []).filter(
          (entry) =>
            entry.at >= bounds.from &&
            entry.at < bounds.to &&
            entry.at <= filter.now,
        )
      : [],
  );
  const days: { date: string; minutes: number; reservations: number }[] = [];
  for (let date = filter.from; date <= filter.to; date = addDays(date, 1)) {
    const day = daily.get(date);
    days.push({
      date,
      minutes: Math.round((day?.minutes ?? 0) * 100) / 100,
      reservations: day?.sessions.size ?? 0,
    });
  }
  return {
    from: filter.from,
    to: filter.to,
    zone: filter.zone,
    reservedMinutes: Math.round(reservedMinutes * 100) / 100,
    overlapMinutes: Math.round(overlapMinutes * 100) / 100,
    reservations: reservationMinutes.size,
    shortReservations: [...reservationMinutes.values()].filter(
      (value) => value < 30,
    ).length,
    longestReservationMinutes: Math.max(0, ...reservationMinutes.values()),
    coverage: {
      eligible: ready.length,
      scheduled: ready.length - unscheduled.length,
      unscheduled: unscheduled.length,
      percent: ready.length
        ? Math.round(((ready.length - unscheduled.length) / ready.length) * 100)
        : null,
    },
    byProject: allocation(
      projectMinutes,
      (id) => projects.get(id)!.title,
      (id) => projects.get(id)?.color,
    ),
    byTag: allocation(tagMinutes, (id) =>
      id === "untagged" ? "Untagged" : tagNames.get(id)!,
    ),
    daily: days,
    recordedReschedules: changes.filter(
      (entry) => entry.action === "rescheduled",
    ).length,
    recordedCancellations: changes.filter(
      (entry) => entry.action === "released",
    ).length,
    unscheduledTaskIds: unscheduled.map((task) => task.id),
  };
}
export type CalendarInsightsReport = ReturnType<typeof buildCalendarInsights>;
