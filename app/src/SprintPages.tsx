import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Flag,
  Plus,
  Target,
} from "lucide-react";
import type { Command, Sprint, Task } from "../shared/model";
import { statusLabels } from "../shared/model";
import {
  isOpenSprint,
  sprintOutcomeLabels,
  sprintStatusLabels,
  sprintAssignments,
  sprintObjectives,
  sprintSummary,
} from "../shared/sprints";
import { isArchivedTask, isOpenTask } from "../shared/workflow";
import { resourceRole } from "../shared/teams";
import { useData } from "./data";
import { Empty, Modal, TaskRows, useUI } from "./components";
import { PageTitle } from "./InfoTip";
import { TaskBoard } from "./TaskBoard";
import { PlannerForm } from "./PlanningPages";
import type { WorkProps } from "./WorkPages";

const sprintPath = (id: string) => `/sprints/${encodeURIComponent(id)}`;

export function SprintsPage() {
  const { state, teams, teamId, online } = useData();
  const [history, setHistory] = useState(false);
  const navigate = useNavigate();
  const sprints = (state.sprints ?? [])
    .filter((sprint) =>
      history ? !isOpenSprint(sprint) : isOpenSprint(sprint),
    )
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        a.startDate.localeCompare(b.startDate),
    );
  const canCreate = teams.some(
    (team) => (teamId === "all" || team.id === teamId) && team.role !== "guest",
  );
  return (
    <div className="page sprints-page">
      <div className="page-heading">
        <div>
          <PageTitle help="Choose an outcome for a fixed period, select existing tasks, and check what fits before committing.">
            Sprints
          </PageTitle>
        </div>
        {canCreate && (
          <button
            className="button primary"
            disabled={!online}
            onClick={() => navigate("/sprints/new")}
          >
            <Plus size={16} />
            New sprint
          </button>
        )}
      </div>
      <div
        className="section-tabs sprint-tabs"
        role="group"
        aria-label="Sprint views"
      >
        <button
          aria-pressed={!history}
          className={!history ? "active" : ""}
          onClick={() => setHistory(false)}
        >
          Current & upcoming
        </button>
        <button
          aria-pressed={history}
          className={history ? "active" : ""}
          onClick={() => setHistory(true)}
        >
          History
        </button>
      </div>
      {sprints.length ? (
        <div className="sprint-list">
          {sprints.map((sprint) => {
            const tasks =
              sprint.closeout?.tasks ??
              state.tasks.filter((task) => sprint.taskIds.includes(task.id));
            const done = tasks.filter((task) => task.status === "done").length;
            const team = teams.find(
              (team) => team.id === state.resourceTeams?.[sprint.id],
            );
            return (
              <Link
                key={sprint.id}
                to={sprintPath(sprint.id)}
                className={`sprint-card ${sprint.status}`}
              >
                <div className="sprint-card-top">
                  <span className="sprint-state">
                    {sprintStatusLabels[sprint.status]}
                  </span>
                  <span>{team?.name}</span>
                  <ArrowUpRight size={17} />
                </div>
                <h2>{sprint.title}</h2>
                <p>{sprintSummary(sprint)}</p>
                <div className="sprint-card-footer">
                  <span>
                    <CalendarDays size={15} />
                    {sprint.startDate} – {sprint.endDate}
                  </span>
                  <span>
                    {done}/{tasks.length} tasks completed
                  </span>
                  {sprint.closeout?.outcome && (
                    <strong>
                      Objective: {sprintOutcomeLabels[sprint.closeout.outcome]}
                    </strong>
                  )}
                  {sprint.closeout?.objectives && (
                    <span>
                      {sprint.closeout.objectives.length} objectives reviewed
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            history
              ? "No completed sprints yet"
              : "Give the next few weeks a clear objective"
          }
          body={
            history
              ? "Closed sprints keep their original selection and closeout decisions here."
              : "Select work you already have, check what fits your calendar, and decide what happens to unfinished work at the end."
          }
          action={
            !history && canCreate ? (
              <button
                className="button primary"
                disabled={!online}
                onClick={() => navigate("/sprints/new")}
              >
                Create a sprint
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

export function SprintDetail(props: WorkProps) {
  const { id } = useParams();
  const { state, actorId, dispatch, online } = useData();
  const { run } = useUI();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false),
    [closing, setClosing] = useState(false),
    [saving, setSaving] = useState(false),
    [view, setView] = useState("board");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const sprint = state.sprints?.find((sprint) => sprint.id === id);
  if (!sprint)
    return (
      <div className="page">
        <Empty
          title="This sprint isn’t available"
          body="You need access to every project linked to the sprint, including its history."
          action={
            <Link className="button secondary" to="/sprints">
              All sprints
            </Link>
          }
        />
      </div>
    );
  const tasks = state.tasks.filter((task) => sprint.taskIds.includes(task.id));
  const snapshots = sprint.closeout?.tasks;
  const objectives = sprintObjectives(sprint);
  const assignments =
    sprint.closeout?.objectiveAssignments ?? sprintAssignments(sprint);
  const shownTasks = tasks.filter(
    (task) =>
      objectiveFilter === "all" ||
      (assignments[task.id] ?? "other") === objectiveFilter,
  );
  const completed = (snapshots ?? tasks).filter(
    (task) => task.status === "done",
  ).length;
  const manageable =
    sprint.ownerId === actorId ||
    ["owner", "admin"].includes(resourceRole(state, sprint.id, actorId) ?? "");
  const open = isOpenSprint(sprint);
  const act = async (command: Command, message: string) => {
    setSaving(true);
    try {
      await run(() => dispatch(command), message);
    } finally {
      setSaving(false);
    }
  };
  const original = sprint.closeout?.originalTasks ?? sprint.initialTasks ?? [];
  const added = sprint.initialTasks
    ? sprint.taskIds.filter(
        (id) => !sprint.initialTasks!.some((task) => task.id === id),
      ).length
    : 0;
  const removed =
    sprint.initialTasks?.filter((task) => !sprint.taskIds.includes(task.id))
      .length ?? 0;
  return (
    <div className="page sprint-detail">
      <Link to="/sprints" className="text-button sprint-back">
        <ArrowLeft size={15} />
        All sprints
      </Link>
      <div className="page-heading">
        <div>
          <PageTitle help="The objective describes the outcome. Backlog tasks move to To do once a started sprint reaches its start date in its timezone. Task completion and objective achievement are assessed separately.">
            {sprint.title}
          </PageTitle>
        </div>
        <div className="sprint-actions">
          {open && manageable && (
            <button
              className="button secondary"
              disabled={!online || saving}
              onClick={() => navigate(`${sprintPath(sprint.id)}/edit`)}
            >
              Edit sprint
            </button>
          )}
          {sprint.status === "planned" && manageable && (
            <button
              className="button primary"
              disabled={!online || saving}
              onClick={() =>
                act(
                  {
                    type: "start_sprint",
                    id: sprint.id,
                    revision: sprint.revision,
                  },
                  "Sprint started",
                )
              }
            >
              <Flag size={15} />
              Start sprint
            </button>
          )}
          {sprint.status === "active" && manageable && (
            <button
              className="button secondary"
              disabled={!online || saving}
              onClick={() => setClosing(true)}
            >
              Close sprint
            </button>
          )}
        </div>
      </div>
      <section className="sprint-objective" aria-label="Sprint objectives">
        <div className="sprint-objective-heading">
          <Target size={19} />
          <span>SHARED SPRINT</span>
          <span className="sprint-state">
            {sprintStatusLabels[sprint.status]}
          </span>
        </div>
        {sprint.focus && <h2>{sprint.focus}</h2>}
        <div className="sprint-objective-groups">
          {objectives.map((objective, index) => {
            const result = sprint.closeout?.objectives?.find(
              (item) => item.id === objective.id,
            );
            const work = (snapshots ?? tasks).filter(
              (task) => assignments[task.id] === objective.id,
            );
            return (
              <article className="sprint-objective-group" key={objective.id}>
                <span className="eyebrow">OBJECTIVE {index + 1}</span>
                <h2>
                  {objective.title || "Add an objective before starting."}
                </h2>
                {objective.successCriteria && (
                  <p className="sprint-criteria">
                    <strong>Success looks like:</strong>{" "}
                    {objective.successCriteria}
                  </p>
                )}
                <p className="sprint-hint">
                  Lead:{" "}
                  {state.members.find(
                    (member) => member.id === objective.leadId,
                  )?.name ?? "Former member"}{" "}
                  · {work.filter((task) => task.status === "done").length}/
                  {work.length} tasks completed
                </p>
                {result && (
                  <>
                    <strong className="sprint-outcome-label">
                      {sprintOutcomeLabels[result.outcome]}
                    </strong>
                    {result.note && (
                      <p className="sprint-note">{result.note}</p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
        <div className="sprint-summary">
          <span>
            <CalendarDays size={15} />
            {sprint.startDate} – {sprint.endDate} · {sprint.timezone}
          </span>
          <span>
            {completed} of {(snapshots ?? tasks).length} tasks completed
          </span>
          <span>
            {
              (snapshots ?? tasks).filter(
                (task) => task.status === "to_validate",
              ).length
            }{" "}
            awaiting validation
          </span>
        </div>
        {sprint.initialTasks && (
          <p className="sprint-scope-summary">
            {sprint.initialTasks.length} originally selected · {added} added ·{" "}
            {removed} removed
          </p>
        )}
      </section>
      {sprint.closeout && (
        <section
          className="sprint-closeout-record"
          aria-label="Sprint closeout"
        >
          <h2>
            {sprint.closeout.outcome
              ? `Objective: ${sprintOutcomeLabels[sprint.closeout.outcome]}`
              : `${sprint.closeout.objectives?.length ?? 0} objectives reviewed`}
          </h2>
          <p>
            Closed{" "}
            {new Date(sprint.closeout.at).toLocaleDateString("en-US", {
              timeZone: sprint.timezone,
            })}
            . Results below show the work as it stood at closeout.
          </p>
          {sprint.closeout.note && (
            <p className="sprint-note">{sprint.closeout.note}</p>
          )}
          <div className="sprint-history-tasks">
            {sprint.closeout.tasks.map((task) => {
              const decision = sprint.closeout!.decisions.find(
                (d) => d.taskId === task.id,
              );
              const target = state.sprints?.find(
                (item) => item.id === decision?.sprintId,
              );
              return (
                <div className="sprint-history-task" key={task.id}>
                  <button
                    className="text-button"
                    onClick={() => props.openTask(task.id)}
                    title="Open current task"
                  >
                    {task.title}
                  </button>
                  <span>{statusLabels[task.status]}</span>
                  <span>
                    {decision?.action === "backlog"
                      ? "Returned to Backlog"
                      : decision?.action === "outside"
                        ? "Continued outside a sprint"
                        : decision?.action === "sprint"
                          ? `Moved to ${target?.title ?? "a planned sprint"}`
                          : task.status === "done"
                            ? "Accepted"
                            : "Archived"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {open && (
        <>
          <div className="sprint-work-heading">
            <h2>
              Selected work <span>{tasks.length}</span>
            </h2>
            <div className="sprint-actions">
              <select
                aria-label="Filter sprint work by objective"
                value={objectiveFilter}
                onChange={(event) => setObjectiveFilter(event.target.value)}
              >
                <option value="all">All objectives</option>
                {objectives.map((objective, index) => (
                  <option key={objective.id} value={objective.id}>
                    {objective.title || `Objective ${index + 1}`}
                  </option>
                ))}
                <option value="other">Other work</option>
              </select>
              <div
                className="section-tabs sprint-tabs"
                role="group"
                aria-label="Sprint task views"
              >
                <button
                  aria-pressed={view === "board"}
                  onClick={() => setView("board")}
                >
                  Board
                </button>
                <button
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  List
                </button>
              </div>
              <button
                className="button secondary"
                disabled={!online || !tasks.length}
                onClick={() => setPlanning(true)}
              >
                <CalendarDays size={16} />
                Preview calendar plan
              </button>
            </div>
          </div>
          {!tasks.length ? (
            <Empty
              title="Select existing tasks"
              body="Edit the sprint to choose the work that supports its objective."
              action={
                manageable ? (
                  <button
                    className="button secondary"
                    disabled={!online}
                    onClick={() => navigate(`${sprintPath(sprint.id)}/edit`)}
                  >
                    Select tasks
                  </button>
                ) : undefined
              }
            />
          ) : view === "board" ? (
            <TaskBoard
              tasks={shownTasks.filter((task) => !isArchivedTask(task))}
              openTask={props.openTask}
              addTask={
                manageable
                  ? () => navigate(`${sprintPath(sprint.id)}/edit`)
                  : undefined
              }
              addTaskLabel="Select tasks"
            />
          ) : (
            <TaskRows tasks={shownTasks} onOpen={props.openTask} />
          )}
          <p className="sprint-hint">
            Backlog work moves to To do once a started sprint reaches its start
            date. Every calendar owner keeps their approval.
          </p>
        </>
      )}
      {!!original.length && (
        <details className="sprint-history">
          <summary>Original selection · {original.length} tasks</summary>
          <p>
            {sprint.closeout
              ? "Stages recorded at closeout; removed work remains visible here."
              : "Stages recorded when this sprint started."}
          </p>
          {original.map((task) => (
            <div key={task.id} className="sprint-history-task">
              <button
                className="text-button"
                onClick={() => props.openTask(task.id)}
              >
                {task.title}
              </button>
              <span>{statusLabels[task.status]}</span>
              <span>
                {sprint.taskIds.includes(task.id)
                  ? "Selected"
                  : "Removed from sprint"}
              </span>
            </div>
          ))}
        </details>
      )}
      {sprint.initialObjectives && (
        <details className="sprint-history">
          <summary>
            Original objectives · {sprint.initialObjectives.length}
          </summary>
          {sprint.initialObjectives.map((objective) => (
            <div className="sprint-original-objective" key={objective.id}>
              <strong>{objective.title}</strong>
              {objective.successCriteria && <p>{objective.successCriteria}</p>}
              <span>
                {
                  Object.values(
                    sprint.initialObjectiveAssignments ?? {},
                  ).filter((id) => id === objective.id).length
                }{" "}
                tasks originally assigned
              </span>
            </div>
          ))}
        </details>
      )}
      {sprint.changes.length > 0 && (
        <details className="sprint-history">
          <summary>Scope history · {sprint.changes.length} changes</summary>
          {sprint.changes.map((change, index) => (
            <p key={index}>
              {new Date(change.at).toLocaleString("en-US", {
                timeZone: sprint.timezone,
              })}{" "}
              · {change.added.length} added · {change.removed.length} removed
              {change.objectives && " · Objectives updated"}
            </p>
          ))}
        </details>
      )}
      {sprint.status === "planned" && manageable && (
        <button
          className="text-button sprint-cancel"
          disabled={!online || saving}
          onClick={() =>
            act(
              {
                type: "cancel_sprint",
                id: sprint.id,
                revision: sprint.revision,
              },
              "Planned sprint canceled",
            )
          }
        >
          Cancel this planned sprint
        </button>
      )}
      {planning && (
        <PlannerForm
          key={sprint.id}
          open
          onClose={() => setPlanning(false)}
          onCreated={props.openPlan}
          initialSprint={sprint.id}
        />
      )}
      {closing && (
        <SprintCloseout
          key={sprint.revision}
          sprint={sprint}
          tasks={tasks}
          onClose={() => setClosing(false)}
        />
      )}
    </div>
  );
}

function SprintCloseout({
  sprint,
  tasks,
  onClose,
}: {
  sprint: Sprint;
  tasks: Task[];
  onClose: () => void;
}) {
  const { state, actorId, dispatch, online } = useData();
  const { run } = useUI();
  const [saving, setSaving] = useState(false);
  const unfinished = tasks.filter(isOpenTask);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const objectives = sprintObjectives(sprint);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const destinations = (state.sprints ?? []).filter(
    (item) =>
      item.id !== sprint.id &&
      item.status === "planned" &&
      (!state.resourceTeams ||
        state.resourceTeams[item.id] === state.resourceTeams[sprint.id]) &&
      (item.ownerId === actorId ||
        ["owner", "admin"].includes(
          resourceRole(state, item.id, actorId) ?? "",
        )),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Close sprint"
      description="Assess each objective and make a decision for every unfinished task."
      wide
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setSaving(true);
          try {
            const result = await run(
              () =>
                dispatch({
                  type: "close_sprint",
                  id: sprint.id,
                  revision: sprint.revision,
                  outcome:
                    objectives.length === 1
                      ? (outcomes[objectives[0].id] as
                          "achieved" | "partial" | "missed")
                      : undefined,
                  objectiveOutcomes: objectives.map((objective) => ({
                    objectiveId: objective.id,
                    outcome: outcomes[objective.id] as
                      "achieved" | "partial" | "missed",
                    note: String(
                      data.get(`objective-note-${objective.id}`) ?? "",
                    ),
                  })),
                  note: String(data.get("note")),
                  decisions: unfinished.map((task) => {
                    const value = decisions[task.id];
                    return value?.startsWith("sprint:")
                      ? {
                          taskId: task.id,
                          action: "sprint" as const,
                          sprintId: value.slice(7),
                        }
                      : {
                          taskId: task.id,
                          action: value as "backlog" | "outside",
                        };
                  }),
                }),
              "Sprint closed; results preserved",
            );
            if (result) onClose();
          } finally {
            setSaving(false);
          }
        }}
      >
        {objectives.map((objective, index) => (
          <fieldset className="sprint-objective-review" key={objective.id}>
            <legend>Objective {index + 1}</legend>
            <strong>{objective.title}</strong>
            {objective.successCriteria && <p>{objective.successCriteria}</p>}
            <label>
              Outcome
              <select
                aria-label={`Outcome for objective ${index + 1}`}
                required
                value={outcomes[objective.id] ?? ""}
                onChange={(event) =>
                  setOutcomes((current) => ({
                    ...current,
                    [objective.id]: event.target.value,
                  }))
                }
              >
                <option value="" disabled>
                  Choose an outcome
                </option>
                <option value="achieved">Achieved</option>
                <option value="partial">Partly achieved</option>
                <option value="missed">Missed</option>
              </select>
            </label>
            <label>
              Objective note <span className="sprint-optional">(optional)</span>
              <textarea
                name={`objective-note-${objective.id}`}
                aria-label={`Note for objective ${index + 1}`}
                maxLength={2000}
                rows={2}
              />
            </label>
          </fieldset>
        ))}
        <label>
          Closeout note <span className="sprint-optional">(optional)</span>
          <textarea
            name="note"
            maxLength={5000}
            rows={3}
            placeholder="What changed, what was delivered, or what did you learn?"
          />
        </label>
        <h3>Unfinished work · {unfinished.length}</h3>
        {unfinished.length ? (
          <div className="sprint-closeout-options">
            {unfinished.map((task) => (
              <label key={task.id}>
                <span>
                  {task.title}
                  <small>{statusLabels[task.status]}</small>
                </span>
                <select
                  aria-label={`Next step for ${task.title}`}
                  required
                  value={decisions[task.id] ?? ""}
                  onChange={(event) =>
                    setDecisions((current) => ({
                      ...current,
                      [task.id]: event.target.value,
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose a next step
                  </option>
                  <option value="backlog">Return to Backlog</option>
                  <option value="outside">Continue outside a sprint</option>
                  {destinations.map((item) => (
                    <option key={item.id} value={`sprint:${item.id}`}>
                      Move to {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="sprint-hint">There is no unfinished work to move.</p>
        )}
        <p className="sprint-hint">
          Work awaiting validation is still unfinished. Returning work to
          Backlog releases its future Kazi sessions. Other reservations remain;
          use the plan receipt to release your future sessions when needed.
        </p>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Keep sprint open
          </button>
          <button className="button primary" disabled={saving || !online}>
            {saving ? "Closing…" : "Close sprint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CurrentSprint({
  project = "all",
  person = "all",
}: {
  project?: string;
  person?: string;
}) {
  const { state } = useData();
  const sprints = (state.sprints ?? []).filter(
    (sprint) =>
      sprint.status === "active" &&
      (project === "all" || sprint.projectIds.includes(project)) &&
      (person === "all" ||
        sprint.ownerId === person ||
        state.tasks.some(
          (task) =>
            sprint.taskIds.includes(task.id) &&
            (task.assigneeId === person || task.ownerId === person),
        )),
  );
  if (!sprints.length) return null;
  return (
    <div className="current-sprints">
      {sprints.map((sprint) => (
        <Link
          key={sprint.id}
          to={sprintPath(sprint.id)}
          className="current-sprint"
        >
          <Target size={18} />
          <div>
            <span>Current sprint · {sprint.title}</span>
            <strong>{sprintSummary(sprint)}</strong>
          </div>
          <span>Through {sprint.endDate}</span>
          <ArrowUpRight size={16} />
        </Link>
      ))}
    </div>
  );
}
