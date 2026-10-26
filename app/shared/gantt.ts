import type { Task } from "./model";
import { taskDate } from "./overview";

export interface GanttRow {
  task: Task;
  start: string;
  end: string;
  kind: "bar" | "deadline" | "milestone";
  dependencies: { task: Task; conflict: boolean }[];
  conflict: boolean;
}

/** Show explicit dates only. A deadline never implies a planned start. */
export function ganttRows(
  tasks: Task[],
  allTasks: Task[],
  zoneFor: (task: Task) => string,
): GanttRow[] {
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  return tasks
    .filter((task) => task.startDate || task.deadline)
    .map((task): GanttRow => {
      const end = taskDate(task, zoneFor(task)) ?? task.startDate!;
      const kind = task.milestone
        ? "milestone"
        : task.startDate
          ? "bar"
          : "deadline";
      // Milestones belong on their due date, even when they also have a start.
      const start = kind === "bar" ? task.startDate! : end;
      const dependencies = task.dependencies.flatMap((id) => {
        const dependency = byId.get(id);
        if (!dependency) return [];
        const due = taskDate(dependency, zoneFor(dependency));
        return [
          {
            task: dependency,
            conflict: Boolean(
              task.status !== "done" &&
              task.startDate &&
              dependency.status !== "done" &&
              due &&
              due > task.startDate,
            ),
          },
        ];
      });
      return {
        task,
        start,
        end,
        kind,
        dependencies,
        conflict: dependencies.some((dependency) => dependency.conflict),
      };
    })
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        a.task.title.localeCompare(b.task.title),
    );
}
