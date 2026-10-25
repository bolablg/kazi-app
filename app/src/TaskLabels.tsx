import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
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
  const input = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState(normalizeTaskLabels(defaultValue));
  const [draft, setDraft] = useState("");
  const all = normalizeTaskLabels([...labels, ...parseTaskLabels(draft)]);
  const commit = (text: string) => {
    const next = normalizeTaskLabels([...labels, ...parseTaskLabels(text)]);
    if (next.length > 20 || next.some((label) => label.length > 180)) {
      input.current?.setCustomValidity(
        next.length > 20
          ? "Use up to 20 labels."
          : "Each label can have up to 180 characters.",
      );
      input.current?.reportValidity();
      return false;
    }
    input.current?.setCustomValidity("");
    setLabels(next);
    setDraft("");
    return true;
  };
  return (
    <div className="task-label-field">
      <label htmlFor={id}>
        Labels <span className="optional">optional</span>
      </label>
      <input type="hidden" name="labels" value={all.join(", ")} />
      <div className="label-token-input" onClick={() => input.current?.focus()}>
        {labels.map((label) => (
          <span
            className="label-token"
            key={taskLabelKey(label)}
            style={{ backgroundColor: color(label) }}
          >
            <span>{label}</span>
            <button
              type="button"
              aria-label={`Remove ${label} label`}
              onClick={(event) => {
                event.stopPropagation();
                setLabels(labels.filter((item) => item !== label));
                input.current?.setCustomValidity("");
              }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={input}
          aria-label="Task labels"
          aria-describedby={`${id}-help`}
          value={draft}
          maxLength={3800}
          placeholder={labels.length ? "Add another…" : "Add labels…"}
          onChange={(event) => {
            const text = event.target.value;
            event.target.setCustomValidity("");
            if (/[,\n]/.test(text)) {
              const parts = text.split(/[,\n]/);
              const remainder = parts.pop() ?? "";
              if (commit(parts.join(","))) setDraft(remainder);
            } else setDraft(text);
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Tab" && draft.trim()) commit(draft);
            else if (event.key === "Backspace" && !draft && labels.length)
              setLabels(labels.slice(0, -1));
          }}
        />
      </div>
      <small id={`${id}-help`}>Press Enter or comma to add a label.</small>
    </div>
  );
}
