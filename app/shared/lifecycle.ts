import {
  defaultAgingDays,
  taskWorkflow,
  type LifecycleEvent,
  type State,
} from "./model";
import { isArchivedTask } from "./workflow";
import type { ReportFilter } from "./reports";
import { reportBounds } from "./reports";
import { dateInZone } from "./scheduler";
import { reportingCalendar, workingClock } from "./workingTime";

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return !sorted.length
    ? null
    : sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
};
export function buildStageReport(
  state: State,
  history: LifecycleEvent[],
  filter: ReportFilter,
) {
  const bounds = reportBounds(filter.from, filter.to, filter.zone),
    known = new Map(state.tasks.map((task) => [task.id, task]));
  const facts = [
    ...new Map(history.map((event) => [event.id, event])).values(),
  ].filter((event) => event.at <= filter.now && known.has(event.entityId));
  const matches = (event: LifecycleEvent) =>
    (filter.project === "all" || event.projectId === filter.project) &&
    (filter.person === "all" || event.assigneeId === filter.person);
  const workingCalendar = reportingCalendar(state, filter.actorId);
  const workingMinutes = workingClock(workingCalendar);
  const durations = new Map<
      string,
      Map<string, { calendar: number; working: number; visits: number }>
    >(),
    entry = new Map<string, { status: string; at: number }>();
  for (const event of facts
    .filter((event) => event.entityType === "task" && event.toStatus)
    .sort((a, b) => a.at - b.at || (a.revision ?? 0) - (b.revision ?? 0))) {
    const prior = entry.get(event.entityId);
    if (
      prior &&
      prior.status !== "done" &&
      prior.status === event.fromStatus &&
      event.at >= bounds.from &&
      event.at < bounds.to &&
      matches(event)
    ) {
      const tasks =
        durations.get(prior.status) ??
        new Map<
          string,
          { calendar: number; working: number; visits: number }
        >();
      const total = tasks.get(event.entityId) ?? {
        calendar: 0,
        working: 0,
        visits: 0,
      };
      total.calendar += Math.max(0, (event.at - prior.at) / 60000);
      total.working += workingMinutes(prior.at, event.at);
      total.visits++;
      tasks.set(event.entityId, total);
      durations.set(prior.status, tasks);
    }
    entry.set(event.entityId, { status: event.toStatus!, at: event.at });
  }
  const current = state.tasks.filter(
    (task) =>
      !isArchivedTask(task) &&
      (filter.project === "all" || task.projectId === filter.project) &&
      (filter.person === "all" || task.assigneeId === filter.person),
  );
  const aged = current.flatMap((task) => {
    if (task.status === "done") return [];
    const team = state.resourceTeams?.[task.id];
    const members =
      (team ? state.teamMemberships?.[team] : state.members) ?? state.members;
    const owner = members.find(
      (member) => member.id === (task.ownerId ?? task.assigneeId),
    );
    const limits = { ...defaultAgingDays, ...owner?.preferences.agingDays };
    const limit = limits[task.status as keyof typeof limits];
    const age = Math.max(
      0,
      (filter.now -
        (entry.get(task.id)?.at ?? task.statusChangedAt ?? task.createdAt)) /
        86400000,
    );
    const reviewingLater =
      task.brainstorm &&
      task.reviewDate &&
      task.reviewDate > dateInZone(filter.now, filter.zone);
    return limit && age >= limit && !reviewingLater
      ? [
          {
            task,
            days: age,
            workingMinutes: workingMinutes(
              entry.get(task.id)?.at ?? task.statusChangedAt ?? task.createdAt,
              filter.now,
            ),
            threshold: limit,
          },
        ]
      : [];
  });
  return {
    workingCalendar,
    taskStageDurations: [...durations].flatMap(([status, tasks]) =>
      [...tasks].map(([taskId, duration]) => ({
        taskId,
        status,
        calendarMinutes: duration.calendar,
        workingMinutes: duration.working,
        visits: duration.visits,
      })),
    ),
    stages: taskWorkflow.map((status) => {
      const totals = [...(durations.get(status)?.values() ?? [])];
      const closed = totals.map((total) => total.calendar / 1440);
      const tasks = current.filter((task) => task.status === status);
      const ages = tasks.map((task) =>
        Math.max(
          0,
          (filter.now -
            (entry.get(task.id)?.at ??
              task.statusChangedAt ??
              task.createdAt)) /
            86400000,
        ),
      );
      return {
        status,
        count: tasks.length,
        exits: totals.reduce((sum, total) => sum + total.visits, 0),
        sampleTasks: totals.length,
        calendar: {
          totalMinutes: totals.reduce((sum, total) => sum + total.calendar, 0),
          meanMinutes: totals.length
            ? totals.reduce((sum, total) => sum + total.calendar, 0) /
              totals.length
            : null,
          medianMinutes: median(totals.map((total) => total.calendar)),
          medianCurrentAgeMinutes:
            status === "done" ? null : median(ages.map((age) => age * 1440)),
        },
        working: {
          totalMinutes: totals.reduce((sum, total) => sum + total.working, 0),
          meanMinutes: totals.length
            ? totals.reduce((sum, total) => sum + total.working, 0) /
              totals.length
            : null,
          medianMinutes: median(totals.map((total) => total.working)),
          medianCurrentAgeMinutes:
            status === "done"
              ? null
              : median(
                  tasks.map((task) =>
                    workingMinutes(
                      entry.get(task.id)?.at ??
                        task.statusChangedAt ??
                        task.createdAt,
                      filter.now,
                    ),
                  ),
                ),
        },
        meanDays: closed.length
          ? closed.reduce((a, b) => a + b, 0) / closed.length
          : null,
        medianDays: median(closed),
        medianCurrentAgeDays: status === "done" ? null : median(ages),
      };
    }),
    aged,
    brainstorm: current.filter((task) => task.brainstorm),
    events: facts.filter(matches).length,
    coverage:
      "Recorded stage visits are summed per task before calculating averages and medians. Only visits ending in the selected period contribute to completed durations. Current age is separate and uses the recorded entry or saved stage/creation timestamp. Unknown historical entries are excluded from completed durations. Working time intersects these intervals with the reporting calendar, not hours worked.",
  };
}
