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
  const durations = new Map<string, number[]>(),
    entry = new Map<string, { status: string; at: number }>();
  for (const event of facts
    .filter((event) => event.entityType === "task" && event.toStatus)
    .sort((a, b) => a.at - b.at || (a.revision ?? 0) - (b.revision ?? 0))) {
    const prior = entry.get(event.entityId);
    if (
      prior &&
      prior.status === event.fromStatus &&
      event.at >= bounds.from &&
      event.at < bounds.to &&
      matches(event)
    )
      durations.set(prior.status, [
        ...(durations.get(prior.status) ?? []),
        Math.max(0, (event.at - prior.at) / 86400000),
      ]);
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
      ? [{ task, days: age, threshold: limit }]
      : [];
  });
  return {
    stages: taskWorkflow.map((status) => {
      const closed = durations.get(status) ?? [];
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
        exits: closed.length,
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
      "Durations use recorded transitions only. Existing stages without a known entry are excluded from completed-stage averages; current age uses the saved stage timestamp.",
  };
}
