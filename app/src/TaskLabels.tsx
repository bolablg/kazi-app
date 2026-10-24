import { useId, useState } from "react";
import {
  normalizeTaskLabels,
  parseTaskLabels,
  taskLabelKey,
} from "../shared/taskLabels";

const palette = [
  "#d2e3fc",
  "#e7d7fa",
  "#ceead6",
  "#fdd9b5",
  "#e2e5e9",
  "#feefc3",
  "#f9d2e6",
  "#c7ece8",
];
const categories: Record<string, number> = {
  research: 0,
  design: 1,
  development: 2,
  meeting: 3,
  admin: 4,
  writing: 5,
  marketing: 6,
  review: 7,
};
function color(label: string) {
  const key = taskLabelKey(label);
  let hash = 2166136261;
  for (const character of key)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return palette[categories[key] ?? (hash >>> 0) % palette.length];
}

export function TaskLabels({
  labels,
  limit = 3,
}: {
  labels: string[];
  limit?: number;
}) {
  const unique = normalizeTaskLabels(labels);
  if (!unique.length) return null;
  return (
    <span className="task-labels" role="group" aria-label="Task categories">
      {unique.slice(0, limit).map((label) => (
        <span
          className="task-label"
          data-label-key={taskLabelKey(label)}
          key={taskLabelKey(label)}
          style={{ backgroundColor: color(label) }}
          title={label}
        >
          {label}
        </span>
      ))}
      {unique.length > limit && (
        <span
          className="task-label task-label-more"
          title={unique.slice(limit).join(", ")}
        >
          +{unique.length - limit}
        </span>
      )}
    </span>
  );
}

export function TaskLabelField({
  defaultValue = [],
}: {
  defaultValue?: string[];
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue.join(", "));
  const labels = parseTaskLabels(value);
  return (
    <div className="task-label-field">
      <label htmlFor={id}>
        Labels <span className="optional">optional</span>
      </label>
      <input
        id={id}
        name="labels"
        aria-label="Task labels"
        aria-describedby={id + "-help"}
        value={value}
        maxLength={3800}
        placeholder="Research, Design, Development, Admin"
        onChange={(event) => {
          setValue(event.target.value);
          const next = parseTaskLabels(event.target.value);
          event.target.setCustomValidity(
            next.length > 20
              ? "Use up to 20 labels."
              : next.some((label) => label.length > 180)
                ? "Each label can have up to 180 characters."
                : "",
          );
        }}
      />
      <TaskLabels labels={labels} limit={20} />
      <small id={id + "-help"}>
        Separate labels with commas. Each label has the same color across tasks.
      </small>
    </div>
  );
}
