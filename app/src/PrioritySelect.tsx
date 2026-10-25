import { statusLabels, taskStatusOptions, type Task } from "../shared/model";
import { TaskChoice } from "./TaskChoice";

export const stageColors: Record<string, string> = {
  backlog: "var(--status-backlog)",
  todo: "var(--status-todo)",
  in_progress: "var(--status-progress)",
  to_validate: "var(--status-review)",
  done: "var(--status-done)",
  archived: "var(--status-archived)",
  idea: "var(--status-backlog)",
  blocked: "var(--status-archived)",
  rejected: "var(--status-archived)",
  canceled: "var(--status-archived)",
};
export function PrioritySelect({
  defaultValue = "medium",
}: {
  defaultValue?: Task["priority"];
}) {
  return (
    <TaskChoice
      name="priority"
      label="Priority"
      defaultValue={defaultValue}
      className="priority-choice"
      options={[
        { value: "high", label: "High", color: "#c9372c" },
        { value: "medium", label: "Medium", color: "#9c6f00" },
        { value: "low", label: "Low", color: "#1f845a" },
      ]}
    />
  );
}
export function StatusSelect({
  defaultValue,
}: {
  defaultValue: Task["status"];
}) {
  return (
    <TaskChoice
      name="status"
      label="Task status"
      defaultValue={
        defaultValue === "idea"
          ? "backlog"
          : ["blocked", "rejected", "canceled"].includes(defaultValue)
            ? "archived"
            : defaultValue
      }
      className="status-choice"
      options={taskStatusOptions.map((value) => ({
        value,
        label: statusLabels[value],
        color: stageColors[value],
      }))}
    />
  );
}
