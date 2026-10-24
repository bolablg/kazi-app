import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { buildStageReport } from "../shared/lifecycle";
import type { LifecycleEvent } from "../shared/model";
import { statusLabels } from "../shared/model";
import type { ReportFilter } from "../shared/reports";
import { useData } from "./data";
import { Link } from "react-router-dom";

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
  const days = (value: number | null) =>
    value === null ? "—" : Math.round(value * 10) / 10 + "d";
  return (
    <section
      id="report-content"
      role="tabpanel"
      aria-labelledby="report-tab-Workflow"
    >
      <div className="section-line">
        <div>
          <h2>Time in each stage</h2>
          <p>
            Average and median of recorded stage exits during the selected
            period.
          </p>
        </div>
        <Link to="/settings?tab=planning" className="text-button">
          Configure review thresholds
        </Link>
      </div>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Currently here</th>
              <th>Recorded exits</th>
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
                <td>{stage.exits}</td>
                <td>
                  {stage.status === "done"
                    ? "Final stage"
                    : days(stage.meanDays)}
                </td>
                <td>
                  {stage.status === "done"
                    ? "Final stage"
                    : days(stage.medianDays)}
                </td>
                <td>{days(stage.medianCurrentAgeDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="report-footnote">
        {report.coverage} Completion is the final stage; waiting time after
        completion is not a performance duration.
      </p>
      <section className="report-panel">
        <div className="section-line">
          <h2>Needs a stage review</h2>
          <span>{report.aged.length} tasks</span>
        </div>
        {report.aged.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Stage</th>
                  <th>Age</th>
                  <th>Review threshold</th>
                </tr>
              </thead>
              <tbody>
                {report.aged.map(({ task, days: age, threshold }) => (
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
                    <td>{threshold}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
