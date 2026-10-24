import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "./workflow";
import type { ReportEvent, State } from "./model";
import { Temporal } from "@js-temporal/polyfill";
import { addDays, dateInZone, deadlineAt } from "./scheduler";
import { dayBounds, occupiedMinutes, overviewEvents } from "./overview";

export interface ReportFilter {
  from: string;
  to: string;
  zone: string;
  actorId: string;
  person: string;
  project: string;
  now: number;
}
export function reportBounds(from: string, to: string, zone: string) {
  const days = Temporal.PlainDate.from(from).until(
    Temporal.PlainDate.from(to),
  ).days;
  if (days < 0 || days > 365) throw new Error("Choose up to 366 days.");
  return { from: dayBounds(from, zone).start, to: dayBounds(to, zone).end };
}
export function buildReport(
  state: State,
  history: ReportEvent[],
  f: ReportFilter,
) {
  const bounds = reportBounds(f.from, f.to, f.zone);
  const projectIds = new Set(state.projects.map((p) => p.id));
  const taskIds = new Set(state.tasks.map((t) => t.id));
  const events = [...new Map(history.map((e) => [e.id, e])).values()].filter(
    (e) =>
      e.at >= bounds.from &&
      e.at < bounds.to &&
      e.at <= f.now &&
      taskIds.has(e.taskId) &&
      projectIds.has(e.projectId) &&
      (f.project === "all" || e.projectId === f.project) &&
      (f.person === "all" ||
        (e.type === "time_logged" ? e.actorId : e.assigneeId) === f.person),
  );
  const logs = events.filter((e) => e.type === "time_logged");
  // Reopening and finishing again is one completed task per period. Keep the
  // latest finish and the deadline captured at that finish, never today's edits.
  const completed = [
    ...new Map(
      events
        .filter((e) => e.type === "completed" && e.leaf)
        .sort((a, b) => a.at - b.at)
        .map((e) => [e.taskId, e]),
    ).values(),
  ];
  const withDeadline = completed.filter((e) => e.dueAt !== undefined);
  const late = withDeadline
    .filter((e) => e.at > e.dueAt!)
    .sort((a, b) => b.at - a.at);
  const onTime = withDeadline.length - late.length;
  const open = state.tasks.filter(
    (t) =>
      isOpenTask(t) &&
      !state.tasks.some((child) => child.parentId === t.id) &&
      (f.person === "all" || t.assigneeId === f.person) &&
      (f.project === "all" || t.projectId === f.project),
  );
  const overdue = open
    .filter(
      (t) =>
        isCommittedTask(t) &&
        (state.taskDueAt?.[t.id] ??
          deadlineAt(
            t.deadline,
            state.members.find((m) => m.id === t.assigneeId)?.preferences
              .timezone ?? f.zone,
          )) < f.now,
    )
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const scheduled = overviewEvents(state, {
    actorId: f.actorId,
    assigneeId: f.person,
    projectId: f.project,
    zone: f.zone,
    from: f.from,
    to: f.to,
    showProposed: false,
  }).filter((e) => e.kind === "scheduled");
  const minutesByProject = new Map<string, number>();
  const completionsByProject = new Map<string, number>();
  const daily = new Map<string, { minutes: number; completed: number }>();
  const dayTotal = (at: number) => {
    const date = dateInZone(at, f.zone);
    if (!daily.has(date)) daily.set(date, { minutes: 0, completed: 0 });
    return daily.get(date)!;
  };
  for (const e of logs) {
    minutesByProject.set(
      e.projectId,
      (minutesByProject.get(e.projectId) ?? 0) + e.minutes,
    );
    dayTotal(e.at).minutes += e.minutes;
  }
  for (const e of completed) {
    completionsByProject.set(
      e.projectId,
      (completionsByProject.get(e.projectId) ?? 0) + 1,
    );
    dayTotal(e.at).completed++;
  }
  const projects = state.projects
    .filter((p) => f.project === "all" || p.id === f.project)
    .map((project) => ({
      project,
      minutes: minutesByProject.get(project.id) ?? 0,
      scheduled: occupiedMinutes(
        scheduled.filter((e) => e.projectId === project.id),
        "scheduled",
      ),
      completed: completionsByProject.get(project.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.minutes - a.minutes || a.project.title.localeCompare(b.project.title),
    );
  const scopedTasks = state.tasks.filter(
    (t) =>
      !state.tasks.some((child) => child.parentId === t.id) &&
      (f.project === "all" || t.projectId === f.project) &&
      (f.person === "all" || t.assigneeId === f.person),
  );
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b),
      middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const leadTimes = completed
    .filter((e) => e.taskCreatedAt !== undefined && e.at >= e.taskCreatedAt)
    .map((e) => (e.at - e.taskCreatedAt!) / 60000);
  const cycleTimes = completed
    .filter((e) => e.startedAt !== undefined && e.at >= e.startedAt)
    .map((e) => (e.at - e.startedAt!) / 60000);
  const goals = state.projects
    .filter((p) => !p.archived && (f.project === "all" || p.id === f.project))
    .map((project) => {
      const tasks = scopedTasks.filter(
        (t) => t.projectId === project.id && !isArchivedTask(t),
      );
      const done = tasks.filter((t) => t.status === "done").length;
      return {
        project,
        total: tasks.length,
        done,
        percent: tasks.length ? Math.round((done / tasks.length) * 100) : null,
        milestones: state.tasks.filter(
          (t) =>
            t.projectId === project.id &&
            t.milestone &&
            !isArchivedTask(t) &&
            (f.person === "all" || t.assigneeId === f.person),
        ),
        overdue: overdue.filter((t) => t.projectId === project.id).length,
      };
    })
    .filter((g) => g.total > 0 || g.milestones.length > 0);
  const createdByDay = new Map<string, number>();
  for (const task of scopedTasks.filter((t) => t.createdAt <= f.now)) {
    const day = dateInZone(task.createdAt, f.zone);
    createdByDay.set(day, (createdByDay.get(day) ?? 0) + 1);
  }
  const days: {
    date: string;
    minutes: number;
    completed: number;
    scheduled: number;
    created: number;
  }[] = [];
  for (
    let date = f.from;
    date <= f.to && days.length < 366;
    date = addDays(date, 1)
  ) {
    days.push({
      date,
      ...(daily.get(date) ?? { minutes: 0, completed: 0 }),
      scheduled: occupiedMinutes(
        scheduled.filter((e) => e.date === date),
        "scheduled",
      ),
      created: createdByDay.get(date) ?? 0,
    });
  }
  return {
    scopedTasks,
    goals,
    leadTimes,
    cycleTimes,
    medianLeadMinutes: median(leadTimes),
    medianCycleMinutes: median(cycleTimes),
    inProgress: open.filter((t) => t.status === "in_progress"),
    blocked: [],
    archived: scopedTasks.filter(isArchivedTask),
    validationPending: open.filter((t) => t.status === "to_validate"),
    backlog: open.filter((t) => ["idea", "backlog"].includes(t.status)),
    created: scopedTasks.filter(
      (t) =>
        t.createdAt >= bounds.from &&
        t.createdAt < bounds.to &&
        t.createdAt <= f.now,
    ),
    missingEstimates: open.filter(
      (t) =>
        t.remainingMinutes === undefined && t.estimatedMinutes === undefined,
    ),
    noDeadline: open.filter((t) => !t.deadline),
    logs,
    completed,
    late,
    onTime,
    withDeadline,
    overdue,
    open,
    projects,
    days,
    loggedMinutes: logs.reduce((n, e) => n + e.minutes, 0),
    scheduledMinutes: occupiedMinutes(scheduled, "scheduled"),
    onTimeRate: withDeadline.length
      ? Math.round((onTime / withDeadline.length) * 100)
      : null,
    activeDays: days.filter((d) => d.minutes > 0).length,
  };
}
export type Report = ReturnType<typeof buildReport>;

export function previousReportFilter(f: ReportFilter): ReportFilter | null {
  const length =
    Temporal.PlainDate.from(f.from).until(Temporal.PlainDate.from(f.to)).days +
    1;
  return length <= 183
    ? { ...f, from: addDays(f.from, -length), to: addDays(f.from, -1) }
    : null;
}
export function reportHistoryBounds(f: ReportFilter) {
  return reportBounds(previousReportFilter(f)?.from ?? f.from, f.to, f.zone);
}

export function reportCsv(report: Report) {
  return [
    ["Date", "Created tasks", "Completed tasks", "Scheduled minutes"],
    ...report.days.map((d) => [d.date, d.created, d.completed, d.scheduled]),
  ]
    .map((row) => row.join(","))
    .join("\r\n");
}
