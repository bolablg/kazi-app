import { Temporal } from "@js-temporal/polyfill";
import type {
  Sprint,
  SprintObjective,
  SprintTaskSnapshot,
  Task,
  Workspace,
} from "./model";
import { stableId } from "./ids";

export function automaticSprintName(
  workspace: Pick<Workspace, "kind" | "name">,
  startDate: string,
): string {
  const week = Temporal.PlainDate.from(startDate).weekOfYear;
  return `${workspace.kind === "personal" ? "Perso" : workspace.name.trim()} - Sprint - W${String(week).padStart(2, "0")}`;
}

/** Legacy sprints are projected as one objective without rewriting stored history. */
export function sprintObjectives(sprint: Sprint): SprintObjective[] {
  return (
    sprint.objectives ?? [
      {
        id: stableId("sprint-objective", sprint.id),
        title: sprint.objective,
        successCriteria: sprint.successCriteria,
        leadId: sprint.ownerId,
      },
    ]
  );
}
export function sprintAssignments(sprint: Sprint): Record<string, string> {
  if (sprint.objectives !== undefined) return sprint.objectiveAssignments ?? {};
  const id = sprintObjectives(sprint)[0].id;
  return Object.fromEntries(sprint.taskIds.map((taskId) => [taskId, id]));
}
export function sprintSummary(sprint: Sprint): string {
  return (
    sprint.focus ||
    sprintObjectives(sprint)
      .map((objective) => objective.title)
      .filter(Boolean)
      .join(" · ") ||
    "Add an objective before starting."
  );
}

export const isOpenSprint = (sprint: Sprint) =>
  sprint.status === "planned" || sprint.status === "active";

export function sprintDays(startDate: string, endDate: string): number {
  return (
    Temporal.PlainDate.from(startDate).until(Temporal.PlainDate.from(endDate))
      .days + 1
  );
}

export function sprintSnapshot(tasks: Task[]): SprintTaskSnapshot[] {
  return tasks.map(({ id, projectId, title, status }) => ({
    id,
    projectId,
    title,
    status,
  }));
}

export const sprintStatusLabels = {
  planned: "Planned",
  active: "Active",
  closed: "Closed",
  canceled: "Canceled",
};
export const sprintOutcomeLabels = {
  achieved: "Achieved",
  partial: "Partly achieved",
  missed: "Missed",
};
