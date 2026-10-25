import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Flag,
  Plus,
  Target,
  X,
} from "lucide-react";
import type { Command, Sprint, SprintObjective } from "../shared/model";
import { statusLabels } from "../shared/model";
import {
  automaticSprintName,
  isOpenSprint,
  sprintAssignments,
  sprintObjectives,
} from "../shared/sprints";
import { canEditTask, isOpenTask, isSchedulableTask } from "../shared/workflow";
import { resourceRole } from "../shared/teams";
import { addDays, dateInZone } from "../shared/scheduler";
import { useData } from "./data";
import { Empty, ProjectTag, duration, useUI } from "./components";
import { PageTitle } from "./InfoTip";
import type { WorkProps } from "./WorkPages";

const pathFor = (id: string) => `/sprints/${encodeURIComponent(id)}`;
const newObjective = (leadId: string): SprintObjective => ({
  id: crypto.randomUUID(),
  title: "",
  successCriteria: "",
  leadId,
});

export function SprintPlanner(props: WorkProps) {
  const { id } = useParams();
  const { state, captureState, actorId, teams } = useData();
  const data = captureState ?? state;
  const sprint = data.sprints?.find((item) => item.id === id);
  if (id && !sprint)
    return (
      <div className="page">
        <Empty
          title="This sprint isn’t available"
          body="You need access to every linked project to plan this sprint."
          action={
            <Link to="/sprints" className="button secondary">
              All sprints
            </Link>
          }
        />
      </div>
    );
  if (sprint && !isOpenSprint(sprint))
    return <Navigate to={pathFor(sprint.id)} replace />;
  if (
    (sprint &&
      sprint.ownerId !== actorId &&
      !["owner", "admin"].includes(
        resourceRole(data, sprint.id, actorId) ?? "",
      )) ||
    (!sprint && !teams.some((team) => team.role !== "guest"))
  )
    return (
      <div className="page">
        <Empty
          title="Sprint planning requires owner access"
          body="The sprint owner or a team manager can edit its plan."
          action={
            <Link to="/sprints" className="button secondary">
              All sprints
            </Link>
          }
        />
      </div>
    );
  return <SprintPlannerForm key={id ?? "new"} sprint={sprint} {...props} />;
}

function SprintPlannerForm({
  sprint,
  openPlan,
}: WorkProps & { sprint?: Sprint }) {
  const {
    state,
    captureState,
    actorId,
    teams,
    teamId,
    setTeam,
    dispatch,
    online,
  } = useData();
  const data = captureState ?? state;
  const { run } = useUI();
  const navigate = useNavigate();
  const zone =
    sprint?.timezone ??
    data.members.find((member) => member.id === actorId)!.preferences.timezone;
  const today = dateInZone(Date.now(), zone);
  const [scope, setScope] = useState(
    data.resourceTeams?.[sprint?.id ?? ""] ??
      (teamId === "all"
        ? teams.find((team) => team.role !== "guest")?.id
        : teamId) ??
      teams[0]?.id,
  );
  const [startDate, setStartDate] = useState(sprint?.startDate ?? today);
  const [endDate, setEndDate] = useState(sprint?.endDate ?? addDays(today, 13));
  const [focus, setFocus] = useState(sprint?.focus ?? "");
  const [objectives, setObjectives] = useState<SprintObjective[]>(() =>
    sprint
      ? structuredClone(sprintObjectives(sprint))
      : [newObjective(actorId)],
  );
  const [selection, setSelection] = useState<Record<string, string>>(() =>
    sprint
      ? Object.fromEntries(
          sprint.taskIds.map((id) => [id, sprintAssignments(sprint)[id] ?? ""]),
        )
      : {},
  );
  const [addTo, setAddTo] = useState(objectives[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(sprint?.revision ?? 1);
  const form = useRef<HTMLFormElement>(null);
  const fingerprint = JSON.stringify({
    scope,
    startDate,
    endDate,
    focus,
    objectives,
    selection,
  });
  const [saved, setSaved] = useState(fingerprint);
  const dirty = saved !== fingerprint;
  const active = sprint?.status === "active";
  const conflict = !!sprint && sprint.revision > revision;
  const team = teams.find((team) => team.id === scope);
  const title = active
    ? sprint.title
    : startDate && team
      ? automaticSprintName(team, startDate)
      : "New sprint";
  const selectedTasks = data.tasks.filter((task) =>
    Object.hasOwn(selection, task.id),
  );
  const members = data.teamMemberships?.[scope ?? ""] ?? data.members;
  const projectIds = new Set([
    ...(sprint?.projectIds ?? []),
    ...selectedTasks.map((task) => task.projectId),
  ]);
  const leads = members.filter((member) =>
    [...projectIds].every((id) => {
      const project = data.projects.find((item) => item.id === id);
      return (
        project &&
        (["owner", "admin"].includes(member.role) ||
          project.ownerId === member.id ||
          project.memberIds.includes(member.id) ||
          (!project.private && member.role !== "guest"))
      );
    }),
  );
  const tasks = data.tasks.filter(
    (task) =>
      (!data.resourceTeams || data.resourceTeams[task.id] === scope) &&
      canEditTask(data, task, actorId) &&
      !data.tasks.some((child) => child.parentId === task.id) &&
      (Object.hasOwn(selection, task.id) ||
        (isOpenTask(task) &&
          !(data.sprints ?? []).some(
            (other) =>
              other.id !== sprint?.id &&
              isOpenSprint(other) &&
              other.taskIds.includes(task.id),
          ))) &&
      (projectFilter === "all" || task.projectId === projectFilter) &&
      `${task.title} ${data.projects.find((project) => project.id === task.projectId)?.title ?? ""} ${members.find((member) => member.id === task.assigneeId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const readyTasks = selectedTasks.filter(isSchedulableTask);
  const missingEstimates = readyTasks.filter(
    (task) =>
      task.remainingMinutes === undefined &&
      task.estimatedMinutes === undefined,
  ).length;
  const remaining = readyTasks.reduce(
    (sum, task) => sum + (task.remainingMinutes ?? task.estimatedMinutes ?? 0),
    0,
  );
  const ready =
    objectives.length > 0 &&
    objectives.every(
      (objective) =>
        objective.title.trim() &&
        selectedTasks.some((task) => selection[task.id] === objective.id),
    );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const persist = async (start = false): Promise<string | undefined> => {
    if (!form.current?.reportValidity() || conflict || !online) return;
    setSaving(true);
    try {
      const taskIds = Object.keys(selection);
      const objectiveAssignments = Object.fromEntries(
        Object.entries(selection).filter(([, id]) => !!id),
      );
      const fields = {
        objective: objectives[0]?.title ?? "",
        successCriteria: objectives[0]?.successCriteria ?? "",
        focus,
        objectives,
        objectiveAssignments,
        taskIds,
      };
      const command: Command = sprint
        ? {
            type: "update_sprint",
            id: sprint.id,
            revision,
            patch: {
              ...fields,
              ...(!active ? { startDate, endDate, automaticName: true } : {}),
            },
          }
        : {
            type: "create_sprint",
            ...fields,
            startDate,
            endDate,
            timezone: zone,
          };
      const result = await run(
        () => dispatch(command, { teamId: scope }),
        active ? "Sprint updated" : "Draft saved",
      );
      if (!result) return;
      const id = sprint?.id ?? result,
        nextRevision = sprint ? revision + 1 : 1;
      if (!sprint && teamId !== "all" && teamId !== scope && scope)
        setTeam(scope);
      setRevision(nextRevision);
      setSaved(fingerprint);
      if (start) {
        const started = await run(
          () =>
            dispatch(
              { type: "start_sprint", id, revision: nextRevision },
              { teamId: scope },
            ),
          "Sprint started",
        );
        if (started) navigate(pathFor(id));
        else if (!sprint) navigate(`${pathFor(id)}/edit`, { replace: true });
      } else if (!sprint) navigate(`${pathFor(id)}/edit`, { replace: true });
      return id;
    } finally {
      setSaving(false);
    }
  };
  const preview = async () => {
    if (!sprint) return;
    const id = dirty ? await persist() : sprint.id;
    if (!id) return;
    setSaving(true);
    try {
      const result = await run(() =>
        dispatch(
          {
            type: "propose",
            sprintId: id,
            startDate,
            days: 28,
            trigger: "weekly",
          },
          { teamId: scope },
        ),
      );
      if (result) openPlan(result);
    } finally {
      setSaving(false);
    }
  };
  const back = () => {
    if (
      dirty &&
      !window.confirm("Leave without saving your latest sprint changes?")
    )
      return;
    navigate(sprint ? pathFor(sprint.id) : "/sprints");
  };
  const patchObjective = (id: string, patch: Partial<SprintObjective>) =>
    setObjectives((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const removeObjective = (id: string) => {
    setObjectives((items) => items.filter((item) => item.id !== id));
    setSelection((items) =>
      Object.fromEntries(
        Object.entries(items).map(([task, objective]) => [
          task,
          objective === id ? "" : objective,
        ]),
      ),
    );
    if (addTo === id)
      setAddTo(objectives.find((objective) => objective.id !== id)?.id ?? "");
  };
  return (
    <div className="page sprint-planner">
      <button className="text-button sprint-back" type="button" onClick={back}>
        <ArrowLeft size={15} />
        {sprint ? "Back to sprint" : "All sprints"}
      </button>
      <div className="page-heading">
        <div>
          <PageTitle help="Set a shared period, define outcomes, and select existing work. Save a draft before committing or reviewing calendar sessions.">
            {title}
          </PageTitle>
          <p className="sprint-planner-subtitle">
            {active
              ? "Plan work within the active sprint."
              : "Named automatically from the team and the start date’s ISO week."}
          </p>
        </div>
        <span className="sprint-state">{active ? "Active" : "Draft"}</span>
      </div>
      {conflict && (
        <div className="inline-info" role="alert">
          This sprint was updated elsewhere. Your unsaved work is still here.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => window.location.reload()}
          >
            Reload the saved version
          </button>
        </div>
      )}
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          void persist();
        }}
      >
        <section
          className="sprint-planner-section"
          aria-labelledby="sprint-period-heading"
        >
          <div className="sprint-section-heading">
            <span className="sprint-section-number">01</span>
            <div>
              <h2 id="sprint-period-heading">Shared period</h2>
              <p>
                Objectives share these dates. Each person keeps their own
                calendar approval.
              </p>
            </div>
          </div>
          <div className="sprint-period-fields">
            <label>
              Team
              <select
                aria-label="Sprint team"
                value={scope}
                disabled={!!sprint}
                onChange={(event) => {
                  setScope(event.target.value);
                  setSelection({});
                  setProjectFilter("all");
                  setObjectives((items) =>
                    items.map((item) => ({ ...item, leadId: actorId })),
                  );
                }}
              >
                {teams
                  .filter((item) => item.role !== "guest")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.kind === "personal" ? "Personal" : item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                required
                disabled={active}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                required
                min={startDate || undefined}
                max={startDate ? addDays(startDate, 27) : undefined}
                disabled={active}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          <p className="sprint-hint">
            Inclusive dates · {zone} · up to 28 days.
            {active
              ? " The name and dates stay fixed after starting."
              : " A multiweek sprint uses its starting week."}
          </p>
          <label>
            <span>
              Overall focus <span className="sprint-optional">(optional)</span>
            </span>
            <input
              aria-label="Overall focus"
              value={focus}
              maxLength={2000}
              placeholder="What connects the objectives for this period?"
              onChange={(event) => setFocus(event.target.value)}
            />
          </label>
        </section>
        <section
          className="sprint-planner-section"
          aria-labelledby="sprint-objectives-heading"
        >
          <div className="sprint-section-heading">
            <span className="sprint-section-number">02</span>
            <div>
              <h2 id="sprint-objectives-heading">Objectives</h2>
              <p>
                Describe the outcomes. Several people can contribute to each
                objective.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={objectives.length >= 20}
              onClick={() => {
                const objective = newObjective(actorId);
                setObjectives((items) => [...items, objective]);
                setAddTo(objective.id);
              }}
            >
              <Plus size={15} />
              Add objective
            </button>
          </div>
          <div className="sprint-objective-editor-list">
            {objectives.map((objective, index) => (
              <fieldset className="sprint-objective-editor" key={objective.id}>
                <legend>Objective {index + 1}</legend>
                <div className="sprint-objective-editor-top">
                  <label>
                    Outcome
                    <textarea
                      aria-label={`Objective ${index + 1}`}
                      rows={2}
                      maxLength={2000}
                      value={objective.title}
                      placeholder="What should be possible by the end?"
                      onChange={(event) =>
                        patchObjective(objective.id, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove objective ${index + 1}`}
                    title="Remove objective; its tasks stay in Other work"
                    disabled={objectives.length === 1}
                    onClick={() => removeObjective(objective.id)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="sprint-objective-editor-fields">
                  <label>
                    <span>
                      Success looks like{" "}
                      <span className="sprint-optional">(optional)</span>
                    </span>
                    <input
                      aria-label={`Success criteria for objective ${index + 1}`}
                      maxLength={2000}
                      value={objective.successCriteria}
                      placeholder="How will you assess the outcome?"
                      onChange={(event) =>
                        patchObjective(objective.id, {
                          successCriteria: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Lead
                    <select
                      aria-label={`Lead for objective ${index + 1}`}
                      value={objective.leadId ?? actorId}
                      onChange={(event) =>
                        patchObjective(objective.id, {
                          leadId: event.target.value,
                        })
                      }
                    >
                      {leads.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                          {member.id === actorId ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
        </section>
        <section
          className="sprint-planner-section"
          aria-labelledby="sprint-work-heading"
        >
          <div className="sprint-section-heading">
            <span className="sprint-section-number">03</span>
            <div>
              <h2 id="sprint-work-heading">Select existing work</h2>
              <p>
                Tasks keep their project, stage, and deadline. Each task is
                selected once.
              </p>
            </div>
          </div>
          <div className="sprint-planning-columns">
            <div className="sprint-available-panel">
              <h3>Available tasks</h3>
              <label className="sr-only" htmlFor="sprint-task-search">
                Find existing tasks
              </label>
              <input
                id="sprint-task-search"
                placeholder="Find tasks, projects, or people…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(8);
                }}
              />
              <div className="sprint-task-filters">
                <label>
                  Add to
                  <select
                    aria-label="Add selected tasks to"
                    value={addTo}
                    onChange={(event) => setAddTo(event.target.value)}
                  >
                    {objectives.map((objective, index) => (
                      <option key={objective.id} value={objective.id}>
                        {objective.title || `Objective ${index + 1}`}
                      </option>
                    ))}
                    <option value="">Other work</option>
                  </select>
                </label>
                <label>
                  Project
                  <select
                    aria-label="Filter available tasks by project"
                    value={projectFilter}
                    onChange={(event) => {
                      setProjectFilter(event.target.value);
                      setVisibleCount(8);
                    }}
                  >
                    <option value="all">All projects</option>
                    {data.projects
                      .filter(
                        (project) =>
                          !data.resourceTeams ||
                          data.resourceTeams[project.id] === scope,
                      )
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="sprint-available-tasks">
                {tasks.slice(0, visibleCount).map((task) => (
                  <label className="sprint-task-option" key={task.id}>
                    <input
                      type="checkbox"
                      checked={Object.hasOwn(selection, task.id)}
                      disabled={
                        !Object.hasOwn(selection, task.id) &&
                        selectedTasks.length >= 100
                      }
                      onChange={(event) =>
                        setSelection((items) => {
                          const next = { ...items };
                          if (event.target.checked) next[task.id] = addTo;
                          else delete next[task.id];
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{task.title}</strong>
                      <span>
                        <ProjectTag
                          project={data.projects.find(
                            (project) => project.id === task.projectId,
                          )}
                        />
                        {statusLabels[task.status]}
                      </span>
                      <small>
                        {members.find((member) => member.id === task.assigneeId)
                          ?.name ?? "Unassigned"}{" "}
                        ·{" "}
                        {task.remainingMinutes === undefined &&
                        task.estimatedMinutes === undefined
                          ? "No estimate"
                          : duration(
                              task.remainingMinutes ??
                                task.estimatedMinutes ??
                                0,
                            )}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {!tasks.length && (
                <p className="sprint-hint">
                  No matching available work. Tasks in another open sprint and
                  parents with subtasks are excluded.
                </p>
              )}
              {tasks.length > visibleCount && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setVisibleCount((count) => count + 8)}
                >
                  Show more tasks ({tasks.length - visibleCount})
                </button>
              )}
            </div>
            <div className="sprint-selected-panel">
              <div className="sprint-selected-heading">
                <h3>Selected work</h3>
                <span>{selectedTasks.length}/100</span>
              </div>
              {[
                ...objectives,
                { id: "", title: "Other work", successCriteria: "" },
              ].map((objective, index) => {
                const selected = selectedTasks.filter(
                  (task) => selection[task.id] === objective.id,
                );
                if (!objective.id && !selected.length) return null;
                return (
                  <section
                    className="sprint-selected-group"
                    key={objective.id}
                    aria-label={
                      objective.id
                        ? `Selected for objective ${index + 1}`
                        : "Other selected work"
                    }
                  >
                    <h4>
                      <Target size={14} />
                      {objective.title || `Objective ${index + 1}`}
                      <span>{selected.length}</span>
                    </h4>
                    {!selected.length && (
                      <p className="sprint-hint">
                        Choose this objective under “Add to” and select its
                        tasks.
                      </p>
                    )}
                    {selected.map((task) => (
                      <div className="sprint-selected-task" key={task.id}>
                        <strong>{task.title}</strong>
                        <div>
                          <select
                            aria-label={`Objective for ${task.title}`}
                            value={selection[task.id]}
                            onChange={(event) =>
                              setSelection((items) => ({
                                ...items,
                                [task.id]: event.target.value,
                              }))
                            }
                          >
                            {objectives.map((item, position) => (
                              <option key={item.id} value={item.id}>
                                {item.title || `Objective ${position + 1}`}
                              </option>
                            ))}
                            <option value="">Other work</option>
                          </select>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove ${task.title} from sprint`}
                            onClick={() =>
                              setSelection((items) => {
                                const next = { ...items };
                                delete next[task.id];
                                return next;
                              })
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
              <div className="sprint-planning-summary">
                <strong>
                  {readyTasks.length} tasks ready for calendar planning ·{" "}
                  {duration(remaining)} estimated
                </strong>
                <p>
                  {missingEstimates
                    ? `${missingEstimates} ready tasks need an estimate. `
                    : ""}
                  {selectedTasks.length - readyTasks.length} selected tasks are
                  outside execution stages. Availability and dependencies are
                  checked in the preview.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    !sprint ||
                    saving ||
                    !online ||
                    conflict ||
                    !readyTasks.length
                  }
                  onClick={() => void preview()}
                >
                  <CalendarDays size={16} />
                  Preview calendar plan
                </button>
                {!sprint && (
                  <small>
                    Save the draft to preview sessions. Calendar owners approve
                    separately.
                  </small>
                )}
              </div>
            </div>
          </div>
        </section>
        <footer className="sprint-planner-footer">
          <div>
            <span>
              {dirty
                ? "Unsaved changes"
                : sprint
                  ? active
                    ? "Changes saved"
                    : "Saved draft"
                  : "Not saved yet"}
            </span>
            {!ready && !active && (
              <small>
                Add an outcome and at least one task to each objective before
                starting.
              </small>
            )}
          </div>
          <div className="sprint-actions">
            <button
              type="submit"
              className="button secondary"
              disabled={saving || !online || conflict}
            >
              {saving ? "Saving…" : active ? "Save changes" : "Save draft"}
            </button>
            {!active && (
              <button
                type="button"
                className="button primary"
                disabled={saving || !online || conflict || !ready}
                onClick={() => void persist(true)}
              >
                <Flag size={15} />
                Start sprint
              </button>
            )}
            {active && (
              <button type="button" className="button primary" onClick={back}>
                <Check size={15} />
                Done
              </button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}
