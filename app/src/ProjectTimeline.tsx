import { taskDate } from "../shared/overview";
import { useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { Project, Task } from "../shared/model";
import { statusLabels } from "../shared/model";
import { addDays, dateInZone } from "../shared/scheduler";
import { useData } from "./data";
import { Empty } from "./components";
import { projectStyle } from "./projectColors";

const dayNumber = (date: string) =>
  Temporal.PlainDate.from("1970-01-01").until(Temporal.PlainDate.from(date), {
    largestUnit: "days",
  }).days;
export function ProjectTimeline({
  project,
  tasks,
  openTask,
}: {
  project: Project;
  tasks: Task[];
  openTask: (id: string) => void;
}) {
  const { state, actorId } = useData();
  const zone =
    state.members.find((m) => m.id === actorId)?.preferences.timezone ?? "UTC";
  const today = dateInZone(Date.now(), zone);
  const dueDate = (task: Task) =>
    taskDate(
      task,
      state.members.find((m) => m.id === task.assigneeId)?.preferences
        .timezone ?? zone,
    );
  const [scale, setScale] = useState<"week" | "month">("week");
  const dated = useMemo(
    () =>
      tasks
        .filter((t) => t.startDate || t.deadline)
        .sort((a, b) =>
          (a.startDate ?? a.deadline!).localeCompare(
            b.startDate ?? b.deadline!,
          ),
        ),
    [tasks],
  );
  const dates = [
    today,
    project.startDate,
    project.deadline?.slice(0, 10),
    ...dated.flatMap((t) => [t.startDate, dueDate(t)]),
  ]
    .filter((v): v is string => !!v)
    .sort();
  const from = dates[0],
    to = dates.at(-1)!;
  const days = Math.max(14, dayNumber(to) - dayNumber(from) + 3);
  const width = scale === "week" ? 36 : 14;
  const offset = (date: string) => (dayNumber(date) - dayNumber(from)) * width;
  const ticks = Array.from(
    { length: Math.ceil(days / (scale === "week" ? 7 : 14)) },
    (_, i) => i * (scale === "week" ? 7 : 14),
  );
  return (
    <section className="project-timeline panel" aria-label="Project timeline">
      <div className="timeline-heading">
        <div>
          <h2>Timeline</h2>
          <p>
            Planned starts, deadlines, and dependencies. Open a task to edit its
            dates.
          </p>
        </div>
        <label>
          Scale
          <select
            aria-label="Timeline scale"
            value={scale}
            onChange={(e) => setScale(e.target.value as typeof scale)}
          >
            <option value="week">Weeks</option>
            <option value="month">Months</option>
          </select>
        </label>
      </div>
      {!!dated.length ? (
        <div
          className="timeline-scroll"
          tabIndex={0}
          role="region"
          aria-label="Gantt timeline, scroll to explore dates"
        >
          <div className="gantt" style={{ minWidth: 240 + days * width }}>
            <div className="gantt-head">
              <strong>Task / dependency</strong>
              <div className="gantt-dates">
                {ticks.map((d) => (
                  <span key={d} style={{ left: d * width }}>
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(addDays(from, d) + "T12:00:00Z"))}
                  </span>
                ))}
              </div>
            </div>
            {dated.map((task) => {
              const end = dueDate(task) ?? task.startDate!;
              const start = task.startDate ?? end;
              const dependencies = task.dependencies
                .map((id) => state.tasks.find((t) => t.id === id))
                .filter((t): t is Task => !!t);
              const conflict = dependencies.some(
                (d) => d.deadline && dueDate(d)! > start && d.status !== "done",
              );
              return (
                <div className="gantt-row" key={task.id}>
                  <button
                    className="gantt-name"
                    onClick={() => openTask(task.id)}
                  >
                    <strong>{task.title}</strong>
                    <small>
                      {dependencies.length
                        ? "After: " +
                          dependencies.map((d) => d.title).join(", ")
                        : statusLabels[task.status]}
                      {conflict && " · Dependency date conflict"}
                    </small>
                  </button>
                  <div
                    className="gantt-track"
                    style={{ backgroundSize: `${width * 7}px 100%` }}
                  >
                    <i
                      className="gantt-today"
                      style={{ left: offset(today) }}
                    />
                    <button
                      onClick={() => openTask(task.id)}
                      className={`gantt-bar ${task.milestone || !task.startDate ? "milestone" : ""} ${conflict ? "conflict" : ""} ${task.status === "done" ? "completed" : ""}`}
                      style={{
                        ...projectStyle(project.color),
                        left: offset(start) + 2,
                        width:
                          task.milestone || !task.startDate
                            ? 22
                            : Math.max(
                                24,
                                (dayNumber(end) - dayNumber(start) + 1) *
                                  width -
                                  4,
                              ),
                      }}
                      title={`${task.title}: ${start} → ${end}${conflict ? "; dependency date conflict" : ""}`}
                      aria-label={`${task.title}, ${start} to ${end}`}
                    >
                      {task.milestone || !task.startDate ? "◆" : task.title}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Empty
          title="Add dates to see the timeline"
          body="Set a planned start and deadline on tasks. A deadline by itself appears as a date marker."
        />
      )}
      <p className="timeline-note">
        {tasks.length - dated.length} tasks without dates · Date markers do not
        imply an estimated start. Dependencies are shown on each row; conflicts
        need review.
      </p>
    </section>
  );
}
