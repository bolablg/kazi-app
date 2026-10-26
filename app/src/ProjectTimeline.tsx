import { useMemo, useRef, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { Circle, Diamond, MoveRight, TriangleAlert } from "lucide-react";
import type { Project, Task } from "../shared/model";
import { statusLabels } from "../shared/model";
import { ganttRows, type GanttRow } from "../shared/gantt";
import { addDays, dateInZone } from "../shared/scheduler";
import { useData } from "./data";
import { Empty } from "./components";
import { projectStyle } from "./projectColors";

const dayNumber = (date: string) =>
  Temporal.PlainDate.from("1970-01-01").until(Temporal.PlainDate.from(date), {
    largestUnit: "days",
  }).days;
const formatDate = (date: string, year = false) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
const ROW_HEIGHT = 64;

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
  const [scale, setScale] = useState<"week" | "month">("week");
  const scroll = useRef<HTMLDivElement>(null);
  const dated = useMemo(
    () =>
      ganttRows(
        tasks,
        state.tasks,
        (task) =>
          state.members.find((m) => m.id === task.assigneeId)?.preferences
            .timezone ?? zone,
      ),
    [tasks, state.tasks, state.members, zone],
  );
  const undated = tasks.filter((task) => !task.startDate && !task.deadline);
  const projectDue = project.deadline
    ? /^\d{4}-\d{2}-\d{2}$/.test(project.deadline)
      ? project.deadline
      : dateInZone(Date.parse(project.deadline), zone)
    : undefined;
  const dates = [
    today,
    project.startDate,
    projectDue,
    ...dated.flatMap((row) => [row.start, row.end]),
  ]
    .filter((date): date is string => Boolean(date))
    .sort();
  const paddedStart = Temporal.PlainDate.from(dates[0]).subtract({ days: 2 });
  const from = paddedStart
    .subtract({ days: paddedStart.dayOfWeek - 1 })
    .toString();
  const days = Math.max(14, dayNumber(dates.at(-1)!) - dayNumber(from) + 5);
  const width = scale === "week" ? 36 : 14;
  const offset = (date: string) => (dayNumber(date) - dayNumber(from)) * width;
  const ticks: { date: string; left: number }[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(from, d),
      plain = Temporal.PlainDate.from(date);
    if (
      d === 0 ||
      (scale === "week"
        ? plain.dayOfWeek === 1 && d > 2
        : (plain.day === 1 || plain.day === 15) && d > 5)
    )
      ticks.push({ date, left: d * width });
  }
  const barLeft = (row: GanttRow) => offset(row.start) + 2;
  const barWidth = (row: GanttRow) =>
    row.kind === "bar"
      ? Math.max(
          24,
          (dayNumber(row.end) - dayNumber(row.start) + 1) * width - 4,
        )
      : 22;
  const rowById = new Map(
    dated.map((row, index) => [row.task.id, { row, index }]),
  );
  const connectors = dated.flatMap((row, index) =>
    row.dependencies.flatMap((dependency) => {
      const source = rowById.get(dependency.task.id);
      if (!source) return [];
      const x1 = barLeft(source.row) + barWidth(source.row),
        y1 = source.index * ROW_HEIGHT + 32;
      const x2 = barLeft(row),
        y2 = index * ROW_HEIGHT + 32;
      const elbow =
        x2 > x1 + 20 ? x1 + (x2 - x1) / 2 : Math.max(x1 + 10, x2 + 10);
      // Reverse links route through the gap above the destination bar.
      const path =
        x2 > x1 + 20
          ? `M${x1},${y1} H${elbow} V${y2} H${x2 - 4}`
          : `M${x1},${y1} H${elbow} V${y2 - 26} H${Math.max(0, x2 - 10)} V${y2} H${x2 - 4}`;
      return [
        {
          id: `${dependency.task.id}:${row.task.id}`,
          path,
          x2,
          y2,
          conflict: dependency.conflict,
        },
      ];
    }),
  );
  const goTo = (date: string) => {
    const element = scroll.current;
    if (!element) return;
    const labelWidth =
      parseFloat(
        getComputedStyle(element).getPropertyValue("--gantt-label-width"),
      ) || 220;
    element.scrollTo({
      left: Math.max(
        0,
        offset(date) - Math.max(0, element.clientWidth - labelWidth) / 3,
      ),
    });
  };
  const conflicts = dated.filter((row) => row.conflict).length;

  return (
    <section
      className="project-timeline panel"
      aria-label="Project Gantt chart"
    >
      <div className="timeline-heading">
        <div>
          <h2>Gantt</h2>
          <p>
            See how project dates and dependencies fit together. Open a task to
            edit its dates.
          </p>
        </div>
        <div className="gantt-controls">
          <button
            className="button secondary"
            onClick={() => goTo(today)}
            disabled={!dated.length}
          >
            Today
          </button>
          <button
            className="button secondary"
            onClick={() => dated[0] && goTo(dated[0].start)}
            disabled={!dated.length}
          >
            First task
          </button>
          <label>
            Scale
            <select
              aria-label="Gantt scale"
              value={scale}
              onChange={(e) => setScale(e.target.value as typeof scale)}
            >
              <option value="week">Weeks</option>
              <option value="month">Months</option>
            </select>
          </label>
        </div>
      </div>
      {!!dated.length ? (
        <>
          <div className="gantt-key">
            <span>
              {formatDate(dates[0], true)} – {formatDate(dates.at(-1)!, true)}
            </span>
            <span>
              <i className="gantt-today-key" />
              Today
            </span>
            <span>
              <Diamond size={12} aria-hidden="true" />
              Milestone
            </span>
            <span>
              <Circle size={12} aria-hidden="true" />
              Deadline only
            </span>
            <span>
              <MoveRight size={14} aria-hidden="true" />
              Dependency
            </span>
            {conflicts > 0 && (
              <span className="gantt-conflict-key">
                <TriangleAlert size={14} aria-hidden="true" />
                {conflicts} {conflicts === 1 ? "task has" : "tasks have"}{" "}
                dependency date conflicts
              </span>
            )}
          </div>
          <div
            className="timeline-scroll"
            tabIndex={0}
            role="region"
            aria-label="Gantt timeline, scroll to explore dates"
            ref={scroll}
          >
            <div
              className="gantt"
              style={{
                width: `calc(var(--gantt-label-width, 220px) + ${days * width}px)`,
              }}
            >
              <div className="gantt-head">
                <strong>Task / dependency</strong>
                <div className="gantt-dates">
                  {ticks.map(({ date, left }) => (
                    <span key={date} style={{ left }}>
                      {formatDate(date)}
                    </span>
                  ))}
                  {scale === "week" && (
                    <div className="gantt-day-ticks" aria-hidden="true">
                      {Array.from({ length: days }, (_, day) => {
                        const date = Temporal.PlainDate.from(from).add({
                          days: day,
                        });
                        return (
                          <time
                            key={day}
                            dateTime={date.toString()}
                            style={{ left: day * width, width }}
                            data-weekend={date.dayOfWeek > 5}
                          >
                            {date.day}
                          </time>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="gantt-body">
                {dated.map((row) => {
                  const { task, start, end, kind, dependencies, conflict } =
                    row;
                  const label = `${task.title}, ${start} to ${end}${task.milestone ? ", milestone" : ""}${kind === "deadline" ? ", deadline only" : ""}${conflict ? ", dependency date conflict" : ""}`;
                  return (
                    <div className="gantt-row" key={task.id}>
                      <button
                        className="gantt-name"
                        onClick={() => openTask(task.id)}
                        title={task.title}
                      >
                        <strong>{task.title}</strong>
                        <small>
                          {statusLabels[task.status]} · {formatDate(start)}
                          {start !== end && ` – ${formatDate(end)}`}
                        </small>
                        {!!dependencies.length && (
                          <small
                            className={conflict ? "gantt-conflict-text" : ""}
                            title={
                              "After: " +
                              dependencies.map((d) => d.task.title).join(", ")
                            }
                          >
                            {conflict ? "Dependency date conflict · " : ""}
                            After:{" "}
                            {dependencies.map((d) => d.task.title).join(", ")}
                          </small>
                        )}
                      </button>
                      <div
                        className="gantt-track"
                        style={{ backgroundSize: `${width * 7}px 100%` }}
                      >
                        <i
                          className="gantt-today"
                          style={{ left: offset(today) }}
                          aria-hidden="true"
                        />
                        <button
                          onClick={() => openTask(task.id)}
                          className={`gantt-bar ${kind !== "bar" ? "milestone" : ""} ${kind === "deadline" ? "deadline-marker" : ""} ${conflict ? "conflict" : ""} ${task.status === "done" ? "completed" : ""}`}
                          style={{
                            ...projectStyle(project.color),
                            left: barLeft(row),
                            width: barWidth(row),
                          }}
                          title={label}
                          aria-label={label}
                        >
                          {kind === "milestone"
                            ? "◆"
                            : kind === "deadline"
                              ? "○"
                              : task.title}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <svg
                  className="gantt-dependencies"
                  width={days * width}
                  height={dated.length * ROW_HEIGHT}
                  aria-hidden="true"
                >
                  {connectors.map((link) => (
                    <g
                      key={link.id}
                      className={link.conflict ? "conflict" : ""}
                    >
                      <path d={link.path} />
                      <path
                        d={`M${link.x2 - 8},${link.y2 - 4} L${link.x2 - 4},${link.y2} L${link.x2 - 8},${link.y2 + 4}`}
                      />
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </>
      ) : (
        <Empty
          title="Add dates to see the Gantt chart"
          body="Open a task below to set a planned start or deadline. A deadline by itself appears as a date marker."
        />
      )}
      {undated.length > 0 && (
        <details className="gantt-undated">
          <summary>
            {undated.length} {undated.length === 1 ? "task" : "tasks"} without
            dates
          </summary>
          <p>Open a task to add dates and place it on the chart.</p>
          <div>
            {undated.map((task) => (
              <button key={task.id} onClick={() => openTask(task.id)}>
                <span>{task.title}</span>
                <small>{statusLabels[task.status]}</small>
              </button>
            ))}
          </div>
        </details>
      )}
      <p className="timeline-note">
        Bars show planned date ranges. Markers do not imply a start or an effort
        estimate. Dependency arrows connect dated tasks in this project; dates
        do not reschedule automatically.
      </p>
    </section>
  );
}
