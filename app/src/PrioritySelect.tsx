import { useState } from "react";
import type { Task } from "../shared/model";
export function PrioritySelect({
  defaultValue = "medium",
}: {
  defaultValue?: Task["priority"];
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <select
      name="priority"
      aria-label="Priority"
      className={"priority-select " + value}
      value={value}
      onChange={(e) => setValue(e.target.value as Task["priority"])}
    >
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  );
}
