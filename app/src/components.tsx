import { TaskArtifacts, TaskActivity } from "./TaskCollaboration";
import { PeoplePicker } from "./PeoplePicker";
import { MentionInput } from "./Mentions";
import { InfoTip } from "./InfoTip";
import { taskPeople } from "../shared/people";
import { PrioritySelect, StatusSelect } from "./PrioritySelect";
import { resourceRole } from "../shared/teams";
import { canEditTask, isArchivedTask } from "../shared/workflow";
import { standaloneTaskPath } from "../shared/ids";
import { projectStyle } from "./projectColors";
import { TaskLabels, TaskLabelField } from "./TaskLabels";
import { parseTaskLabels } from "../shared/taskLabels";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ArrowLeft,
  Link2,
  Plus,
  ArrowUpRight,
  Check,
  Clock3,
  ChevronDown,
  Flag,
  CornerDownLeft,
  AlertCircle,
  ChevronRight,
  Circle,
} from "lucide-react";
import { useData } from "./data";
import {
  type Task,
  type Project,
  type Command,
  type Member,
  type Mention,
  statusLabels,
  taskWorkflow,
  taskStatusOptions,
} from "../shared/model";
import { dateInZone, addDays, deadlineAt } from "../shared/scheduler";
export const cx = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(" ");
export const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? " " + (minutes % 60) + "m" : ""}`
    : `${minutes}m`;
export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function Avatar({
  name,
  color = "olive",
  small = false,
}: {
  name: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <span title={name} className={cx("avatar", color, small && "small")}>
      {initials(name)}
    </span>
  );
}
export function dueLabel(deadline?: string) {
  if (!deadline) return "No deadline";
  const date = deadline.slice(0, 10),
    today = dateInZone(Date.now(), "America/Chicago");
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
const Ui = createContext<{
  notify: (text: string, error?: boolean) => void;
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}>({ notify: () => {}, run: async () => undefined });
export function useUI() {
  return useContext(Ui);
}
export function UIProvider({ children }: { children: ReactNode }) {
  const [toast, set] = useState<{ text: string; error?: boolean }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string, error = false) => {
    set({ text, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set(undefined), error ? 9000 : 4500);
  };
  return (
    <Ui.Provider
      value={{
        notify,
        run: async (fn, success) => {
          try {
            const r = await fn();
            if (success) notify(success);
            return r;
          } catch (e) {
            notify(
              e instanceof Error
                ? e.message
                : "This action could not be saved. Please try again.",
              true,
            );
            return undefined;
          }
        },
      }}
    >
      {children}
      {toast && (
        <div
          className={cx("toast", toast.error && "error")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => set(undefined)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </Ui.Provider>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={cx("modal", wide && "wide")}
          onEscapeKeyDown={(event) => {
            if (
              document.activeElement?.getAttribute("aria-expanded") === "true"
            )
              event.preventDefault();
          }}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description
                className={description ? undefined : "sr-only"}
              >
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">✳</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function ProjectTag({ project }: { project?: Project }) {
  return project ? (
    <span
      className={cx("project-tag", project.color)}
      style={projectStyle(project.color)}
    >
      <i />
      {project.title}
    </span>
  ) : null;
}
export function TaskRows({
  tasks,
  onOpen,
  showProject = true,
}: {
  tasks: Task[];
  onOpen: (id: string) => void;
  showProject?: boolean;
}) {
  const { state, dispatch, actorId, online } = useData(),
    { run } = useUI();
  return (
    <div className={cx("task-rows", !showProject && "compact-rows")}>
      {tasks.map((t) => {
        const p = state.projects.find((p) => p.id === t.projectId),
          owner = state.members.find((m) => m.id === t.assigneeId),
          done = t.status === "done",
          overdue =
            !done &&
            deadlineAt(
              t.deadline,
              state.members.find((m) => m.id === (t.assigneeId ?? actorId))
                ?.preferences.timezone ?? "UTC",
            ) < Date.now();
        return (
          <div className={cx("task-row", done && "completed")} key={t.id}>
            <button
              className={cx(
                "task-check",
                done && "checked",
                t.status === "in_progress" && "in-progress",
              )}
              aria-label={`${done ? "Reopen" : "Complete"} ${t.title}`}
              disabled={
                !online || isArchivedTask(t) || !canEditTask(state, t, actorId)
              }
              onClick={() =>
                run(
                  () =>
                    dispatch({
                      type: "update_task",
                      id: t.id,
                      patch: {
                        status: done
                          ? "todo"
                          : (t.ownerId ?? p?.ownerId) !== actorId &&
                              !["owner", "admin"].includes(
                                resourceRole(state, t.id, actorId) ?? "",
                              )
                            ? "to_validate"
                            : "done",
                      },
                    }),
                  done ? "Task reopened" : "Task completed",
                )
              }
            >
              <span className="task-check-glyph">
                {done ? (
                  <Check size={12} />
                ) : t.status === "in_progress" ? (
                  <span />
                ) : null}
              </span>
            </button>
            <button
              className="task-main"
              aria-label={t.title}
              onClick={() => onOpen(t.id)}
            >
              <span className="task-title">{t.title}</span>
              <TaskLabels labels={t.labels} limit={2} />
              {t.brainstorm && (
                <span className="task-label">To Brainstorm</span>
              )}
            </button>
            {showProject && (
              <div className="task-project-cell">
                <ProjectTag project={p} />
              </div>
            )}
            <span
              className={cx("priority-mark", t.priority)}
              title={`${t.priority} priority`}
            >
              <Flag size={13} />
              <span>{t.priority}</span>
            </span>
            <span className="task-effort">
              <Clock3 size={12} />
              {t.remainingMinutes === undefined
                ? "—"
                : duration(t.remainingMinutes)}
            </span>
            <span className={cx("task-due", overdue && "overdue")}>
              {overdue && <span className="tiny-dot" />}
              {dueLabel(t.deadline)}
            </span>
            {owner ? (
              <Avatar name={owner.name} color={owner.color} small />
            ) : (
              <span className="unassigned" title="Unassigned">
                —
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function GroupedTasks({
  tasks,
  onOpen,
  onAdd,
}: {
  tasks: Task[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const groups = taskWorkflow;
  return (
    <div className="grouped-tasks">
      <div className="task-table-head">
        <span>Task</span>
        <span>Project</span>
        <span>Priority</span>
        <span>Remaining</span>
        <span>Due date</span>
        <span>Owner</span>
      </div>
      {groups.map((status) => {
        const rows = tasks.filter((t) => t.status === status);

        return (
          <section
            className="task-group"
            key={status}
            aria-label={statusLabels[status] + " tasks"}
          >
            <div className="task-group-heading">
              <span className={cx("status-label", status)}>
                {statusLabels[status]}
              </span>
              <span className="group-count">{rows.length}</span>
            </div>
            <TaskRows tasks={rows} onOpen={onOpen} />
            {status === "todo" && (
              <button
                className="add-table-task"
                aria-label="Add task"
                onClick={onAdd}
              >
                <Plus size={14} /> New task
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
export function TaskForm({
  open,
  onClose,
  projectId,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  parentId?: string;
}) {
  const {
      state: scopedState,
      captureState,
      actorId,
      dispatch,
      online,
      teams,
      teamId,
    } = useData(),
    { run } = useUI();
  const state = captureState ?? scopedState;
  const [saving, setSaving] = useState(false),
    [chosenProject, setChosenProject] = useState(
      projectId ?? scopedState.workspace.inboxId,
    );
  const [description, setDescription] = useState(""),
    [descriptionMentions, setDescriptionMentions] = useState<Mention[]>([]),
    [owner, setOwner] = useState([actorId]),
    [worker, setWorker] = useState([actorId]),
    [collaborators, setCollaborators] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      const personal = state.teams?.find((t) => t.kind === "personal");
      setChosenProject(
        projectId ??
          (teamId === "all" && personal
            ? personal.inboxId
            : scopedState.workspace.inboxId),
      );
      setDescription("");
      setDescriptionMentions([]);
      setOwner([actorId]);
      setWorker([actorId]);
      setCollaborators([]);
    }
  }, [open, projectId, scopedState.workspace.inboxId]);
  const team = state.resourceTeams?.[chosenProject] ?? teams[0]?.id;
  const availableMembers = taskPeople(state, chosenProject);
  const scopeTeams = teams.filter((t) =>
    state.projects.some(
      (p) => (state.resourceTeams?.[p.id] ?? teams[0]?.id) === t.id,
    ),
  );
  const changeProject = (id: string) => {
    const allowed = new Set(taskPeople(state, id).map((m) => m.id));
    setChosenProject(id);
    setOwner((current) =>
      current.filter((id) => allowed.has(id)).length
        ? current.filter((id) => allowed.has(id))
        : [actorId],
    );
    setWorker((current) =>
      current.filter((id) => allowed.has(id) || id === "unassigned").length
        ? current
        : [actorId],
    );
    setCollaborators((current) => current.filter((id) => allowed.has(id)));
    setDescriptionMentions((current) =>
      current.filter((m) => allowed.has(m.memberId)),
    );
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const result = await run(
      () =>
        dispatch(
          {
            type: "create_task",
            title: String(f.get("title")),
            description: String(f.get("description")),
            descriptionMentions,
            projectId: chosenProject,
            assigneeId: String(f.get("assigneeId")),
            ownerId: String(f.get("ownerId")),
            collaborators,
            status: f.get("status") as "backlog" | "todo",
            startDate: String(f.get("startDate")) || undefined,
            priority: f.get("priority") as Task["priority"],
            estimatedMinutes: f.get("estimate")
              ? Number(f.get("estimate"))
              : undefined,
            deadline: String(f.get("deadline")) || undefined,
            dependencies: [],
            labels: parseTaskLabels(String(f.get("labels") ?? "")),
            parentId,
          },
          { teamId: team },
        ),
      parentId ? "Subtask added" : "Task captured. One less thing to remember.",
    );
    setSaving(false);
    if (result) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={parentId ? "Add a subtask" : "New task"}
    >
      <form onSubmit={submit} className="form">
        <label>
          Task belongs to
          <select
            aria-label="Task belongs to"
            value={team}
            disabled={!!parentId}
            onChange={(e) => {
              const target =
                state.teams?.find((t) => t.id === e.target.value)?.inboxId ??
                state.projects.find(
                  (p) =>
                    (state.resourceTeams?.[p.id] ?? teams[0]?.id) ===
                      e.target.value && !p.archived,
                )?.id;
              if (target) changeProject(target);
            }}
          >
            {scopeTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.kind === "personal"
                  ? "Personal · only you"
                  : t.name + " · team"}
              </option>
            ))}
          </select>
        </label>
        <p className="task-scope-note">
          {teams.find((t) => t.id === team)?.kind === "personal"
            ? "Private to you. Choose a team for shared work."
            : "Shared within this team, following the selected project’s access."}
        </p>
        <label>
          What needs to get done?
          <input
            autoFocus
            name="title"
            required
            maxLength={180}
            placeholder="e.g. Sketch the first onboarding flow"
          />
        </label>
        <div>
          <label>
            Description <span className="optional">optional</span>
          </label>
          <MentionInput
            label="Description"
            name="description"
            value={description}
            mentions={descriptionMentions}
            onChange={(text, mentions) => {
              setDescription(text);
              setDescriptionMentions(mentions);
            }}
            members={availableMembers}
            placeholder="Notes, links, or what a good outcome looks like…"
          />
        </div>
        <div className="form-grid">
          <label>
            Project
            <select
              name="projectId"
              aria-label="Project"
              value={chosenProject}
              disabled={!!parentId}
              onChange={(e) => changeProject(e.target.value)}
            >
              {state.projects
                .filter(
                  (p) =>
                    !p.archived &&
                    (state.resourceTeams?.[p.id] ?? teams[0]?.id) === team,
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <PeoplePicker
            label="Owner"
            name="ownerId"
            members={availableMembers}
            value={owner}
            onChange={setOwner}
          />
          <PeoplePicker
            label="Worker"
            name="assigneeId"
            members={availableMembers}
            value={worker}
            onChange={setWorker}
            allowUnassigned
          />
          <label>
            Initial stage
            <select
              name="status"
              aria-label="Initial stage"
              defaultValue="todo"
            >
              <option value="backlog">Backlog</option>
              <option value="todo">To do</option>
            </select>
          </label>
          <label>
            Planned start
            <input name="startDate" type="date" />
          </label>
          <label>
            Estimated minutes
            <input
              name="estimate"
              type="number"
              min="0"
              max="100000"
              step="15"
              placeholder="e.g. 60"
            />
          </label>
          <label>
            Deadline <span className="optional">optional</span>
            <input name="deadline" type="date" />
          </label>
          <label>
            Priority
            <PrioritySelect />
          </label>
        </div>
        <PeoplePicker
          label="Collaborators"
          name="collaborator"
          members={availableMembers}
          value={collaborators}
          onChange={setCollaborators}
          multiple
        />
        <TaskLabelField />
        <div className="form-note">
          <CornerDownLeft size={14} />
          Work outside a named project goes into this scope’s planning project.
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving || !online}>
            <Plus size={15} />
            {saving ? "Saving…" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { dispatch, teams, teamId } = useData(),
    { run } = useUI();
  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const result = await run(
            () =>
              dispatch(
                {
                  type: "create_project",
                  title: String(f.get("title")),
                  description: String(f.get("description")),
                  color: f.get("color") as "olive",
                  deadline: String(f.get("deadline")) || undefined,
                  startDate: String(f.get("startDate")) || undefined,
                  private: f.get("private") === "on",
                },
                {
                  teamId: String(
                    f.get("teamId") ||
                      (teamId === "all" ? teams[0]?.id : teamId),
                  ),
                },
              ),
            "Project created",
          );
          if (result) onClose();
        }}
      >
        {teamId === "all" && teams.length > 1 && (
          <label>
            Team
            <select name="teamId" required>
              {teams
                .filter((team) => team.role !== "guest")
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Project name
          <input
            name="title"
            autoFocus
            required
            placeholder="What are you working toward?"
            maxLength={180}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            rows={3}
            placeholder="A sentence about the outcome…"
          />
        </label>
        <div className="form-grid">
          <label>
            Color
            <select name="color">
              <option value="olive">Olive</option>
              <option value="clay">Terracotta</option>
              <option value="blue">Slate blue</option>
              <option value="gold">Ochre</option>
              <option value="plum">Plum</option>
            </select>
          </label>
          <label>
            Planned start
            <input name="startDate" type="date" />
          </label>
          <label>
            Delivery date
            <input name="deadline" type="date" />
          </label>
        </div>
        <label className="check-label">
          <input type="checkbox" name="private" />
          Private project · only explicitly added people
        </label>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">
            Create project
            <ArrowUpRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TaskDetail({
  id,
  onClose,
  onOpen,
}: {
  id: string | undefined;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { state, dispatch, actorId, online } = useData(),
    { run } = useUI();
  const task = state.tasks.find((t) => t.id === id);
  const [subtask, setSubtask] = useState(false);
  const [editingProject, setEditingProject] = useState(task?.projectId ?? "");
  const taskPage = useRef<HTMLElement>(null);
  useEffect(() => {
    taskPage.current?.focus();
    if (task) setEditingProject(task.projectId);
  }, [task?.id]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  if (!task) return null;
  const team = state.resourceTeams?.[task.id],
    taskMembers = taskPeople(state, editingProject || task.projectId);
  const homeTeam =
    state.teams?.find((entry) => entry.id === team) ?? state.workspace;
  const children = state.tasks.filter((t) => t.parentId === task.id);
  const patch = (patch: Extract<Command, { type: "update_task" }>["patch"]) =>
    run(
      () => dispatch({ type: "update_task", id: task.id, patch }),
      "Task updated",
    );
  return (
    <>
      <article
        className="task-page"
        aria-label="Task details"
        tabIndex={-1}
        ref={taskPage}
      >
        <header className="task-page-toolbar">
          <button className="text-button task-back" onClick={onClose}>
            <ArrowLeft size={16} />
            All tasks
          </button>
          <span className="task-page-project">
            <span className="task-home-scope">
              {homeTeam.kind === "personal" ? "Personal" : homeTeam.name} ·{" "}
            </span>
            {task.parentId && (
              <button
                type="button"
                className="text-button parent-task-link"
                onClick={() => onOpen(task.parentId!)}
                aria-label="Open parent task"
              >
                {state.tasks.find((item) => item.id === task.parentId)?.title ??
                  "Parent task"}
                <ChevronRight size={13} />
              </button>
            )}
            {state.projects.find((p) => p.id === task.projectId)?.title ??
              "Task"}
          </span>
          <div className="task-page-actions">
            <button
              className="text-button"
              onClick={() =>
                void run(
                  () =>
                    navigator.clipboard.writeText(
                      location.origin + standaloneTaskPath(task.id),
                    ),
                  "Task link copied",
                )
              }
            >
              <Link2 size={16} />
              <span>Copy link</span>
            </button>
            <button
              className="icon-button"
              aria-label="Close task"
              title="Close task (Esc)"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <div className="task-page-content">
          <h1 className="sr-only">{task.title}</h1>
          <form
            className="form task-editor-form"
            key={task.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await patch({
                title: String(f.get("title")),
                milestone: f.get("milestone") === "on",
                description: String(f.get("description")),
                descriptionMentions: JSON.parse(
                  String(f.get("descriptionMentions") ?? "[]"),
                ),
                assigneeId: String(f.get("assigneeId")),
                ownerId: String(f.get("ownerId")),
                brainstorm: f.get("brainstorm") === "on",
                reviewDate: String(f.get("reviewDate")),
                status: f.get("status") as Task["status"],
                priority: f.get("priority") as Task["priority"],
                deadline: String(f.get("deadline")),
                startDate: String(f.get("startDate")),
                collaborators: f.getAll("collaborator").map(String),
                labels: parseTaskLabels(String(f.get("labels") ?? "")),
                estimatedMinutes: f.get("estimate")
                  ? Number(f.get("estimate"))
                  : undefined,
                projectId: String(f.get("projectId")),
                dependencies: f.getAll("dependency").map(String),
              });
            }}
          >
            <textarea
              aria-label="Task title"
              className="task-title-input"
              name="title"
              rows={1}
              defaultValue={task.title}
              required
              maxLength={180}
            />
            <div className="task-description">
              <div className="section-title-group">
                <label>Description</label>
                <InfoTip label="About task mentions">
                  Type @ and search by name, username, or email. Selected people
                  are notified when you save.
                </InfoTip>
              </div>
              <TaskDescription
                key={task.id}
                task={task}
                members={taskMembers}
              />
            </div>
            {!task.parentId && (
              <section className="task-subtasks" aria-label="Subtasks">
                {children.length > 0 && <h2>Subtasks</h2>}
                {children.length > 0 && (
                  <div className="subtask-list">
                    {children.map((child) => (
                      <button
                        type="button"
                        key={child.id}
                        className="subtask-row"
                        onClick={() => onOpen(child.id)}
                      >
                        <span className={"subtask-status " + child.status}>
                          {child.status === "done" ? (
                            <Check size={13} />
                          ) : (
                            <Circle size={13} />
                          )}
                        </span>
                        <span className="subtask-title">{child.title}</span>
                        <span className="subtask-stage">
                          {statusLabels[child.status]}
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSubtask(true)}
                >
                  <Plus size={14} />
                  Add subtask
                </button>
              </section>
            )}
            <TaskArtifacts task={task} placement="description" />
            {task.status === "to_validate" && (
              <TaskValidation key={task.id} task={task} />
            )}
            <div className="task-editor-columns">
              <section className="task-properties" aria-label="Task properties">
                <h2>Details</h2>
                <div className="task-property-rows">
                  <label>
                    <span>Status</span>
                    <StatusSelect
                      key={task.status}
                      defaultValue={task.status}
                    />
                  </label>
                  <TaskPersonField
                    key={"owner:" + task.id + editingProject}
                    label="Owner"
                    name="ownerId"
                    members={taskMembers}
                    initial={
                      task.ownerId ??
                      state.projects.find((p) => p.id === task.projectId)
                        ?.ownerId ??
                      actorId
                    }
                  />
                  <TaskPersonField
                    key={"worker:" + task.id + editingProject}
                    label="Worker"
                    name="assigneeId"
                    members={taskMembers}
                    initial={task.assigneeId ?? "unassigned"}
                    allowUnassigned
                  />
                  <label>
                    <span>Priority</span>
                    <PrioritySelect defaultValue={task.priority} />
                  </label>
                  <label>
                    <span>Project</span>
                    <select
                      name="projectId"
                      value={editingProject || task.projectId}
                      onChange={(e) => setEditingProject(e.target.value)}
                    >
                      {state.projects
                        .filter(
                          (p) =>
                            !p.archived &&
                            (!team || state.resourceTeams?.[p.id] === team),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>Planned start</span>
                    <input
                      name="startDate"
                      type="date"
                      defaultValue={task.startDate}
                    />
                  </label>
                  <label>
                    <span>Original deadline</span>
                    <input
                      name="deadline"
                      type="date"
                      defaultValue={task.deadline?.slice(0, 10)}
                    />
                  </label>
                  <label>
                    <span>Planning estimate (min)</span>
                    <input
                      name="estimate"
                      type="number"
                      min="0"
                      max="100000"
                      defaultValue={task.estimatedMinutes}
                    />
                  </label>
                </div>
                <details className="task-planning-options">
                  <summary>Planning options</summary>
                  <div className="form-grid">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="brainstorm"
                        defaultChecked={task.brainstorm}
                      />
                      To Brainstorm · keep this backlog idea for later
                    </label>
                    <label>
                      Review idea on
                      <input
                        name="reviewDate"
                        type="date"
                        defaultValue={task.reviewDate}
                      />
                    </label>
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="milestone"
                      defaultChecked={task.milestone}
                    />
                    Project milestone
                  </label>
                </details>
              </section>
              <section
                className="task-relationships"
                aria-label="Task connections"
              >
                <DependencyField task={task} openTask={onOpen} />
                <CollaboratorField
                  key={task.id + editingProject + task.collaborators.join(",")}
                  task={task}
                  members={taskMembers}
                />
                <TaskLabelField defaultValue={task.labels} />
              </section>
            </div>
            <div className="detail-save">
              <button className="button primary" disabled={!online}>
                Save changes
                <Check size={15} />
              </button>
            </div>
          </form>
          <TaskArtifacts task={task} placement="task" />
          <TaskActivity key={"activity:" + task.id} task={task} />
        </div>
      </article>
      <TaskForm
        open={subtask}
        onClose={() => setSubtask(false)}
        projectId={task.projectId}
        parentId={task.id}
      />
    </>
  );
}

function TaskValidation({ task }: { task: Task }) {
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI();
  const [reason, setReason] = useState("");
  const ownerId =
    task.ownerId ??
    state.projects.find((p) => p.id === task.projectId)?.ownerId;
  const reviewer = state.members.find((m) => m.id === ownerId);
  const allowed =
    ownerId === actorId ||
    ["owner", "admin"].includes(resourceRole(state, task.id, actorId) ?? "");
  return (
    <section className="task-validation">
      <h3>Awaiting validation</h3>
      <p>
        {reviewer?.name ?? "The task owner"} reviews this work. Approval
        completes the task; returning it sends the worker your reason.
      </p>
      {allowed && (
        <>
          <label>
            Reason for returning
            <textarea
              aria-label="Reason for returning"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Describe the changes needed…"
            />
          </label>
          <div className="integration-actions">
            <button
              type="button"
              className="button primary"
              disabled={!online}
              onClick={() =>
                run(
                  () =>
                    dispatch({
                      type: "review_task",
                      id: task.id,
                      decision: "approve",
                    }),
                  "Task validated and completed",
                )
              }
            >
              Approve & complete
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!online || !reason.trim()}
              onClick={() =>
                run(
                  () =>
                    dispatch({
                      type: "review_task",
                      id: task.id,
                      decision: "return",
                      reason,
                    }),
                  "Returned to In progress; worker notified",
                )
              }
            >
              Return for changes
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DependencyField({
  task,
  openTask,
}: {
  task: Task;
  openTask: (id: string) => void;
}) {
  const { state } = useData();
  const [selected, setSelected] = useState(task.dependencies);
  const choices = state.tasks.filter(
    (candidate) =>
      candidate.id !== task.id &&
      state.resourceTeams?.[candidate.id] === state.resourceTeams?.[task.id] &&
      !isArchivedTask(candidate),
  );
  return (
    <section className="dependency-editor">
      <div className="section-title-group">
        <h3>Dependencies</h3>
        <InfoTip label="About dependencies">
          Finish these tasks before starting this one. Choose tasks from any
          project you can access in the same team. Green means completed; yellow
          means in progress or awaiting validation; red means waiting to start.
          Circular links are rejected when saved.
        </InfoTip>
      </div>
      <div className="dependency-graph">
        <div className="dependency-inputs">
          {selected.length ? (
            selected.map((id) => {
              const item = state.tasks.find((t) => t.id === id);
              if (!item)
                return (
                  <div className="dependency-node" key={id}>
                    <input type="hidden" name="dependency" value={id} />
                    <span className="muted">
                      Restricted or unavailable prerequisite
                    </span>
                  </div>
                );
              const signal =
                item.status === "done"
                  ? "complete"
                  : ["in_progress", "to_validate"].includes(item.status)
                    ? "underway"
                    : "waiting";
              return (
                <div className={"dependency-node " + signal} key={id}>
                  <input type="hidden" name="dependency" value={id} />
                  <span className="dependency-node-dot" />
                  <button
                    type="button"
                    className="dependency-name"
                    onClick={() => openTask(id)}
                  >
                    <strong>{item.title}</strong>
                    <small>
                      {
                        state.projects.find((p) => p.id === item.projectId)
                          ?.title
                      }
                      {" · "}
                      {statusLabels[item.status]}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={"Remove dependency " + item.title}
                    onClick={() =>
                      setSelected(selected.filter((x) => x !== id))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            <span className="muted">No dependencies</span>
          )}
        </div>
        {selected.length > 0 && (
          <>
            <span className="dependency-connector" aria-hidden="true">
              →
            </span>
            <div className="dependency-current">This task</div>
          </>
        )}
      </div>
      <select
        aria-label="Add dependency"
        value=""
        onChange={(e) => {
          if (e.target.value) setSelected([...selected, e.target.value]);
        }}
      >
        <option value="">Add a dependency…</option>
        {choices
          .filter((candidate) => !selected.includes(candidate.id))
          .map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title} ·{" "}
              {state.projects.find((p) => p.id === candidate.projectId)?.title}{" "}
              · {statusLabels[candidate.status]}
            </option>
          ))}
      </select>
    </section>
  );
}
function TaskDescription({ task, members }: { task: Task; members: Member[] }) {
  const [text, setText] = useState(task.description),
    [mentions, setMentions] = useState(task.descriptionMentions ?? []);
  return (
    <MentionInput
      label="Task description"
      hideHint
      name="description"
      value={text}
      mentions={mentions.filter((m) =>
        members.some((person) => person.id === m.memberId),
      )}
      members={members}
      onChange={(text, mentions) => {
        setText(text);
        setMentions(mentions);
      }}
      placeholder="What needs to happen? Add context or @mention a teammate."
    />
  );
}
function TaskPersonField({
  label,
  name,
  members,
  initial,
  allowUnassigned,
}: {
  label: string;
  name: string;
  members: Member[];
  initial: string;
  allowUnassigned?: boolean;
}) {
  const [value, setValue] = useState([
    members.some((m) => m.id === initial) || initial === "unassigned"
      ? initial
      : allowUnassigned
        ? "unassigned"
        : (members[0]?.id ?? ""),
  ]);
  return (
    <PeoplePicker
      label={label}
      name={name}
      members={members}
      value={value}
      onChange={setValue}
      allowUnassigned={allowUnassigned}
    />
  );
}
function CollaboratorField({
  task,
  members,
}: {
  task: Task;
  members: Member[];
}) {
  const [selected, setSelected] = useState(
    task.collaborators.filter((id) => members.some((m) => m.id === id)),
  );
  return (
    <section className="collaborator-editor">
      <PeoplePicker
        label="Collaborators"
        name="collaborator"
        members={members}
        value={selected}
        onChange={setSelected}
        multiple
        help="Collaborators can comment and receive updates. The worker does the work; the owner validates the outcome."
      />
    </section>
  );
}
