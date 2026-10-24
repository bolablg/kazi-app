import { resourceRole } from "./teams";
import type { Task, State } from "./model";
import { DEFAULT_PROJECT_NAME } from "./model";

export const isArchivedTask = (task: Pick<Task, "status">) =>
  ["archived", "blocked", "rejected", "canceled"].includes(task.status);
export const isOpenTask = (task: Pick<Task, "status">) =>
  task.status !== "done" && !isArchivedTask(task);
export const isSchedulableTask = (task: Pick<Task, "status">) =>
  ["todo", "in_progress"].includes(task.status);
export const isCommittedTask = (task: Pick<Task, "status">) =>
  isSchedulableTask(task) || task.status === "to_validate";
export function canEditTask(state: State, task: Task, actorId: string) {
  return (
    task.assigneeId === actorId ||
    task.ownerId === actorId ||
    ["owner", "admin"].includes(resourceRole(state, task.id, actorId) ?? "") ||
    state.projects.some(
      (project) => project.id === task.projectId && project.ownerId === actorId,
    )
  );
}
export function upgradeDefaultProject(state: State) {
  const project = state.projects.find(
    (project) => project.id === state.workspace.inboxId,
  );
  if (project && ["Inbox", "Team Inbox"].includes(project.title)) {
    project.title = DEFAULT_PROJECT_NAME;
    project.description =
      "Tasks outside a named project. Visibility follows project access.";
    project.icon = "calendar";
  }
  state.tasks.forEach((task) => {
    if (task.status === "idea") task.status = "backlog";
    else if (["blocked", "rejected", "canceled"].includes(task.status))
      task.status = "archived";
  });
  return state;
}
