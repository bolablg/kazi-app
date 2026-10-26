import { CalendarInsights } from "./CalendarInsights";
import { WorkflowReport } from "./WorkflowReport";
import { ScrollTable } from "./ScrollTable";
import { InfoTip, PageTitle } from "./InfoTip";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePaginatedQuery } from "convex/react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Download,
  Flag,
  Globe2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { ReportEvent } from "../shared/model";
import { addDays, dateInZone } from "../shared/scheduler";
import {
  buildReport,
  reportCsv,
  previousReportFilter,
  reportHistoryBounds,
  reportBounds,
  type Report,
  type ReportFilter,
} from "../shared/reports";
import { duration, ProjectTag } from "./components";
import { useData } from "./data";
import { projectStyle } from "./projectColors";

const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const dateTime = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(at);
const tabs = [
  "Summary",
  "Workload",
  "Calendar",
  "Performance",
  "Workflow",
  "Goals",
];

export function InsightsPage({ openTask }: { openTask: (id: string) => void }) {
  const { state, actorId, demo } = useData();
  const zone = state.members.find((m) => m.id === actorId)!.preferences
    .timezone;
  const today = dateInZone(Date.now(), zone);
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState(addDays(today, -29)),
    [to, setTo] = useState(today);
  const person = params.get("person") ?? actorId,
    project = state.projects.some((p) => p.id === params.get("project"))
      ? params.get("project")!
      : "all";
  const tab = tabs.includes(params.get("tab") ?? "")
    ? params.get("tab")!
    : "Summary";
  const tabList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabList.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const select = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    });
  let valid = false;
  try {
    const b = reportBounds(from, to, zone);
    valid = b.to > b.from && b.to - b.from <= 367 * 86400000 && to <= today;
  } catch {
    /* Incomplete date input. */
  }
  const filter: ReportFilter = {
    from,
    to,
    zone,
    actorId,
    person,
    project,
    now: Date.now(),
  };
  return (
    <div className="page reports-page">
      <div className="page-heading">
        <div>
          <PageTitle
            help={
              <>
                <strong>How Insights work</strong>
                <p>
                  Completion, delivery, and stage durations come from status
                  history and due dates. Calendar time counts all elapsed time;
                  working time uses your configured working days and hours. No
                  manual time logging is required.
                </p>
                <p>
                  Completion trends count each task without subtasks once per
                  period, keeping its latest finish if reopened. The saved
                  finish retains its due date and worker. Undated finishes are
                  excluded; missing start dates are not inferred.
                </p>
                <p>
                  Workload uses confirmed calendar reservations and estimates.
                  Current workload, overdue work, and project progress are live
                  snapshots. Comparisons use an equal previous period for ranges
                  up to 183 days.
                </p>
              </>
            }
          >
            Insights
          </PageTitle>
        </div>
        <div className="reports-context">
          {demo && <span className="badge neutral">Demo data</span>}
          <Link
            className="report-timezone"
            to="/settings?tab=planning&section=working-hours"
            aria-label={`Change time zone, currently ${zone}`}
            title={`Time zone: ${zone}. Change in Planning settings.`}
          >
            <Globe2 size={15} />
            <span>{zone.replaceAll("_", " ")}</span>
          </Link>
        </div>
      </div>
      <div className="report-toolbar">
        <label>
          Period
          <select
            aria-label="Insights period"
            value={period}
            onChange={(e) => {
              const next = e.target.value;
              setPeriod(next);
              if (next !== "custom") {
                setFrom(addDays(today, 1 - Number(next)));
                setTo(today);
              }
            }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              From
              <input
                type="date"
                aria-label="Insights start date"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                aria-label="Insights end date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Person
          <select
            aria-label="Insights person"
            value={person}
            onChange={(e) => select("person", e.target.value)}
          >
            <option value={actorId}>Me</option>
            <option value="all">Everyone</option>
            {state.members
              .filter((m) => m.id !== actorId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Project
          <select
            aria-label="Insights project"
            value={project}
            onChange={(e) => select("project", e.target.value)}
          >
            <option value="all">All projects</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="report-date-range">
          {valid
            ? `${dateLabel(from)} – ${dateLabel(to)}`
            : "Choose valid dates"}
        </span>
      </div>
      <div
        ref={tabList}
        className="overview-tabs report-tabs"
        role="tablist"
        aria-label="Insights views"
      >
        {tabs.map((name) => (
          <button
            key={name}
            id={`report-tab-${name.replaceAll(" ", "-")}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls="report-content"
            tabIndex={tab === name ? 0 : -1}
            onClick={() => select("tab", name)}
            onKeyDown={(event) => {
              const current = tabs.indexOf(name);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : event.key === "ArrowRight"
                      ? (current + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (current + tabs.length - 1) % tabs.length
                        : null;
              if (next === null) return;
              event.preventDefault();
              select("tab", tabs[next]);
              tabList.current
                ?.querySelectorAll<HTMLButtonElement>("button")
                [next]?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {!valid ? (
        <p role="alert" className="overview-empty">
          Choose a date range of up to one year, ending today or earlier.
        </p>
      ) : tab === "Calendar" ? (
        <CalendarInsights filter={filter} openTask={openTask} />
      ) : tab === "Workflow" ? (
        <WorkflowReport filter={filter} openTask={openTask} />
      ) : demo ? (
        <ReportBody
          filter={filter}
          history={state.reportEvents ?? []}
          tab={tab}
          openTask={openTask}
        />
      ) : (
        <LiveReportBody filter={filter} tab={tab} openTask={openTask} />
      )}
    </div>
  );
}
function LiveReportBody(props: {
  filter: ReportFilter;
  tab: string;
  openTask: (id: string) => void;
}) {
  const { teamIds } = useData();
  const bounds = reportHistoryBounds(props.filter);
  const { results, status, loadMore } = usePaginatedQuery(
    api.reports.allEvents,
    {
      teamIds:
        teamIds as import("../convex/_generated/dataModel").Id<"workspaces">[],
      ...bounds,
    },
    { initialNumItems: 100 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [status, loadMore]);
  if (status !== "Exhausted")
    return (
      <p className="overview-empty" role="status">
        Loading reporting history…
      </p>
    );
  return <ReportBody {...props} history={results} />;
}
function elapsed(minutes: number | null) {
  if (minutes === null) return "—";
  return minutes >= 1440
    ? `${Math.round((minutes / 1440) * 10) / 10}d`
    : duration(Math.round(minutes));
}
function ReportBody({
  filter,
  history,
  tab,
  openTask,
}: {
  filter: ReportFilter;
  history: ReportEvent[];
  tab: string;
  openTask: (id: string) => void;
}) {
  const { state } = useData();
  const report = buildReport(state, history, filter),
    priorFilter = previousReportFilter(filter);
  const previous = priorFilter
    ? buildReport(state, history, priorFilter)
    : null;
  const exportReport = () => {
    const url = URL.createObjectURL(
      new Blob([reportCsv(report)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `kazi-report-${filter.from}-${filter.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      id="report-content"
      role="tabpanel"
      aria-labelledby={`report-tab-${tab}`}
    >
      <div className="report-metrics" aria-label="Insights summary">
        <Metric
          value={String(report.completed.length)}
          tone="green"
          label="Tasks completed"
          detail={
            previous
              ? `${previous.completed.length} in the previous period`
              : "Unique tasks in this period"
          }
        />
        <Metric
          value={report.onTimeRate === null ? "—" : `${report.onTimeRate}%`}
          tone="blue"
          label="On-time delivery"
          detail={`${report.onTime} of ${report.withDeadline.length} finishes with a due date`}
        />
        <Metric
          value={String(report.late.length)}
          tone="amber"
          label="Finished late"
          detail="Due date saved at completion"
        />
        <Metric
          value={String(report.overdue.length)}
          tone="coral"
          label="Overdue now"
          detail="Open tasks past their due date"
        />
      </div>
      <div className="report-caption">
        <p>
          {previous ? (
            <>
              <strong>
                {report.completed.length - previous.completed.length >= 0
                  ? "+"
                  : ""}
                {report.completed.length - previous.completed.length} tasks
                completed
              </strong>{" "}
              versus the previous {report.days.length}{" "}
              {report.days.length === 1 ? "day" : "days"}.
            </>
          ) : (
            "Task status changes and calendar plans update these insights automatically."
          )}
        </p>
        <button className="button secondary" onClick={exportReport}>
          <Download size={15} />
          Export daily totals
        </button>
      </div>
      {(tab === "Summary" || tab === "Performance") && (
        <Insights report={report} />
      )}
      {(tab === "Summary" || tab === "Workload") && (
        <div className="report-grid">
          <PlannedFocus report={report} />
          <Trend
            report={report}
            metric={tab === "Summary" ? "completed" : "scheduled"}
          />
        </div>
      )}
      {tab === "Performance" && (
        <>
          <Trend report={report} metric="completed" />
          <div className="section-title-group">
            <h2>Lead & cycle time</h2>
            <InfoTip label="About lead and cycle time">
              Lead and cycle time measure elapsed calendar time, including
              waiting. They do not measure hours worked. A task needs a recorded
              start to contribute to cycle time.
            </InfoTip>
          </div>
          <div className="report-flow-metrics">
            <Metric
              value={elapsed(report.medianLeadMinutes)}
              label="Median lead time"
              detail={`Calendar time · ${report.leadTimes.length} finishes. Working time: ${report.medianWorkingLeadMinutes === null ? "—" : Math.round(report.medianWorkingLeadMinutes / 6) / 10 + "h"}`}
            />
            <Metric
              value={elapsed(report.medianCycleMinutes)}
              label="Median cycle time"
              detail={`Calendar time · ${report.cycleTimes.length} finishes. Working time: ${report.medianWorkingCycleMinutes === null ? "—" : Math.round(report.medianWorkingCycleMinutes / 6) / 10 + "h"}`}
            />
            <Metric
              value={String(report.inProgress.length)}
              label="Work in progress"
              detail="Current tasks being worked on"
            />
            <Metric
              value={String(report.archived.length)}
              label="Archived work"
              detail="Rejected, blocked, or discontinued tasks"
            />
          </div>
        </>
      )}
      {(tab === "Summary" || tab === "Performance") && (
        <Performance report={report} zone={filter.zone} openTask={openTask} />
      )}
      {(tab === "Summary" || tab === "Goals") && (
        <ProjectGoals report={report} openTask={openTask} />
      )}
      {tab === "Workload" && (
        <section className="report-panel">
          <div className="section-line">
            <div className="section-title-group">
              <h2>Current workload by person</h2>
              <InfoTip label="About workload measures">
                Estimates support planning; task counts and calendar
                reservations are not measures of individual productivity.
              </InfoTip>
            </div>
            <span>Live snapshot</span>
          </div>
          <ScrollTable label="Insights data table">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Open tasks</th>
                  <th>In progress</th>
                  <th>To validate</th>
                  <th>Estimated work left</th>
                </tr>
              </thead>
              <tbody>
                {state.members
                  .filter(
                    (m) => filter.person === "all" || m.id === filter.person,
                  )
                  .map((m) => {
                    const tasks = report.open.filter(
                      (t) => t.assigneeId === m.id,
                    );
                    return (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{tasks.length}</td>
                        <td>
                          {
                            tasks.filter((t) => t.status === "in_progress")
                              .length
                          }
                        </td>
                        <td>
                          {
                            tasks.filter((t) => t.status === "to_validate")
                              .length
                          }
                        </td>
                        <td>
                          {duration(
                            tasks.reduce(
                              (n, t) =>
                                n +
                                (t.remainingMinutes ?? t.estimatedMinutes ?? 0),
                              0,
                            ),
                          )}
                          {tasks.some(
                            (t) =>
                              t.remainingMinutes === undefined &&
                              t.estimatedMinutes === undefined,
                          )
                            ? " + unestimated tasks"
                            : ""}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </ScrollTable>
        </section>
      )}
      {tab === "Goals" && (
        <section className="report-panel">
          <div className="section-line">
            <h2>Completed work</h2>
            <span>
              {report.completed.length}{" "}
              {report.completed.length === 1 ? "task" : "tasks"} in this period
            </span>
          </div>
          {report.completed.length ? (
            <div className="report-completed-list">
              {[...report.completed]
                .sort((a, b) => b.at - a.at)
                .map((e) => (
                  <div key={e.id}>
                    <Check size={16} />
                    <TaskLink id={e.taskId} openTask={openTask} />
                    <span>{dateTime(e.at, filter.zone)}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="overview-empty">
              Completed work will appear here as tasks are finished.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
function Metric({
  value,
  label,
  detail,
  tone = "blue",
}: {
  value: string;
  label: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "coral";
}) {
  return (
    <div data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function TaskLink({
  id,
  openTask,
}: {
  id: string;
  openTask: (id: string) => void;
}) {
  const { state } = useData();
  return (
    <button className="report-task-link" onClick={() => openTask(id)}>
      {state.tasks.find((t) => t.id === id)?.title ?? "Task"}
      <ArrowUpRight size={13} />
    </button>
  );
}
function Insights({ report }: { report: Report }) {
  const top = [...report.projects]
    .sort((a, b) => b.scheduled - a.scheduled)
    .find((p) => p.scheduled > 0);
  const insights = [
    {
      title: "Delivery",
      text: report.withDeadline.length
        ? `${report.onTime} of ${report.withDeadline.length} dated finishes were on time. ${report.late.length} finished late.`
        : "Complete tasks with due dates to build a delivery trend.",
    },
    {
      title: "Flow",
      text: `${report.inProgress.length} tasks in progress and ${report.archived.length} archived. ${report.validationPending.length} awaiting validation; ${report.backlog.length} ideas or backlog tasks. ${report.created.length} created versus ${report.completed.length} completed in this period.`,
    },
    {
      title: "Focus allocation",
      text: top
        ? `${top.project.title} has the most confirmed calendar time: ${duration(top.scheduled)}. This is planned focus, not measured working time.`
        : "Approved calendar plans will reveal how focus time is distributed across projects.",
    },
    {
      title: "Planning coverage",
      text: `${report.noDeadline.length} open tasks have no due date; ${report.missingEstimates.length} have no effort estimate. Add these where useful to improve planning.`,
    },
  ];
  return (
    <div className="report-insights" aria-label="Performance insights">
      {insights.map((i) => (
        <div key={i.title}>
          <h3>{i.title}</h3>
          <p>{i.text}</p>
        </div>
      ))}
    </div>
  );
}
function PlannedFocus({ report }: { report: Report }) {
  const rows = report.projects
      .filter((p) => p.scheduled > 0)
      .sort((a, b) => b.scheduled - a.scheduled),
    total = rows.reduce((n, p) => n + p.scheduled, 0);
  return (
    <section className="report-panel">
      <div className="section-line">
        <div className="section-title-group">
          <h2>Planned focus by project</h2>
          <InfoTip label="About planned focus">
            Confirmed app reservations only. Private busy events and unapproved
            proposals are excluded. Planned time does not imply a task was
            worked on or completed.
          </InfoTip>
        </div>
        <span>{duration(report.scheduledMinutes)} confirmed</span>
      </div>
      {total > 0 ? (
        <>
          <div
            className="time-share-bar"
            role="img"
            aria-label="Share of planned calendar time by project"
          >
            {rows.map((row) => (
              <span
                key={row.project.id}
                title={`${row.project.title}: ${duration(row.scheduled)}`}
                style={{
                  ...projectStyle(row.project.color),
                  width: `${(row.scheduled / total) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="project-time-rows">
            {rows.map((row) => (
              <div
                className="project-time-row"
                key={row.project.id}
                style={projectStyle(row.project.color)}
              >
                <div>
                  <ProjectTag project={row.project} />
                  <strong>{duration(row.scheduled)}</strong>
                  <span>{Math.round((row.scheduled / total) * 100)}%</span>
                </div>
                <div className="project-time-track">
                  <i style={{ width: `${(row.scheduled / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="report-empty">
          <Clock3 size={25} />
          <h3>No confirmed calendar blocks</h3>
          <p>Approve a calendar plan to see how planned focus is allocated.</p>
        </div>
      )}
    </section>
  );
}
function Trend({
  report,
  metric,
}: {
  report: Report;
  metric: "completed" | "scheduled";
}) {
  const max = Math.max(
    metric === "scheduled" ? 60 : 1,
    ...report.days.flatMap((d) =>
      metric === "completed" ? [d.completed, d.created] : [d.scheduled],
    ),
  );
  return (
    <section className="report-panel">
      <div className="section-line">
        <h2>
          {metric === "completed"
            ? "Created vs completed"
            : "Calendar allocation over time"}
        </h2>
        <span>
          {metric === "completed"
            ? "Daily task throughput"
            : "Confirmed scheduled time"}
        </span>
      </div>
      <div
        className="report-trend"
        role="img"
        aria-label={
          metric === "completed"
            ? "Created and completed tasks by day. Exact values in daily totals."
            : "Planned calendar time by day. Exact values in daily totals."
        }
      >
        <svg
          className="trend-grid-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[0, 25, 50, 75].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </svg>
        <span className="trend-max">
          {metric === "scheduled" ? duration(max) : `${max} tasks`}
        </span>
        <div className="trend-bars">
          {report.days.map((d) => (
            <div
              key={d.date}
              title={`${dateLabel(d.date)}: ${d.created} created, ${d.completed} completed, ${duration(d.scheduled)} scheduled`}
            >
              {metric === "completed" && (
                <i
                  className="created-bar"
                  style={{ height: `${(d.created / max) * 100}%` }}
                />
              )}
              <i
                className={
                  metric === "completed" ? "completed-bar" : "scheduled-bar"
                }
                style={{ height: `${(d[metric] / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="trend-dates">
        <span>{dateLabel(report.days[0].date)}</span>
        <span>{dateLabel(report.days.at(-1)!.date)}</span>
      </div>
      {metric === "completed" && (
        <div className="trend-series">
          <span>
            <i className="created-bar" />
            Created
          </span>
          <span>
            <i className="completed-bar" />
            Completed
          </span>
        </div>
      )}
      <details className="daily-totals">
        <summary>View daily totals</summary>
        <ScrollTable label="Insights data table">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Created</th>
                <th>Completed</th>
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((d) => (
                <tr key={d.date}>
                  <td>{dateLabel(d.date)}</td>
                  <td>{d.created}</td>
                  <td>{d.completed}</td>
                  <td>{duration(d.scheduled)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </details>
    </section>
  );
}
function Performance({
  report,
  zone,
  openTask,
}: {
  report: Report;
  zone: string;
  openTask: (id: string) => void;
}) {
  const { state } = useData();
  return (
    <>
      <section className="report-panel">
        <div className="section-line">
          <div className="section-title-group">
            <h2>Delivery performance</h2>
            <InfoTip label="About on-time delivery">
              On-time rate uses completed tasks with a due date, saved at
              completion. Later deadline edits do not change the result.
            </InfoTip>
          </div>
          <span>Selected period</span>
        </div>
        <div className="completion-breakdown">
          {[
            { label: "On time", n: report.onTime, c: "finish-on-time" },
            { label: "Finished late", n: report.late.length, c: "finish-late" },
            {
              label: "No due date",
              n: report.completed.length - report.withDeadline.length,
              c: "finish-no-date",
            },
          ].map((v) => (
            <div key={v.c}>
              <i className={v.c} />
              <strong>{v.n}</strong>
              <span>{v.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="report-panel">
        <div className="section-line">
          <h2>Finished late</h2>
          <span>
            {report.late.length} {report.late.length === 1 ? "task" : "tasks"}{" "}
            in this period
          </span>
        </div>
        {report.late.length ? (
          <ScrollTable label="Insights data table">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Due at completion</th>
                  <th>Finished</th>
                  <th>Delay</th>
                </tr>
              </thead>
              <tbody>
                {report.late.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <TaskLink id={e.taskId} openTask={openTask} />
                    </td>
                    <td>
                      <ProjectTag
                        project={state.projects.find(
                          (p) => p.id === e.projectId,
                        )}
                      />
                    </td>
                    <td>
                      {e.deadline && /^\d{4}-\d{2}-\d{2}$/.test(e.deadline)
                        ? dateLabel(e.deadline)
                        : dateTime(e.dueAt!, zone)}
                    </td>
                    <td>{dateTime(e.at, zone)}</td>
                    <td>
                      <span className="report-late-label">
                        {elapsed(
                          Math.max(1, Math.ceil((e.at - e.dueAt!) / 60000)),
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        ) : (
          <p className="overview-empty">
            No recorded late completions in this period.
          </p>
        )}
      </section>
      <section className="report-panel">
        <div className="section-line">
          <h2>Overdue & archived work</h2>
          <span>Live snapshot</span>
        </div>
        {[
          ...new Map(
            [...report.overdue, ...report.archived].map((t) => [t.id, t]),
          ).values(),
        ].length ? (
          <div className="report-overdue-list">
            {[
              ...new Map(
                [...report.overdue, ...report.archived].map((t) => [t.id, t]),
              ).values(),
            ].map((t) => (
              <div key={t.id}>
                <TaskLink id={t.id} openTask={openTask} />
                <ProjectTag
                  project={state.projects.find((p) => p.id === t.projectId)}
                />
                <span>
                  {["archived", "blocked", "rejected", "canceled"].includes(
                    t.status,
                  )
                    ? "Archived"
                    : "Overdue"}
                  {t.statusChangedAt !== undefined &&
                  ["archived", "blocked", "rejected", "canceled"].includes(
                    t.status,
                  )
                    ? ` · ${elapsed((Date.now() - t.statusChangedAt) / 60000)}`
                    : t.deadline
                      ? ` · Due ${t.deadline.slice(0, 10)}`
                      : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="overview-empty">
            No overdue or archived tasks for these filters.
          </p>
        )}
      </section>
    </>
  );
}
function ProjectGoals({
  report,
  openTask,
}: {
  report: Report;
  openTask: (id: string) => void;
}) {
  return (
    <section className="report-panel">
      <div className="section-line">
        <div className="section-title-group">
          <h2>Project goals & milestones</h2>
          <InfoTip label="About project progress">
            Project progress counts current non-canceled tasks without subtasks;
            it is not a historical percentage or a measure of business impact.
            Mark key deliverables as “Project milestone” in task details to
            track explicit achievements.
          </InfoTip>
        </div>
        <span>Current scope · task-based progress</span>
      </div>
      {report.goals.length ? (
        <div className="report-goals">
          {report.goals.map((g) => (
            <div key={g.project.id} style={projectStyle(g.project.color)}>
              <div className="goal-heading">
                <ProjectTag project={g.project} />
                <strong>{g.percent === null ? "—" : `${g.percent}%`}</strong>
              </div>
              <div className="project-time-track">
                <i style={{ width: `${g.percent}%` }} />
              </div>
              <p>
                {g.done} of {g.total} {g.total === 1 ? "task" : "tasks"}{" "}
                completed
                {g.overdue ? ` · ${g.overdue} overdue` : ""}
                {g.project.deadline
                  ? ` · Target ${g.project.deadline.slice(0, 10)}`
                  : ""}
              </p>
              {g.milestones.map((t) => (
                <div className="goal-milestone" key={t.id}>
                  {t.status === "done" ? (
                    <Check size={15} />
                  ) : (
                    <Flag size={15} />
                  )}
                  <TaskLink id={t.id} openTask={openTask} />
                  <span>
                    {t.status === "done" ? "Achieved" : "Open milestone"}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="overview-empty">
          Add project tasks to track progress toward your goals.
        </p>
      )}
    </section>
  );
}
