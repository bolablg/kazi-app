import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageSquare,
  Plus,
  Star,
  TriangleAlert,
} from "lucide-react";
import { buildTodayOverview, type TodayPage } from "../shared/today";
import { projectPath } from "../shared/ids";
import { statusLabels, type Task } from "../shared/model";
import { taskDate } from "../shared/overview";
import { useData } from "./data";
import { Avatar } from "./components";
import {
  ProjectFavoriteButton,
  ProjectIcon,
  type WorkProps,
} from "./WorkPages";
import { projectStyle } from "./projectColors";
import { TaskLabels } from "./TaskLabels";
import { InfoTip } from "./InfoTip";

type Attention = "all" | "overdue" | "dueToday" | "toValidate";
const attentionLabels = {
  all: "All",
  overdue: "Overdue",
  dueToday: "Due today",
  toValidate: "To validate",
};
export function TodayOverview({
  person,
  project,
  ...props
}: WorkProps & { person: string; project: string; now: number }) {
  return (
    <TodayDashboard
      key={JSON.stringify([person, project])}
      person={person}
      project={project}
      {...props}
    />
  );
}
function TodayDashboard({
  person,
  project,
  now,
  ...props
}: WorkProps & { person: string; project: string; now: number }) {
  const { state, actorId } = useData();
  const [attentionPage, setAttentionPage] = useState(1);
  const [focusPage, setFocusPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const overview = buildTodayOverview(state, {
    actorId,
    person,
    project,
    now,
    attentionPage,
    focusPage,
    activityPage,
  });
  const [attention, setAttention] = useState<Attention>("all");
  const [projectView, setProjectView] = useState<"favorites" | "recent">(() =>
    overview.counts.favorites ? "favorites" : "recent",
  );
  const tasksLink = (focus = false) => {
    const params = new URLSearchParams({ status: "active" });
    if (project !== "all") params.set("project", project);
    if (focus && person !== "all") params.set("assignee", person);
    return "/tasks?" + params;
  };
  const rows = overview.attention[attention];
  const changeAttention = (next: Attention) => {
    setAttention(next);
    setAttentionPage(1);
  };
  return (
    <div className="today-dashboard">
      <div className="today-intro">
        <div>
          <span className="today-date">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: overview.timezone,
            }).format(now)}
          </span>
        </div>
        <span className="today-zone">{overview.timezone}</span>
      </div>
      <div className="today-pulse" aria-label="Today's priorities">
        {(
          [
            {
              key: "overdue",
              label: "Overdue",
              tone: "coral",
              icon: TriangleAlert,
            },
            {
              key: "dueToday",
              label: "Due today",
              tone: "blue",
              icon: Clock3,
            },
            {
              key: "toValidate",
              label: "To validate",
              tone: "amber",
              icon: CheckCircle2,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            data-tone={item.tone}
            aria-pressed={attention === item.key}
            onClick={() => changeAttention(item.key)}
          >
            <item.icon size={20} />
            <strong>{overview.counts[item.key]}</strong>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="today-grid">
        <section
          className="today-panel today-attention"
          aria-labelledby="today-attention-heading"
        >
          <div className="today-panel-heading">
            <h2 id="today-attention-heading">
              Needs attention <span>{overview.counts.attention}</span>
            </h2>
            <Link className="text-button" to={tasksLink()}>
              Open tasks <ArrowUpRight size={14} />
            </Link>
          </div>
          <div
            className="today-switches"
            role="group"
            aria-label="Attention filters"
          >
            {(Object.keys(attentionLabels) as Attention[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={attention === key}
                onClick={() => changeAttention(key)}
              >
                {attentionLabels[key]}
              </button>
            ))}
          </div>
          {rows.length ? (
            <div className="today-task-list">
              {rows.map((task) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  zone={overview.timezone}
                  today={overview.date}
                  onOpen={props.openTask}
                />
              ))}
            </div>
          ) : (
            <TodayEmpty
              icon={CheckCircle2}
              title="Nothing needs attention here."
              body="Deadlines and tasks waiting for your validation appear here."
            />
          )}
          <TodayPagination
            label="Needs attention"
            value={overview.pagination.attention[attention]}
            onChange={setAttentionPage}
          />
        </section>
        <section
          className="today-panel today-focus"
          aria-labelledby="today-focus-heading"
        >
          <div className="today-panel-heading">
            <div className="section-title-group">
              <h2 id="today-focus-heading">
                {person === actorId ? "My focus" : "Focus"}{" "}
                <span>{overview.counts.focus}</span>
              </h2>
              <InfoTip label="About focus tasks">
                In progress first, followed by work ready to start. Tasks are
                ready when their planned start has arrived and prerequisites are
                completed.
              </InfoTip>
            </div>
            <Link className="text-button" to={tasksLink(true)}>
              View tasks <ArrowUpRight size={14} />
            </Link>
          </div>
          {overview.focus.length ? (
            <div className="today-task-list">
              {overview.focus.map((task) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  zone={overview.timezone}
                  today={overview.date}
                  onOpen={props.openTask}
                />
              ))}
            </div>
          ) : (
            <TodayEmpty
              icon={Clock3}
              title="Choose what comes next."
              body="Your tasks in To do and In progress will appear here."
            >
              <button
                className="button secondary"
                onClick={() =>
                  props.addTask(project === "all" ? undefined : project)
                }
              >
                <Plus size={14} /> Add a task
              </button>
            </TodayEmpty>
          )}
          <TodayPagination
            label={person === actorId ? "My focus" : "Focus"}
            value={overview.pagination.focus}
            onChange={setFocusPage}
          />
        </section>
        <section
          className="today-panel today-projects"
          aria-labelledby="today-projects-heading"
        >
          <div className="today-panel-heading">
            <h2 id="today-projects-heading">Projects</h2>
            <Link className="text-button" to="/projects">
              All projects <ArrowUpRight size={14} />
            </Link>
          </div>
          <div
            className="today-switches"
            role="group"
            aria-label="Project shortcuts"
          >
            <button
              aria-pressed={projectView === "favorites"}
              onClick={() => setProjectView("favorites")}
            >
              <Star size={13} /> Favorites
            </button>
            <button
              aria-pressed={projectView === "recent"}
              onClick={() => setProjectView("recent")}
            >
              <Clock3 size={13} /> Recent
            </button>
            <span>
              {projectView === "recent"
                ? "Recently updated"
                : "Your starred projects"}
            </span>
          </div>
          {overview.projects[projectView].length ? (
            <div className="today-project-grid">
              {overview.projects[projectView].map((item) => (
                <div
                  className="today-project-tile"
                  key={item.id}
                  style={projectStyle(item.color)}
                >
                  <Link to={projectPath(item.id)} aria-label={item.title}>
                    <span className="today-project-art">
                      <ProjectIcon project={item} />
                    </span>
                    <span className="today-project-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {item.status === "done"
                          ? "Delivered"
                          : item.status === "on_hold"
                            ? "On hold"
                            : item.status === "planned"
                              ? "Planned"
                              : "In progress"}
                      </small>
                    </span>
                  </Link>
                  <ProjectFavoriteButton project={item} />
                </div>
              ))}
            </div>
          ) : (
            <TodayEmpty
              icon={Star}
              title={
                projectView === "favorites"
                  ? "Keep your favorites close."
                  : "Start something worth doing."
              }
              body={
                projectView === "favorites"
                  ? "Star a project to keep it here and in your sidebar."
                  : "Create a project to organize related work."
              }
            >
              {projectView === "favorites" ? (
                <Link className="text-button" to="/projects">
                  Browse projects <ArrowUpRight size={14} />
                </Link>
              ) : (
                <button className="button secondary" onClick={props.addProject}>
                  <Plus size={14} /> Create a project
                </button>
              )}
            </TodayEmpty>
          )}
        </section>
        <section
          className="today-panel today-activity"
          aria-labelledby="today-activity-heading"
        >
          <div className="today-panel-heading">
            <div className="section-title-group">
              <h2 id="today-activity-heading">Recent activity</h2>
              <InfoTip label="About recent activity">
                Comments and system updates on your work. Open a task to see its
                full Activity history.
              </InfoTip>
            </div>
            <Link className="text-button" to="/notifications">
              Notifications <ArrowUpRight size={14} />
            </Link>
          </div>
          {overview.activity.length ? (
            <ol className="today-activity-list">
              {overview.activity.map(({ event, task }) => {
                const author = state.members.find(
                  (member) => member.id === event.actorId,
                );
                return (
                  <li key={event.id}>
                    <button onClick={() => props.openTask(task.id)}>
                      <Avatar
                        name={author?.name ?? "Former teammate"}
                        color={author?.color}
                        small
                      />
                      <span className="today-activity-copy">
                        <span>
                          <strong>{author?.name ?? "Former teammate"}</strong>
                          <time dateTime={new Date(event.at).toISOString()}>
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: overview.timezone,
                            }).format(event.at)}
                          </time>
                        </span>
                        <strong className="today-activity-task">
                          {task.title}
                        </strong>
                        <span className="today-activity-message">
                          {event.toStatus ? (
                            <>
                              <span
                                className="activity-stage"
                                data-status={event.toStatus}
                              >
                                {statusLabels[event.toStatus]}
                              </span>{" "}
                              {event.fromStatus
                                ? "Status updated"
                                : "Task created"}
                            </>
                          ) : (
                            event.message || "Attached a file"
                          )}
                        </span>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <TodayEmpty
              icon={MessageSquare}
              title="No recent activity."
              body="Task comments and status updates will appear here."
            />
          )}
          <TodayPagination
            label="Recent activity"
            value={overview.pagination.activity}
            onChange={setActivityPage}
          />
        </section>
      </div>
    </div>
  );
}

function TodayPagination({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TodayPage;
  onChange: (page: number) => void;
}) {
  if (!value.total) return null;
  return (
    <nav className="today-pagination" aria-label={label + " pages"}>
      <span aria-live="polite" aria-atomic="true">
        {value.from}–{value.to} of {value.total}
      </span>
      {value.pages > 1 && (
        <div>
          <button
            className="icon-button"
            aria-label={"Previous " + label.toLowerCase() + " page"}
            disabled={value.page === 1}
            onClick={() => onChange(value.page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {value.page} / {value.pages}
          </span>
          <button
            className="icon-button"
            aria-label={"Next " + label.toLowerCase() + " page"}
            disabled={value.page === value.pages}
            onClick={() => onChange(value.page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}

function TodayTaskRow({
  task,
  zone,
  today,
  onOpen,
}: {
  task: Task;
  zone: string;
  today: string;
  onOpen: (id: string) => void;
}) {
  const { state } = useData();
  const project = state.projects.find((item) => item.id === task.projectId);
  const date = taskDate(task, zone);
  const due =
    date === today
      ? "Today"
      : date
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(date + "T12:00:00Z"))
        : "No deadline";
  const worker = state.members.find((member) => member.id === task.assigneeId);
  return (
    <button
      className="today-task-row"
      onClick={() => onOpen(task.id)}
      aria-label={task.title}
    >
      <span className={"subtask-status " + task.status}>
        <Circle size={16} />
      </span>
      <span className="today-task-copy">
        <strong>{task.title}</strong>
        <small>{project?.title ?? "Personal planning"}</small>
        <TaskLabels labels={task.labels} limit={2} />
      </span>
      <span className="today-task-end">
        <span className={"status-label " + task.status}>
          {statusLabels[task.status]}
        </span>
        <time dateTime={task.deadline}>{due}</time>
      </span>
      {worker && <Avatar name={worker.name} color={worker.color} small />}
      <ArrowUpRight size={14} />
    </button>
  );
}
function TodayEmpty({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Star;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="today-empty">
      <Icon size={23} />
      <strong>{title}</strong>
      <p>{body}</p>
      {children}
    </div>
  );
}
