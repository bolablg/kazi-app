import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export interface TaskChoiceOption {
  value: string;
  label: string;
  color: string;
}
export function TaskChoice({
  name,
  label,
  defaultValue,
  options,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: TaskChoiceOption[];
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  return (
    <span className={`task-choice ${className}`}>
      <Select.Root name={name} value={value} onValueChange={setValue}>
        <Select.Trigger aria-label={label}>
          <Select.Value>
            <span className="choice-value">
              <span
                className="choice-dot"
                style={{ backgroundColor: selected.color }}
                aria-hidden="true"
              />
              {selected.label}
            </span>
          </Select.Value>
          <Select.Icon asChild>
            <ChevronDown size={14} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="task-choice-menu"
            aria-label={`${label} options`}
            position="popper"
            sideOffset={4}
            collisionPadding={12}
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  textValue={option.label}
                >
                  <Select.ItemText>
                    <span className="choice-value">
                      <span
                        className="choice-dot"
                        style={{ backgroundColor: option.color }}
                        aria-hidden="true"
                      />
                      {option.label}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </span>
  );
}
