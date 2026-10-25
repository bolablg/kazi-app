import { useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { buildStageReport } from "../shared/lifecycle";
import type { LifecycleEvent } from "../shared/model";
import { statusLabels } from "../shared/model";
import type { ReportFilter } from "../shared/reports";
import { useData } from "./data";
import { Link } from "react-router-dom";
import { InfoTip } from "./InfoTip";
import { ScrollTable } from "./ScrollTable";

export function WorkflowReport(props: {
  filter: ReportFilter;
  openTask: (id: string) => void;
}) {
  const { state, demo } = useData();
  return demo ? (
    <StageBody {...props} history={state.lifecycleEvents ?? []} />
  ) : (
    <LiveStages {...props} />
  );
}
function LiveStages(props: {
  filter: ReportFilter;
  openTask: (id: string) => void;
}) {
  const { teamIds } = useData();
  const { results, status, loadMore } = usePaginatedQuery(
    api.reports.allLifecycle,
    {
      teamIds:
        teamIds as import("../convex/_generated/dataModel").Id<"workspaces">[],
    },
    { initialNumItems: 100 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [status, loadMore]);
  return status !== "Exhausted" ? (
    <p role="status">Loading timestamped workflow history…</p>
  ) : (
    <StageBody {...props} history={results} />
  );
}
function StageBody({
  filter,
  history,
  openTask,
}: {
  filter: ReportFilter;
  history: LifecycleEvent[];
  openTask: (id: string) => void;
}) {
  const { state } = useData(),
    report = buildStageReport(state, history, filter);
  const [basis, setBasis] = useState<"calendar" | "working">("calendar");
  const days = (value: number | null) =>
    value === null ? "—" : Math.round(value * 10) / 10 + "d";
  const elapsed = (minutes: number | null) =>
    minutes === null
      ? "—"
      : minutes >= 60
        ? Math.round(minutes / 6) / 10 + "h"
        : Math.round(minutes) + "m";
  const hour = (value: number) =>
    `${String(Math.floor(value)).padStart(2, "0")}:${String(Math.round((value % 1) * 60)).padStart(2, "0")}`;
  const calendar = report.workingCalendar;
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const schedule = `${calendar.workingDays.map((day) => weekdayNames[day - 1]).join(", ")} · ${hour(calendar.startHour)}–${hour(calendar.endHour)} · ${calendar.timezone}`;
  return (
    <section
      id="report-content"
      role="tabpanel"
      aria-labelledby="report-tab-Workflow"
      className="workflow-report"
    >
      <div className="section-line">
        <div className="section-title-group">
          <h2>Time in each stage</h2>
          <InfoTip label="About stage durations">
            Repeated visits to a stage are added together for each task before
            calculating the average and median. Completion is the final stage;
            time after completion is excluded. Working durations use your
            configured working calendar and are recalculated from saved
            timestamps when those settings change.
          </InfoTip>
        </div>
        <Link to="/settings?tab=planning" className="text-button">
          Configure review thresholds
        </Link>
      </div>
      <div className="workflow-time-controls">
        <div
          className="time-basis-control"
          role="group"
          aria-label="Duration calculation"
        >
          <button
            type="button"
            aria-pressed={basis === "calendar"}
            onClick={() => setBasis("calendar")}
          >
            Calendar time
          </button>
          <button
            type="button"
            aria-pressed={basis === "working"}
            onClick={() => setBasis("working")}
          >
            Working time
          </button>
        </div>
        <p>
          {basis === "calendar"
            ? "All elapsed time, including nights and weekends."
            : `Only time within your working calendar: ${schedule}`}
        </p>
      </div>
      <ScrollTable label="Workflow stage durations">
        <table className="report-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Currently here</th>
              <th>Visits / tasks measured</th>
              <th>Total duration</th>
              <th>Average duration</th>
              <th>Median duration</th>
              <th>Median current age</th>
            </tr>
          </thead>
          <tbody>
            {report.stages.map((stage) => (
              <tr key={stage.status}>
                <td>{statusLabels[stage.status]}</td>
                <td>{stage.count}</td>
                <td>
                  {stage.exits} / {stage.sampleTasks}
                </td>
                <td>
                  {stage.status === "done"
                    ? "—"
                    : elapsed(stage[basis].totalMinutes)}
                </td>
                <td>
                  {stage.status === "done"
                    ? "Final stage"
                    : elapsed(stage[basis].meanMinutes)}
                </td>
                <td>
                  {stage.status === "done"
                    ? "Final stage"
                    : elapsed(stage[basis].medianMinutes)}
                </td>
                <td>{elapsed(stage[basis].medianCurrentAgeMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <p className="report-footnote">{report.coverage}</p>
      <section className="report-panel">
        <div className="section-line">
          <h2>Needs a stage review</h2>
          <span>{report.aged.length} tasks</span>
        </div>
        {report.aged.length ? (
          <ScrollTable label="Workflow stage durations">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Stage</th>
                  <th>Calendar age</th>
                  <th>Working time</th>
                  <th>Review threshold (calendar)</th>
                </tr>
              </thead>
              <tbody>
                {report.aged.map(
                  ({ task, days: age, workingMinutes, threshold }) => (
                    <tr key={task.id}>
                      <td>
                        <button
                          className="report-task-link"
                          onClick={() => openTask(task.id)}
                        >
                          {task.title}
                        </button>
                      </td>
                      <td>{statusLabels[task.status]}</td>
                      <td>{days(age)}</td>
                      <td>{elapsed(workingMinutes)}</td>
                      <td>{threshold}d</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </ScrollTable>
        ) : (
          <p>No tasks exceed their stage review threshold.</p>
        )}
      </section>
      <section className="report-panel">
        <div className="section-line">
          <h2>To Brainstorm</h2>
          <span>{report.brainstorm.length} ideas saved for later</span>
        </div>
        {report.brainstorm.length ? (
          report.brainstorm.map((task) => (
            <div className="calendar-feed-row" key={task.id}>
              <button
                className="report-task-link"
                onClick={() => openTask(task.id)}
              >
                {task.title}
              </button>
              <span>
                {task.reviewDate
                  ? "Review " + task.reviewDate
                  : "Choose a review date"}
              </span>
            </div>
          ))
        ) : (
          <p>
            Keep a backlog idea for later from its task details, with a review
            date.
          </p>
        )}
      </section>
    </section>
  );
}
