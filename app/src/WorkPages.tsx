import { resourceRole } from "../shared/teams";
import { PageTitle } from "./InfoTip";
import { ResponsiveFilters } from "./ResponsiveFilters";
import { ProjectTimeline } from "./ProjectTimeline";
import { TaskArchive } from "./TaskArchive";
import { isArchivedTask, isOpenTask } from "../shared/workflow";
import { TaskBoard } from "./TaskBoard";
import { normalizeTaskLabels, taskLabelKey } from "../shared/taskLabels";
import { projectPath } from "../shared/ids";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Clock3,
  CalendarDays,
  MoreHorizontal,
  Globe2,
  BookOpen,
  PenTool,
  Folder,
  Inbox,
  Check,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Users,
  Archive,
  CheckCircle2,
  Leaf,
  MoveUpRight,
  Sun,
  ChevronRight,
  Star,
} from "lucide-react";
import { useData } from "./data";
import {
  TaskRows,
  GroupedTasks,
  ProjectTag,
  Avatar,
  Empty,
  Modal,
  useUI,
  duration,
  dueLabel,
  cx,
} from "./components";
import {
  type Task,
  type Project,
  statusLabels,
  taskStatusOptions,
} from "../shared/model";
import { dateInZone, deadlineAt, MINUTE, addDays } from "../shared/scheduler";
export interface WorkProps {
  openTask: (id: string) => void;
  addTask: (projectId?: string) => void;
  addProject: () => void;
  openPlan: (id: string) => void;
}
const icons = {
  globe: Globe2,
  book: BookOpen,
  pen: PenTool,
  inbox: Inbox,
  folder: Folder,
  calendar: CalendarDays,
};
export function ProjectIcon({ project }: { project: Project }) {
  const Icon = icons[project.icon as keyof typeof icons] ?? Folder;
  return (
    <span className={cx("project-icon", project.color)}>
      <Icon size={21} strokeWidth={1.6} />
    </span>
  );
}
export function ProjectCard({ project }: { project: Project }) {
  const { state } = useData(),
    tasks = state.tasks.filter(
      (t) => t.projectId === project.id && !isArchivedTask(t),
    ),
    done = tasks.filter((t) => t.status === "done").length,
    progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    owner = state.members.find((m) => m.id === project.ownerId);
  return (
    <div className="project-card-row">
      <Link
        className="project-card"
        to={projectPath(project.id)}
        aria-label={project.title}
      >
        <div className="project-card-top">
          <ProjectIcon project={project} />
          <ArrowUpRight size={16} />
        </div>
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <div className="project-progress">
          <span>
            {done} of {tasks.length} tasks
          </span>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track">
          <i className={project.color} style={{ width: progress + "%" }} />
        </div>
        <div className="project-card-footer">
          <div className="avatar-stack">
            {project.memberIds.slice(0, 3).map((id) => {
              const m = state.members.find((m) => m.id === id);
              return m ? (
                <Avatar key={id} name={m.name} color={m.color} small />
              ) : null;
            })}
          </div>
          <span>
            {project.deadline
              ? dueLabel(project.deadline)
              : owner?.name.split(" ")[0] + "’s project"}
          </span>
        </div>
      </Link>
      <ProjectFavoriteButton project={project} />
    </div>
  );
}
export function ProjectFavoriteButton({ project }: { project: Project }) {
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI(),
    [saving, setSaving] = useState(false);
  const favorite =
    state.members
      .find((m) => m.id === actorId)
      ?.favoriteProjectIds?.includes(project.id) ?? false;
  return (
    <button
      className="icon-button project-favorite"
      aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${project.title}`}
      aria-pressed={favorite}
      title={favorite ? "Remove from favorites" : "Add to favorites"}
      disabled={!online || saving}
      onClick={async () => {
        setSaving(true);
        try {
          await run(
            () =>
              dispatch({
                type: "favorite_project",
                projectId: project.id,
                favorite: !favorite,
              }),
            favorite ? "Removed from favorites" : "Added to favorites",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <Star size={18} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}
export function TasksPage(props: WorkProps) {
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI();
  const [params, setParams] = useSearchParams();
  const view = ["board", "archive"].includes(params.get("view") ?? "")
    ? params.get("view")!
    : "list";
  const search = params.get("search") ?? "",
    status = params.get("status") ?? "all",
    priority = params.get("priority") ?? "all",
    assignee = params.get("assignee") ?? "all",
    project = state.projects.some((p) => p.id === params.get("project"))
      ? params.get("project")!
      : "all",
    labelFilter = params.get("tag") ?? params.get("label") ?? "all",
    deadline = params.get("deadline") ?? "all",
    sort = params.get("sort") ?? "deadline";
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(window.location.search);
    if (key === "tag") next.delete("label");
    next.set(key, value);
    setParams(next, { replace: key === "search" });
  };
  const labels = normalizeTaskLabels(
    state.tasks.flatMap((task) => task.labels),
  ).sort((a, b) => a.localeCompare(b));
  const today = dateInZone(
    Date.now(),
    state.members.find((member) => member.id === actorId)!.preferences.timezone,
  );
  const filtered = state.tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(search.toLowerCase()) &&
      (project === "all" || task.projectId === project) &&
      (priority === "all" || task.priority === priority) &&
      (assignee === "all" ||
        (assignee === "unassigned"
          ? !task.assigneeId
          : task.assigneeId === assignee)) &&
      (labelFilter === "all" ||
        !labels.some((label) => taskLabelKey(label) === labelFilter) ||
        task.labels.some((label) => taskLabelKey(label) === labelFilter)) &&
      (deadline === "all" ||
        (deadline === "none" && !task.deadline) ||
        (deadline === "today" && task.deadline?.slice(0, 10) === today) ||
        (deadline === "overdue" &&
          isOpenTask(task) &&
          deadlineAt(
            task.deadline,
            state.members.find((member) => member.id === task.assigneeId)
              ?.preferences.timezone ?? "UTC",
          ) < Date.now()) ||
        (deadline === "week" &&
          !!task.deadline &&
          task.deadline.slice(0, 10) >= today &&
          task.deadline.slice(0, 10) <= addDays(today, 7))),
  );
  const tasks = filtered
    .filter(
      (task) =>
        !isArchivedTask(task) &&
        (status === "all" ||
          (status === "active" ? isOpenTask(task) : task.status === status)),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "priority"
          ? { high: 0, medium: 1, low: 2 }[a.priority] -
            { high: 0, medium: 1, low: 2 }[b.priority]
          : (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
            a.title.localeCompare(b.title),
    );
  const archived = filtered.filter(isArchivedTask);
  const add = () => props.addTask(project === "all" ? undefined : project);
  return (
    <div className="page tasks-page">
      <div className="page-heading">
        <div>
          <PageTitle help="Manage work across projects and Personal planning. List, Board, and Archive show the same tasks with the filters you choose.">
            Tasks
          </PageTitle>
        </div>
        <button
          className="button primary"
          aria-label="Add task to this view"
          onClick={add}
        >
          <Plus size={16} />
          New task
        </button>
      </div>
      <div
        className="overview-tabs section-tabs"
        role="tablist"
        aria-label="Task views"
      >
        {[
          { id: "list", label: "List", icon: List },
          { id: "board", label: "Board", icon: LayoutGrid },
          { id: "archive", label: "Archive", icon: Archive },
        ].map((mode) => (
          <button
            key={mode.id}
            role="tab"
            id={"tasks-tab-" + mode.id}
            aria-selected={view === mode.id}
            aria-controls={"tasks-" + mode.id}
            onClick={() => change("view", mode.id)}
          >
            <mode.icon size={16} />
            {mode.label}
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <div className="filter-search">
          <SlidersHorizontal size={15} />
          <input
            aria-label="Filter tasks"
            placeholder="Find a task…"
            value={search}
            onChange={(event) => change("search", event.target.value)}
          />
        </div>
        <select
          aria-label="Filter by project"
          value={project}
          onChange={(event) => change("project", event.target.value)}
        >
          <option value="all">All projects</option>
          {state.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.id === state.workspace.inboxId ? " · No project" : ""}
              </option>
            ))}
        </select>
        <ResponsiveFilters
          activeCount={
            [
              assignee !== "all",
              status !== "all",
              priority !== "all",
              labelFilter !== "all",
              deadline !== "all",
            ].filter(Boolean).length
          }
        >
          <select
            aria-label="Filter by assignee"
            value={assignee}
            onChange={(event) => change("assignee", event.target.value)}
          >
            <option value="all">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {state.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === actorId ? "Me" : m.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="all">All stages</option>
            <option value="active">Unfinished</option>
            {taskStatusOptions
              .filter((key) => key !== "archived")
              .map((key) => (
                <option key={key} value={key}>
                  {statusLabels[key]}
                </option>
              ))}
          </select>
          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(event) => change("priority", event.target.value)}
          >
            <option value="all">All priorities</option>
            {["high", "medium", "low"].map((p) => (
              <option key={p} value={p}>
                {p} priority
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by tag"
            value={
              labels.some((label) => taskLabelKey(label) === labelFilter)
                ? labelFilter
                : "all"
            }
            onChange={(event) => change("tag", event.target.value)}
          >
            <option value="all">All tags</option>
            {labels.map((label) => (
              <option key={taskLabelKey(label)} value={taskLabelKey(label)}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by deadline"
            value={deadline}
            onChange={(event) => change("deadline", event.target.value)}
          >
            <option value="all">All deadlines</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Next 7 days</option>
            <option value="none">No deadline</option>
          </select>
          <select
            aria-label="Sort tasks"
            value={sort}
            onChange={(event) => change("sort", event.target.value)}
          >
            <option value="deadline">Due date</option>
            <option value="title">Task name</option>
            <option value="priority">Priority</option>
          </select>
        </ResponsiveFilters>
      </div>
      {project === state.workspace.inboxId && (
        <form
          className="quick-capture"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const title = String(new FormData(form).get("title"));
            const result = await run(
              () =>
                dispatch({
                  type: "create_task",
                  title,
                  description: "",
                  projectId: state.workspace.inboxId,
                  status: "backlog",
                  priority: "medium",
                  dependencies: [],
                  labels: [],
                  assigneeId: actorId,
                }),
              "Added to Personal planning",
            );
            if (result) form.reset();
          }}
        >
          <Plus size={20} />
          <input
            aria-label="Quick capture a task"
            name="title"
            placeholder="Add an idea or task to your backlog…"
            required
            maxLength={180}
            disabled={!online}
          />
          <span>↵</span>
        </form>
      )}
      <section
        role="tabpanel"
        id={"tasks-" + view}
        aria-labelledby={"tasks-tab-" + view}
      >
        {view === "archive" ? (
          <TaskArchive
            key="archive-tab"
            tasks={archived}
            openTask={props.openTask}
            expanded
          />
        ) : view === "board" ? (
          <TaskBoard tasks={tasks} openTask={props.openTask} addTask={add} />
        ) : (
          <GroupedTasks tasks={tasks} onOpen={props.openTask} onAdd={add} />
        )}
        <div className="table-footer">{tasks.length} tasks</div>
      </section>
      {view === "list" && (
        <TaskArchive tasks={archived} openTask={props.openTask} />
      )}
    </div>
  );
}
export function ProjectsPage(props: WorkProps) {
  const { state } = useData();
  const [archived, setArchived] = useState(false);
  const projects = state.projects.filter((p) => p.archived === archived);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Projects</h1>
          <p>Projects, owners, and progress.</p>
        </div>
        <button className="button primary" onClick={props.addProject}>
          <Plus size={16} />
          New project
        </button>
      </div>
      <div className="tabs">
        <button
          className={!archived ? "active" : ""}
          onClick={() => setArchived(false)}
        >
          Active projects{" "}
          <span>{state.projects.filter((p) => !p.archived).length}</span>
        </button>
        <button
          className={archived ? "active" : ""}
          onClick={() => setArchived(true)}
        >
          Archived
        </button>
      </div>
      {projects.length ? (
        <div className="project-grid full">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {!archived && (
            <button
              className="new-project-card"
              aria-label="Create another project"
              onClick={props.addProject}
            >
              <Plus size={25} />
              <strong>New project</strong>
              <span>Create a project</span>
            </button>
          )}
        </div>
      ) : (
        <Empty
          title={
            archived
              ? "Nothing archived."
              : "Your next project starts with an idea."
          }
          body="Projects keep related work, people, and plan history together."
        />
      )}
    </div>
  );
}
export function ProjectDetail(props: WorkProps) {
  const { id } = useParams(),
    { state, actorId, dispatch } = useData(),
    { run } = useUI(),
    [viewParams, setViewParams] = useSearchParams(),
    [membersOpen, setMembersOpen] = useState(false);
  const view = viewParams.get("view") ?? "list";
  const setView = (value: string) =>
    setViewParams((before) => {
      const next = new URLSearchParams(before);
      next.set("view", value);
      return next;
    });
  const project = state.projects.find((p) => p.id === id);
  if (!project)
    return (
      <Empty
        title="This project isn’t available."
        body="You may need an invitation or access from the project owner."
      />
    );
  const allProjectTasks = state.tasks.filter((t) => t.projectId === id),
    tasks = allProjectTasks.filter((t) => !t.parentId && !isArchivedTask(t)),
    owner = state.members.find((m) => m.id === project.ownerId),
    me = state.members.find((m) => m.id === actorId),
    canManage =
      project.ownerId === actorId ||
      ["owner", "admin"].includes(
        resourceRole(state, project.id, actorId) ?? "",
      );
  return (
    <div className="page">
      <Link className="breadcrumb-back" to="/projects">
        Projects
        <ChevronRight size={13} />
        {project.title}
      </Link>
      <div className="page-heading project-detail-heading">
        <div className="project-heading-group">
          <ProjectIcon project={project} />
          <div>
            <h1>{project.title}</h1>
            <p>{project.description}</p>
          </div>
          <ProjectFavoriteButton project={project} />
        </div>
        <button className="button primary" onClick={() => props.addTask(id)}>
          <Plus size={16} />
          Add task
        </button>
      </div>
      <div className="project-meta-bar">
        <span>
          <Avatar
            name={owner?.name ?? "Unassigned"}
            color={owner?.color}
            small
          />
          Owned by {owner?.name ?? "Unassigned"}
        </span>
        <label className="project-lifecycle">
          Project status
          <select
            aria-label="Project status"
            value={project.status ?? "active"}
            disabled={!canManage}
            onChange={(e) =>
              void run(
                () =>
                  dispatch({
                    type: "update_project",
                    id: project.id,
                    patch: { status: e.target.value as Project["status"] },
                  }),
                "Project status updated",
              )
            }
          >
            <option value="planned">Planned</option>
            <option value="active">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="done">Delivered</option>
          </select>
        </label>
        <span>
          <CalendarDays size={14} />
          Delivery date · {dueLabel(project.deadline)}
        </span>
        <button className="text-button" onClick={() => setMembersOpen(true)}>
          <Users size={14} />
          {project.memberIds.length} project members
        </button>
        {canManage && (
          <button
            className="text-button"
            onClick={() =>
              run(
                () =>
                  dispatch({
                    type: "update_project",
                    id: project.id,
                    patch: { archived: !project.archived },
                  }),
                project.archived
                  ? "Project restored"
                  : "Project archived; history preserved",
              )
            }
          >
            <Archive size={14} />
            {project.archived ? "Restore" : "Archive"}
          </button>
        )}
      </div>
      <div className="view-toolbar">
        <div className="tabs">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={15} />
            List
          </button>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={15} />
            Board
          </button>
          <button
            className={view === "timeline" ? "active" : ""}
            onClick={() => setView("timeline")}
          >
            <CalendarDays size={15} />
            Timeline
          </button>
          <button
            className={view === "archive" ? "active" : ""}
            onClick={() => setView("archive")}
          >
            <Archive size={15} />
            Archive
          </button>
          <Link to={"/plans?tab=history&project=" + id}>Plan history</Link>
        </div>
        <Link
          to={"/plans?project=" + id + "&create=true"}
          className="text-button"
        >
          Plan this project
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {view === "archive" ? (
        <TaskArchive
          key="project-archive-tab"
          tasks={allProjectTasks.filter(isArchivedTask)}
          openTask={props.openTask}
          expanded
        />
      ) : view === "timeline" ? (
        <ProjectTimeline
          project={project}
          tasks={allProjectTasks.filter((t) => !isArchivedTask(t))}
          openTask={props.openTask}
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={tasks}
          openTask={props.openTask}
          addTask={() => props.addTask(id)}
        />
      ) : (
        <section className="panel tasks-panel">
          {tasks.length ? (
            <TaskRows
              tasks={tasks}
              onOpen={props.openTask}
              showProject={false}
            />
          ) : (
            <Empty
              title="No tasks yet"
              body="Add the first task to give this project a next step."
            />
          )}
        </section>
      )}
      {view === "list" && (
        <TaskArchive
          tasks={allProjectTasks.filter(isArchivedTask)}
          openTask={props.openTask}
        />
      )}
      <Modal
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        title="Project & people"
        description="Workspace membership and project access are checked separately."
      >
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = await run(
              () =>
                dispatch({
                  type: "update_project",
                  id: project.id,
                  patch: {
                    memberIds: f.getAll("member").map(String),
                    reviewRequired: f.get("reviewRequired") === "on",
                    title: String(f.get("title")),
                    description: String(f.get("description")),
                    ownerId: String(f.get("ownerId")),
                    deadline: String(f.get("deadline")),
                    startDate: String(f.get("startDate")),
                    priority: f.get("priority") as Task["priority"],
                    status: f.get("status") as "active",
                  },
                }),
              "Project access updated",
            );
            if (r) setMembersOpen(false);
          }}
        >
          {canManage && (
            <>
              <label>
                Project title
                <input name="title" required defaultValue={project.title} />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={project.description}
                  rows={2}
                />
              </label>
              <div className="form-grid">
                <label>
                  Project owner
                  <select name="ownerId" defaultValue={project.ownerId}>
                    {state.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={project.status ?? "active"}
                  >
                    <option value="planned">Planned</option>
                    <option value="active">In progress</option>
                    <option value="on_hold">On hold</option>
                    <option value="done">Delivered</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    defaultValue={project.priority ?? "medium"}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  Planned start
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={project.startDate}
                  />
                </label>
                <label>
                  Delivery date
                  <input
                    name="deadline"
                    type="date"
                    defaultValue={project.deadline?.slice(0, 10)}
                  />
                </label>
              </div>
            </>
          )}
          {state.members.map((m) => (
            <label className="member-choice" key={m.id}>
              <Avatar name={m.name} color={m.color} />
              <span>
                {m.name}
                <small>{m.role}</small>
              </span>
              <input
                name="member"
                value={m.id}
                type="checkbox"
                defaultChecked={project.memberIds.includes(m.id)}
                disabled={!canManage}
              />
            </label>
          ))}
          <p className="form-note">
            {project.private
              ? "Private project. Only selected people and administrators can see it."
              : "This project is visible to members. Guests must be selected explicitly."}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              name="reviewRequired"
              defaultChecked={project.reviewRequired ?? false}
              disabled={!canManage}
            />
            Require review for every new plan in this project
          </label>
          <small>
            A project can add a review requirement. It cannot remove anyone’s
            personal review requirement or grant calendar-write authority.
          </small>
          {canManage && (
            <div className="modal-footer">
              <button className="button primary">Save project access</button>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
