import { statusLabels, taskStatusOptions, type Task } from "../shared/model";
import { TaskChoice } from "./TaskChoice";

export const stageColors: Record<string, string> = {
  backlog: "#7e8188",
  todo: "#526780",
  in_progress: "#0c66e4",
  to_validate: "#946600",
  done: "#1f845a",
  archived: "#76797f",
  idea: "#7e8188",
  blocked: "#76797f",
  rejected: "#76797f",
  canceled: "#76797f",
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
