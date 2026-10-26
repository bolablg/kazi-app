import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import {
  buildCalendarInsights,
  type CalendarAllocation,
} from "../shared/calendarInsights";
import type { ReportFilter } from "../shared/reports";
import { duration, ProjectTag } from "./components";
import { InfoTip } from "./InfoTip";
import { TaskLabels } from "./TaskLabels";
import { useData } from "./data";
import { projectStyle } from "./projectColors";
import "./calendar-insights.css";

const time = (minutes: number) => duration(Math.round(minutes));

export function CalendarInsights({
  filter,
  openTask,
}: {
  filter: ReportFilter;
  openTask: (id: string) => void;
}) {
  const { state } = useData();
  const [params] = useSearchParams();
  const report = useMemo(
    () => buildCalendarInsights(state, filter),
    [
      state,
      filter.from,
      filter.to,
      filter.zone,
      filter.actorId,
      filter.person,
      filter.project,
      filter.now,
    ],
  );
  const [showAllTasks, setShowAllTasks] = useState(false);
  const calendarParams = new URLSearchParams({
    person: filter.person,
    project: filter.project,
    range: "week",
    date: filter.to,
  });
  const goalParams = new URLSearchParams(params);
  goalParams.set("tab", "Goals");
  const pending = report.unscheduledTaskIds
    .map((id) => state.tasks.find((task) => task.id === id))
    .filter((task) => task !== undefined);
  const visibleTasks = showAllTasks ? pending : pending.slice(0, 5);
  return (
    <section
      className="calendar-insights"
      id="report-content"
      role="tabpanel"
      aria-labelledby="report-tab-Calendar"
    >
      <div className="calendar-insights-heading">
        <div className="section-title-group">
          <h2>Calendar planning</h2>
          <InfoTip label="About calendar planning insights">
            <p>
              These are current calendar reservations within the selected dates,
              not hours worked or a productivity score. Changes to a reservation
              update its allocation here; accepted plan versions remain in
              Plans.
            </p>
            <p>
              Ready tasks are current To do and In progress tasks without
              subtasks. Coverage shows which have a reservation in this period.
              Task tags, project membership, and task stages use their current
              values.
            </p>
          </InfoTip>
        </div>
        <Link className="button secondary" to={"/calendar?" + calendarParams}>
          <CalendarDays size={15} />
          Open calendar
        </Link>
      </div>
      <div
        className="calendar-insights-metrics"
        aria-label="Calendar planning summary"
      >
        <div data-tone="orange">
          <span>Reserved time</span>
          <strong>{time(report.reservedMinutes)}</strong>
          <small>
            {report.reservations}{" "}
            {report.reservations === 1 ? "reservation" : "reservations"}
          </small>
        </div>
        <div data-tone="blue">
          <span>Scheduled tasks</span>
          <strong>
            {report.coverage.percent === null
              ? "—"
              : report.coverage.percent + "%"}
          </strong>
          <small>
            {report.coverage.scheduled} of {report.coverage.eligible} in this
            period
          </small>
        </div>
        <div data-tone="rose">
          <span>Short blocks</span>
          <strong>{report.shortReservations}</strong>
          <small>Under 30 minutes</small>
        </div>
        <div data-tone="green">
          <span>Recorded moves</span>
          <strong>{report.recordedReschedules}</strong>
          <small>Reschedules during this period</small>
        </div>
      </div>
      <div className="calendar-insights-grid">
        <Allocation
          title="Allocation by project"
          rows={report.byProject}
          total={report.reservedMinutes}
          kind="project"
        />
        <Allocation
          title="Allocation by tag"
          rows={report.byTag}
          total={report.reservedMinutes}
          kind="tag"
        />
      </div>
      <div className="calendar-continuity" aria-label="Calendar continuity">
        <div>
          <span>Longest reservation</span>
          <strong>
            {report.reservations ? time(report.longestReservationMinutes) : "—"}
          </strong>
        </div>
        <div>
          <span>Recorded cancellations</span>
          <strong>{report.recordedCancellations}</strong>
        </div>
        <div>
          <span>Overlapping time</span>
          <strong>{time(report.overlapMinutes)}</strong>
        </div>
        <InfoTip label="About reservation continuity">
          Short blocks are reservations shorter than 30 minutes within the
          selected dates; periods clip reservations at their boundaries. Moves
          and cancellations count explicit, timestamped calendar-session
          changes. Older changes are not inferred. Overlap counts once per
          person and is shared between overlapping tasks when showing
          allocation. None of these measures establishes what someone actually
          worked on.
        </InfoTip>
      </div>
      <section
        className="calendar-ready-tasks"
        aria-labelledby="calendar-ready-heading"
      >
        <div className="section-line">
          <div className="section-title-group">
            <h2 id="calendar-ready-heading">
              Ready tasks without reserved time
            </h2>
            <InfoTip label="About ready tasks without reserved time">
              Current To do and In progress tasks in this scope, created before
              the period ends, with no confirmed reservation within the selected
              dates. Backlog and tasks awaiting validation are not counted. This
              is a planning prompt, not an overdue-work measure.
            </InfoTip>
          </div>
          <span>{report.coverage.unscheduled}</span>
        </div>
        {visibleTasks.length ? (
          <ul>
            {visibleTasks.map((task) => (
              <li key={task.id}>
                <button
                  className="calendar-insight-task"
                  onClick={() => openTask(task.id)}
                >
                  <span className="calendar-insight-task-title">
                    {task.title}
                  </span>
                  <ArrowUpRight size={15} />
                </button>
                <ProjectTag
                  project={state.projects.find(
                    (project) => project.id === task.projectId,
                  )}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="calendar-insights-empty">
            {report.coverage.eligible
              ? "Every ready task has a reservation in this period."
              : "No ready tasks match this scope."}
          </p>
        )}
        {pending.length > 5 && (
          <button
            className="text-button"
            aria-expanded={showAllTasks}
            onClick={() => setShowAllTasks(!showAllTasks)}
          >
            {showAllTasks ? "Show fewer" : `Show all ${pending.length} tasks`}
          </button>
        )}
      </section>
      <Link className="calendar-goals-link" to={"/insights?" + goalParams}>
        Compare with goal delivery <ArrowUpRight size={15} />
      </Link>
    </section>
  );
}

function Allocation({
  title,
  rows,
  total,
  kind,
}: {
  title: string;
  rows: CalendarAllocation[];
  total: number;
  kind: "project" | "tag";
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, 5);
  return (
    <section className="calendar-allocation" aria-label={title}>
      <div className="section-title-group">
        <h3>{title}</h3>
        {kind === "tag" && (
          <InfoTip label="About allocation by tag">
            A task with several tags splits its reserved minutes equally between
            them. Untagged work is shown separately. Overlapping reservations
            share the same available minutes, so they do not inflate totals.
          </InfoTip>
        )}
      </div>
      {shown.length ? (
        <ul>
          {shown.map((row) => (
            <li key={row.id} style={projectStyle(row.color)}>
              <div className="calendar-allocation-label">
                {kind === "tag" && row.id !== "untagged" ? (
                  <TaskLabels labels={[row.name]} limit={1} />
                ) : (
                  <span title={row.name}>{row.name}</span>
                )}
                <strong>{time(row.minutes)}</strong>
                <small>{row.percent}%</small>
              </div>
              <div className="calendar-allocation-track" aria-hidden="true">
                <span
                  className={kind === "tag" ? "tag-allocation" : undefined}
                  style={{
                    width: `${Math.min(100, total ? (row.minutes / total) * 100 : 0)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="calendar-insights-empty">
          No reservations in this period.
        </p>
      )}
      {rows.length > 5 && (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
