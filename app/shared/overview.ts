import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "./workflow";
import { Temporal } from "@js-temporal/polyfill";
import type { State, Task } from "./model";
import { addDays, dateInZone } from "./scheduler";
export interface OverviewEvent {
  id: string;
  title: string;
  kind: "deadline" | "scheduled" | "proposed" | "pending" | "busy";
  date: string;
  start?: number;
  end?: number;
  taskId?: string;
  proposalId?: string;
  projectId?: string;
  ownerId?: string;
}
export function dayBounds(day: string, zone: string) {
  const date = Temporal.PlainDate.from(day);
  return {
    start: Number(date.toZonedDateTime(zone).epochMilliseconds),
    end: Number(date.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds),
  };
}
export function taskDate(task: Task, zone: string) {
  return task.deadline
    ? /^\d{4}-\d{2}-\d{2}$/.test(task.deadline)
      ? task.deadline
      : dateInZone(Date.parse(task.deadline), zone)
    : undefined;
}
// A due date is not a time reservation. Only confirmed sessions and real busy intervals count as occupied time.
export function occupiedMinutes(
  events: OverviewEvent[],
  kind: "busy" | "scheduled",
) {
  const byOwner = new Map<string, { start: number; end: number }[]>();
  for (const e of events.filter(
    (e) => e.kind === kind && e.start !== undefined && e.end !== undefined,
  )) {
    const key = e.ownerId ?? "default";
    byOwner.set(key, [
      ...(byOwner.get(key) ?? []),
      { start: e.start!, end: e.end! },
    ]);
  }
  let minutes = 0;
  for (const spans of byOwner.values()) {
    let end = -Infinity;
    for (const s of spans.sort((a, b) => a.start - b.start)) {
      minutes += Math.max(0, s.end - Math.max(end, s.start)) / 60000;
      end = Math.max(end, s.end);
    }
  }
  return Math.round(minutes);
}
export function overviewEvents(
  state: State,
  options: {
    actorId: string;
    assigneeId: string;
    projectId: string;
    zone: string;
    from: string;
    to: string;
    showProposed: boolean;
  },
): OverviewEvent[] {
  const { actorId, assigneeId, projectId, zone, from, to, showProposed } =
    options;
  const projects = new Set(
    state.projects
      .filter((p) => !p.archived && (projectId === "all" || p.id === projectId))
      .map((p) => p.id),
  );
  const tasks = state.tasks.filter(
    (t) =>
      projects.has(t.projectId) &&
      (assigneeId === "all" || t.assigneeId === assigneeId),
  );
  const tasksById = new Map(
    state.tasks.filter((t) => projects.has(t.projectId)).map((t) => [t.id, t]),
  );
  const events: OverviewEvent[] = [];
  for (const task of tasks) {
    const date = taskDate(task, zone);
    if (date && date >= from && date <= to && isOpenTask(task))
      events.push({
        id: "due:" + task.id,
        title: task.title,
        kind: "deadline",
        date,
        taskId: task.id,
        projectId: task.projectId,
      });
  }
  const span = (
    base: Omit<OverviewEvent, "date">,
    start: number,
    end: number,
  ) => {
    if (end <= start) return;
    const first = dateInZone(start, zone),
      last = dateInZone(end - 1, zone);
    for (
      let day = first < from ? from : first;
      day <= last && day <= to;
      day = addDays(day, 1)
    ) {
      const bounds = dayBounds(day, zone);
      events.push({
        ...base,
        id: base.id + ":" + day,
        date: day,
        start: Math.max(start, bounds.start),
        end: Math.min(end, bounds.end),
      });
    }
  };
  const seen = new Set<string>();
  for (const proposal of state.proposals) {
    const draft = proposal.status === "awaiting_review";
    if (
      !["applied", "partial", "applying"].includes(proposal.status) &&
      !(showProposed && draft)
    )
      continue;
    for (const session of proposal.alternatives[proposal.selected].sessions) {
      const task = tasksById.get(session.taskId);
      if (
        !task ||
        (assigneeId !== "all" && session.assigneeId !== assigneeId) ||
        ["released", "failed"].includes(session.status) ||
        (!showProposed && session.status === "proposed")
      )
        continue;
      const key = session.eventId ?? session.id;
      if (seen.has(key)) continue;
      seen.add(key);
      span(
        {
          id: "session:" + key,
          title: task.title,
          kind:
            session.status === "scheduled"
              ? "scheduled"
              : session.status === "proposed"
                ? "proposed"
                : "pending",
          taskId: task.id,
          proposalId: proposal.id,
          projectId: task.projectId,
          ownerId: session.assigneeId,
        },
        session.start,
        session.end,
      );
    }
  }
  // Older accepted plans may have only a preserved snapshot. A current receipt always takes precedence.
  const represented = new Set(state.proposals.map((p) => p.id));
  for (const version of state.versions.filter(
    (v) => !represented.has(v.proposalId),
  )) {
    for (const session of version.sessions) {
      const task = tasksById.get(session.taskId),
        key = session.eventId ?? session.id;
      if (
        !task ||
        (assigneeId !== "all" && session.assigneeId !== assigneeId) ||
        session.status !== "scheduled" ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      span(
        {
          id: "session:" + key,
          title: task.title,
          kind: "scheduled",
          taskId: task.id,
          projectId: task.projectId,
          ownerId: session.assigneeId,
        },
        session.start,
        session.end,
      );
    }
  }
  state.busy
    .filter((b) => b.ownerId === actorId)
    .forEach((b, index) =>
      span(
        {
          id: "busy:" + index + ":" + b.start,
          title: "Private calendar event",
          kind: "busy",
        },
        b.start,
        b.end,
      ),
    );
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start ?? Infinity) - (b.start ?? Infinity) ||
      a.title.localeCompare(b.title),
  );
}
