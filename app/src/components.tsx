import { TaskHistory } from "./TaskHistory";
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
  MessageSquare,
  CornerDownLeft,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useData } from "./data";
import {
  type Task,
  type Project,
  type Command,
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
        <Dialog.Content className={cx("modal", wide && "wide")}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description ?? "Task and project details."}
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
              {done ? (
                <Check size={12} />
              ) : t.status === "in_progress" ? (
                <span />
              ) : null}
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
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI();
  const [saving, setSaving] = useState(false),
    [chosenProject, setChosenProject] = useState(
      projectId ?? state.workspace.inboxId,
    );
  useEffect(() => {
    if (open) setChosenProject(projectId ?? state.workspace.inboxId);
  }, [open, projectId, state.workspace.inboxId]);
  const project = state.projects.find((p) => p.id === chosenProject),
    team = state.resourceTeams?.[chosenProject];
  const availableMembers =
    (team ? state.teamMemberships?.[team] : state.members) ?? state.members;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const result = await run(
      () =>
        dispatch({
          type: "create_task",
          title: String(f.get("title")),
          description: String(f.get("description")),
          projectId: String(f.get("projectId")) || undefined,
          assigneeId: String(f.get("assigneeId")),
          ownerId: String(f.get("ownerId")),
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
        }),
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
      description="Capture what’s on your mind. The plan can come next."
    >
      <form onSubmit={submit} className="form">
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
        <label>
          Description <span className="optional">optional</span>
          <textarea
            name="description"
            rows={3}
            placeholder="Notes, links, or what a good outcome looks like…"
          />
        </label>
        <div className="form-grid">
          <label>
            Project
            <select
              name="projectId"
              aria-label="Project"
              value={chosenProject}
              onChange={(e) => setChosenProject(e.target.value)}
            >
              {state.projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Task owner
            <select
              name="ownerId"
              aria-label="Task owner"
              defaultValue={actorId}
            >
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Worker
            <select
              name="assigneeId"
              aria-label="Assignee"
              defaultValue={actorId}
            >
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === actorId ? "Me" : m.name}
                </option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
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
            <select name="priority" defaultValue="medium">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <TaskLabelField />
        <div className="form-note">
          <CornerDownLeft size={14} />
          Work outside a named project goes into Personal planning.
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
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Give your next project a home."
    >
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
  const taskPage = useRef<HTMLElement>(null);
  useEffect(() => {
    taskPage.current?.focus();
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
    taskMembers =
      (team ? state.teamMemberships?.[team] : state.members) ?? state.members;
  const children = state.tasks.filter((t) => t.parentId === task.id),
    activity = state.activities
      .filter((a) => a.taskId === task.id)
      .sort((a, b) => b.at - a.at);
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
            <label className="task-description">
              Description
              <textarea
                name="description"
                aria-label="Task description"
                rows={3}
                defaultValue={task.description}
                placeholder="What needs to happen? Add the context and the outcome you want."
              />
            </label>
            {task.status === "to_validate" && (
              <TaskValidation key={task.id} task={task} />
            )}
            <div className="task-editor-columns">
              <section className="task-properties" aria-label="Task properties">
                <h2>Details</h2>
                <div className="task-property-rows">
                  <label>
                    <span>Status</span>
                    <select
                      key={task.status}
                      name="status"
                      aria-label="Task status"
                      defaultValue={task.status}
                    >
                      {taskStatusOptions.map((key) => (
                        <option key={key} value={key}>
                          {statusLabels[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span title="Requests the work and validates its result">
                      Task owner
                    </span>
                    <select
                      aria-label="Task owner"
                      name="ownerId"
                      defaultValue={
                        task.ownerId ??
                        state.projects.find((p) => p.id === task.projectId)
                          ?.ownerId
                      }
                    >
                      {taskMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span title="Does the work; can also be the task owner">
                      Worker
                    </span>
                    <select
                      name="assigneeId"
                      aria-label="Assignee"
                      defaultValue={task.assigneeId ?? "unassigned"}
                    >
                      <option value="unassigned">Unassigned</option>
                      {taskMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Priority</span>
                    <select name="priority" defaultValue={task.priority}>
                      {["high", "medium", "low"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Project</span>
                    <select name="projectId" defaultValue={task.projectId}>
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
                    <span>Initial estimate (min)</span>
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
                <CollaboratorField task={task} />
                <TaskLabelField defaultValue={task.labels} />
              </section>
            </div>
            <div className="detail-save">
              <span className="muted">
                Calendar sessions never mark a task done.
              </span>
              <button className="button primary" disabled={!online}>
                Save changes
                <Check size={15} />
              </button>
            </div>
          </form>
          <div className="detail-section">
            <div className="section-line">
              <h3>Progress check-in</h3>
              <span className="muted">
                {duration(task.remainingMinutes ?? task.estimatedMinutes ?? 0)}{" "}
                left
              </span>
            </div>
            <form
              className="progress-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run(
                  () =>
                    dispatch({
                      type: "progress",
                      id: task.id,
                      remainingMinutes: Number(f.get("remaining")),
                      loggedMinutes: 0,
                      note: String(f.get("note")),
                    }),
                  "Progress recorded",
                );
              }}
            >
              <label>
                Remaining minutes
                <input
                  key={task.remainingMinutes}
                  name="remaining"
                  type="number"
                  min="0"
                  max="100000"
                  defaultValue={
                    task.remainingMinutes ?? task.estimatedMinutes ?? 0
                  }
                  required
                />
              </label>
              <label className="full">
                What moved forward?
                <input name="note" placeholder="Describe your progress" />
              </label>
              <button className="button secondary" disabled={!online}>
                Record progress
              </button>
            </form>
          </div>
          {!task.parentId && (
            <div className="detail-section">
              <div className="section-line">
                <h3>
                  Subtasks <span className="count">{children.length}</span>
                </h3>
                <button
                  className="text-button"
                  onClick={() => setSubtask(true)}
                >
                  <Plus size={14} />
                  Add subtask
                </button>
              </div>
              {children.length ? (
                <TaskRows
                  tasks={children}
                  onOpen={onOpen}
                  showProject={false}
                />
              ) : (
                <p className="muted">
                  Break a bigger task into smaller steps. Only leaf tasks count
                  toward workload.
                </p>
              )}
            </div>
          )}
          <div className="detail-section">
            <h3>Activity & notes</h3>
            <form
              className="comment-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const r = await run(() =>
                  dispatch({
                    type: "comment",
                    id: task.id,
                    body: String(f.get("comment")),
                  }),
                );
                if (r) form.reset();
              }}
            >
              <input
                aria-label="Add a comment"
                name="comment"
                required
                placeholder="Leave a note for your future self or your team…"
              />
              <button className="icon-button" aria-label="Post comment">
                <MessageSquare size={17} />
              </button>
            </form>
            <div className="activity-list">
              {activity.slice(0, 20).map((a) => (
                <div className="activity-item" key={a.id}>
                  <Avatar
                    name={
                      state.members.find((m) => m.id === a.actorId)?.name ??
                      "Former member"
                    }
                    small
                  />
                  <div>
                    <strong>
                      {state.members.find((m) => m.id === a.actorId)?.name ??
                        "Former member"}
                    </strong>
                    <p>{a.message}</p>
                  </div>
                  <time>
                    {new Date(a.at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </div>
              ))}
              {!activity.length && (
                <p className="muted">Your next update will appear here.</p>
              )}
            </div>
          </div>
          <TaskHistory taskId={task.id} />
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
      candidate.projectId === task.projectId &&
      !isArchivedTask(candidate),
  );
  return (
    <section className="dependency-editor">
      <h3>Dependencies</h3>
      <p>Finish these tasks before starting this one.</p>
      <div className="dependency-graph">
        <div className="dependency-inputs">
          {selected.length ? (
            selected.map((id) => {
              const item = state.tasks.find((t) => t.id === id);
              if (!item) return null;
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
                    <small>{statusLabels[item.status]}</small>
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
              {candidate.title} · {statusLabels[candidate.status]}
            </option>
          ))}
      </select>
      {selected.length > 0 && (
        <small>
          Green: completed · Yellow: underway or awaiting validation · Red:
          waiting to start. Circular links are rejected when saved.
        </small>
      )}
    </section>
  );
}
function CollaboratorField({ task }: { task: Task }) {
  const { state } = useData();
  const [selected, setSelected] = useState(task.collaborators);
  const team = state.resourceTeams?.[task.id],
    members = team
      ? (state.teamMemberships?.[team] ?? state.members)
      : state.members;
  return (
    <section className="collaborator-editor">
      <h3>Collaborators</h3>
      <div className="collaborator-chips">
        {selected.map((id) => {
          const member = members.find((m) => m.id === id);
          return (
            member && (
              <span className="collaborator-chip" key={id}>
                <input type="hidden" name="collaborator" value={id} />
                <Avatar name={member.name} color={member.color} small />
                <span>{member.name}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={"Remove collaborator " + member.name}
                  onClick={() => setSelected(selected.filter((x) => x !== id))}
                >
                  <X size={12} />
                </button>
              </span>
            )
          );
        })}
        {!selected.length && (
          <span className="muted">No collaborators added</span>
        )}
      </div>
      <select
        aria-label="Add collaborator"
        value=""
        onChange={(e) => {
          if (e.target.value) setSelected([...selected, e.target.value]);
        }}
      >
        <option value="">Add a person…</option>
        {members
          .filter((m) => m.id !== task.assigneeId && !selected.includes(m.id))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
      <small>
        The worker is accountable for execution; the task owner reviews the
        outcome.
      </small>
    </section>
  );
}
