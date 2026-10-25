import type { State, Task } from "./model";
import { dateInZone, deadlineAt } from "./scheduler";
import { taskDate } from "./overview";
import { isCommittedTask, isSchedulableTask } from "./workflow";

/** A bounded read model over the caller's already-authorized, selected team data. */
export function buildTodayOverview(
  state: State,
  options: {
    actorId: string;
    now: number;
    person?: string;
    project?: string;
  },
) {
  const { actorId, now } = options;
  const me = state.members.find((member) => member.id === actorId);
  if (!me) throw new Error("Your account is unavailable.");
  const zone = me.preferences.timezone;
  const today = dateInZone(now, zone);
  const person = options.person ?? actorId;
  const project = options.project ?? "all";
  const projects = state.projects.filter(
    (item) => !item.archived && (project === "all" || item.id === project),
  );
  const projectIds = new Set(projects.map((item) => item.id));
  const projectById = new Map(projects.map((item) => [item.id, item]));
  const tasks = state.tasks.filter((task) => projectIds.has(task.projectId));
  const allTaskById = new Map(state.tasks.map((task) => [task.id, task]));
  const ownerOf = (task: Task) =>
    task.ownerId ?? projectById.get(task.projectId)?.ownerId;
  const dueAt = (task: Task) =>
    state.taskDueAt?.[task.id] ??
    deadlineAt(
      task.deadline,
      state.members.find((member) => member.id === task.assigneeId)?.preferences
        .timezone ?? zone,
    );
  const priority = { high: 0, medium: 1, low: 2 };
  const byDue = (a: Task, b: Task) =>
    dueAt(a) - dueAt(b) ||
    priority[a.priority] - priority[b.priority] ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);
  const assigned = tasks.filter(
    (task) => person === "all" || task.assigneeId === person,
  );
  const committed = assigned.filter(isCommittedTask);
  const overdue = committed.filter((task) => dueAt(task) < now).sort(byDue);
  const dueToday = committed
    .filter((task) => taskDate(task, zone) === today && dueAt(task) >= now)
    .sort(byDue);
  // Reviews belong to the owner, even when someone else is doing the work.
  const toValidate = tasks
    .filter(
      (task) =>
        task.status === "to_validate" &&
        ownerOf(task) === actorId &&
        (person === actorId || person === "all" || task.assigneeId === person),
    )
    .sort(byDue);
  const attention = [
    ...new Map(
      [...toValidate, ...overdue, ...dueToday].map((task) => [task.id, task]),
    ).values(),
  ];
  const focus = assigned
    .filter(
      (task) =>
        isSchedulableTask(task) &&
        (task.status === "in_progress" ||
          ((!task.startDate || task.startDate <= today) &&
            task.dependencies.every(
              (id) => allTaskById.get(id)?.status === "done",
            ))),
    )
    .sort(
      (a, b) =>
        Number(b.status === "in_progress") -
          Number(a.status === "in_progress") || byDue(a, b),
    );
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const activity = state.activities
    .filter((event) => {
      const task = event.taskId && taskById.get(event.taskId);
      return (
        task &&
        event.at <= now &&
        (person === "all" ||
          task.assigneeId === person ||
          (person === actorId &&
            (ownerOf(task) === actorId ||
              task.collaborators.includes(actorId) ||
              event.actorId === actorId)))
      );
    })
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((event) => ({ event, task: taskById.get(event.taskId!)! }));
  const updated = new Map(
    projects.map((item) => [item.id, item.updatedAt ?? item.createdAt ?? 0]),
  );
  for (const task of tasks)
    updated.set(
      task.projectId,
      Math.max(updated.get(task.projectId) ?? 0, task.updatedAt),
    );
  for (const event of state.activities) {
    const projectId = event.taskId
      ? taskById.get(event.taskId)?.projectId
      : event.projectId;
    if (projectId && projectIds.has(projectId) && event.at <= now)
      updated.set(projectId, Math.max(updated.get(projectId) ?? 0, event.at));
  }
  const defaults = new Set([
    state.workspace.inboxId,
    ...(state.teams ?? []).map((team) => team.inboxId),
  ]);
  const recent = projects
    .filter((item) => !defaults.has(item.id))
    .sort(
      (a, b) =>
        (updated.get(b.id) ?? 0) - (updated.get(a.id) ?? 0) ||
        a.title.localeCompare(b.title),
    );
  const favorites = projects.filter((item) =>
    me.favoriteProjectIds?.includes(item.id),
  );
  return {
    date: today,
    timezone: zone,
    counts: {
      attention: attention.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      toValidate: toValidate.length,
      focus: focus.length,
      favorites: favorites.length,
      recent: recent.length,
    },
    attention: {
      all: attention.slice(0, 6),
      overdue: overdue.slice(0, 6),
      dueToday: dueToday.slice(0, 6),
      toValidate: toValidate.slice(0, 6),
    },
    focus: focus.slice(0, 5),
    projects: {
      favorites: favorites.slice(0, 4),
      recent: recent.slice(0, 4),
      updatedAt: Object.fromEntries(updated),
    },
    activity,
  };
}
