import { useMemo, useState, type CSSProperties } from "react";
import { CalendarPlus, Search, GripVertical, X } from "lucide-react";
import type { Task } from "../shared/model";
import { useData } from "./data";
import { TaskLabels } from "./TaskLabels";
import { duration } from "./components";
import { InfoTip } from "./InfoTip";

export const calendarDragType = "application/x-kazi-calendar";
export function CalendarTaskTray({
  tasks,
  reservedMinutes,
  onSchedule,
  onOpenTask,
  onClose,
  color,
}: {
  tasks: Task[];
  reservedMinutes: Map<string, number>;
  onSchedule: (task: Task) => void;
  onOpenTask: (id: string) => void;
  onClose: () => void;
  color: (task: Task) => CSSProperties;
}) {
  const { state, actorId, online } = useData();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [tag, setTag] = useState("all");
  const [backlog, setBacklog] = useState(false);
  const tags = useMemo(
    () => [...new Set(tasks.flatMap((task) => task.labels))].sort(),
    [tasks],
  );
  const rows = tasks
    .filter(
      (task) =>
        (["todo", "in_progress"].includes(task.status) ||
          (backlog && task.status === "backlog")) &&
        ((task.remainingMinutes ?? task.estimatedMinutes) === undefined ||
          (task.remainingMinutes ?? task.estimatedMinutes ?? 0) >
            (reservedMinutes.get(task.id) ?? 0)) &&
        task.title.toLowerCase().includes(query.toLowerCase()) &&
        (priority === "all" || task.priority === priority) &&
        (tag === "all" || task.labels.includes(tag)),
    )
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority] ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
    );
  return (
    <aside className="calendar-task-tray" aria-label="Unscheduled tasks">
      <div className="calendar-tray-heading">
        <div>
          <h2>
            Unscheduled <span>{rows.length}</span>
          </h2>
          <InfoTip label="About unscheduled tasks">
            Tasks with estimated work still to allocate after future confirmed
            reservations across your calendars. Tasks without estimates remain
            available to plan. Drag your To do or In progress tasks onto a time
            slot, or use Reserve time. Scheduling never promotes a Backlog idea.
          </InfoTip>
        </div>
        <button
          className="icon-button"
          aria-label="Close task tray"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="calendar-tray-search">
        <Search size={15} />
        <input
          aria-label="Find an unscheduled task"
          placeholder="Find a task…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="calendar-tray-filters">
        <select
          aria-label="Unscheduled task priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Unscheduled task tag"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="all">All tags</option>
          {tags.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="calendar-tray-tasks">
        {rows.length ? (
          rows.map((task) => {
            const canSchedule =
              online &&
              task.assigneeId === actorId &&
              ["todo", "in_progress"].includes(task.status);
            const member = state.members.find(
              (item) => item.id === task.assigneeId,
            );
            return (
              <article
                className="calendar-tray-task"
                key={task.id}
                style={color(task)}
                draggable={canSchedule}
                onDragStart={(event) => {
                  if (!canSchedule) return event.preventDefault();
                  event.dataTransfer.setData(
                    calendarDragType,
                    JSON.stringify({ taskId: task.id }),
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className="calendar-tray-task-top">
                  <span className="calendar-tray-color" />
                  <button
                    className="calendar-tray-task-title"
                    onClick={() => onOpenTask(task.id)}
                  >
                    {task.title}
                  </button>
                  {canSchedule && (
                    <GripVertical
                      size={14}
                      className="calendar-tray-grip"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span className="calendar-tray-project">
                  {
                    state.projects.find(
                      (project) => project.id === task.projectId,
                    )?.title
                  }
                </span>
                <TaskLabels labels={task.labels} limit={2} />
                <div className="calendar-tray-task-meta">
                  <span
                    className="calendar-tray-priority"
                    data-priority={task.priority}
                  >
                    {task.priority}
                  </span>
                  <span>
                    {(task.remainingMinutes ?? task.estimatedMinutes) ===
                    undefined
                      ? "Estimate needed"
                      : duration(
                          Math.max(
                            0,
                            Math.round(
                              (task.remainingMinutes ??
                                task.estimatedMinutes ??
                                0) - (reservedMinutes.get(task.id) ?? 0),
                            ),
                          ),
                        ) + " left"}
                  </span>
                  {canSchedule ? (
                    <button
                      className="calendar-tray-reserve"
                      aria-label={"Reserve time for " + task.title}
                      onClick={() => onSchedule(task)}
                    >
                      <CalendarPlus size={15} />
                      <span>Reserve</span>
                    </button>
                  ) : (
                    <span className="calendar-tray-owner">
                      {task.status === "backlog"
                        ? "Backlog"
                        : (member?.name ?? "Unassigned")}
                    </span>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="calendar-tray-empty">
            <CalendarPlus size={23} />
            <strong>No unscheduled tasks here</strong>
            <p>Change the filters or add work in Tasks.</p>
          </div>
        )}
      </div>
      <label className="check-label calendar-tray-backlog">
        <input
          type="checkbox"
          checked={backlog}
          onChange={(event) => setBacklog(event.target.checked)}
        />
        Show Backlog ideas
      </label>
    </aside>
  );
}
