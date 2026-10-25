import { PageLoading } from "./LoadingScreen";
import { Brand } from "./Brand";
import { SidebarFavorites, FavoritesPage, TeamScope } from "./Favorites";
import {
  projectPath,
  taskPath,
  planPath,
  standaloneTaskPath,
} from "../shared/ids";
import { resourceRoute } from "../shared/resourceRoutes";
import type { Location } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AccountMenu } from "./AccountPages";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  LayoutDashboard,
  CalendarDays,
  ChartNoAxesCombined,
  List as ListIcon,
  Plug,
  Folder,
  Layers,
  Bell,
  Users,
  Settings,
  Search,
  Plus,
  HelpCircle,
  ArrowUpRight,
  Command,
  Menu,
  X,
  Check,
  WifiOff,
  Download,
  RefreshCw,
  Leaf,
  ChevronRight,
  Flag,
} from "lucide-react";
import { useData } from "./data";
import {
  UIProvider,
  useUI,
  Avatar,
  Modal,
  TaskForm,
  ProjectForm,
  TaskDetail,
  Empty,
  ProjectTag,
  cx,
} from "./components";
import { OverviewPage } from "./OverviewPage";
import { CalendarPage } from "./CalendarPage";
import { CalendarSubscriptionsPage } from "./AgendaSettings";
import { TasksPage, ProjectsPage, ProjectDetail } from "./WorkPages";
import { PlansPage, PlanReview } from "./PlanningPages";
import { SprintsPage, SprintDetail } from "./SprintPages";
import { SprintPlanner } from "./SprintPlanner";
const InsightsPage = lazy(() =>
  import("./InsightsPage").then((module) => ({ default: module.InsightsPage })),
);
const TeamPage = lazy(() =>
  import("./SettingsPages").then((module) => ({ default: module.TeamPage })),
);
const SettingsPage = lazy(() =>
  import("./SettingsPages").then((module) => ({
    default: module.SettingsPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./SettingsPages").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const JoinPage = lazy(() =>
  import("./SettingsPages").then((module) => ({ default: module.JoinPage })),
);
const primary = [
  { path: "/", label: "Overview", icon: LayoutDashboard },
  { path: "/tasks", label: "Tasks", icon: ListIcon },
  { path: "/projects", label: "Projects", icon: Folder },
  { path: "/sprints", label: "Sprints", icon: Flag },
  { path: "/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/plans", label: "Plans", icon: Layers },
  { path: "/insights", label: "Insights", icon: ChartNoAxesCombined },
  { path: "/notifications", label: "Notifications", icon: Bell },
];
export default function App() {
  return (
    <UIProvider>
      <Shell />
    </UIProvider>
  );
}
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
function Shell() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { state, actorId, demo, online, local } = useData(),
    { run } = useUI(),
    navigate = useNavigate(),
    location = useLocation();
  const [taskForm, setTaskForm] = useState(false),
    [taskProject, setTaskProject] = useState<string>(),
    [projectForm, setProjectForm] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [help, setHelp] = useState(false),
    [mobile, setMobile] = useState(false),
    [install, setInstall] = useState<InstallEvent>();
  const unread = state.notifications.filter(
      (n) =>
        !n.read &&
        n.deliveryAt <= now &&
        (!n.snoozedUntil || n.snoozedUntil <= now),
    ).length,
    pending = state.proposals.filter(
      (p) => p.status === "awaiting_review",
    ).length;
  const query = search.trim().toLowerCase();
  const matchingTasks = state.tasks
    .filter((task) => task.title.toLowerCase().includes(query))
    .slice(0, 7);
  const matchingProjects = state.projects
    .filter((project) => project.title.toLowerCase().includes(query))
    .slice(0, 5);
  const {
    needRefresh: [needsUpdate],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (import.meta.env.DEV && needsUpdate) void updateServiceWorker(true);
  }, [needsUpdate, updateServiceWorker]);
  const addTask = (projectId?: string) => {
    setTaskProject(projectId);
    setTaskForm(true);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (
        e.key === "n" &&
        !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        addTask();
      }
    };
    window.addEventListener("keydown", f);
    const capture = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => {
      window.removeEventListener("keydown", f);
      window.removeEventListener("beforeinstallprompt", capture);
    };
  }, []);
  useEffect(() => {
    setMobile(false);
    document.querySelector(".main-scroll")?.scrollTo(0, 0);
  }, [location.pathname]);
  const resource = resourceRoute(state, location.pathname, location.search);
  const background = (location.state as { background?: Location } | null)
    ?.background;
  const navigationLocation = resource.task
    ? { pathname: "/tasks", search: "" }
    : (background ?? location);
  const navigationResource = resourceRoute(
    state,
    navigationLocation.pathname,
    navigationLocation.search,
  );
  const dialogOpen = !!(resource.task || resource.plan);
  const openResource = (path: string) =>
    navigate(path, {
      replace: dialogOpen,
      state: { background: background ?? (dialogOpen ? undefined : location) },
    });
  const openTask = (id: string) => {
    const task = state.tasks.find((t) => t.id === id);
    openResource(task ? taskPath(task) : standaloneTaskPath(id));
  };
  const openPlan = (id: string) => {
    const plan = state.proposals.find((p) => p.id === id);
    openResource(planPath(id, plan?.revision));
  };
  const closeResource = () => {
    if (background) navigate(-1);
    else
      navigate(
        resource.task ? projectPath(resource.task.projectId) : "/plans",
        { replace: true },
      );
  };
  const closeTask = () => {
    if (background?.pathname.startsWith("/sprints/")) {
      navigate(
        { pathname: background.pathname, search: background.search },
        { replace: true },
      );
      return;
    }
    if (
      background &&
      ["gantt", "timeline"].includes(
        new URLSearchParams(background.search).get("view") ?? "",
      ) &&
      resourceRoute(state, background.pathname, background.search).kind ===
        "project"
    ) {
      navigate(
        { pathname: background.pathname, search: background.search },
        { replace: true },
      );
      return;
    }
    navigate(
      {
        pathname: "/tasks",
        search:
          background?.pathname === "/tasks"
            ? background.search
            : new URLSearchParams(background?.search).get("view") === "board"
              ? "?view=board"
              : "",
      },
      { replace: true },
    );
  };
  const props = {
    openTask,
    addTask,
    addProject: () => setProjectForm(true),
    openPlan,
  };
  const pageName =
    navigationResource.kind === "project" || navigationResource.kind === "task"
      ? "Projects"
      : navigationResource.kind === "plan"
        ? "Plans"
        : (primary.find((n) => n.path === navigationLocation.pathname)?.label ??
          (["/team", "/teams"].includes(location.pathname)
            ? "Team & people"
            : location.pathname === "/connections"
              ? "Connections"
              : location.pathname === "/calendar/subscriptions"
                ? "Calendar"
                : location.pathname === "/settings"
                  ? "Settings"
                  : location.pathname === "/favorites"
                    ? "Favorites"
                    : location.pathname.startsWith("/sprints/")
                      ? "Sprints"
                      : "Welcome"));
  const legacyParams = new URLSearchParams(location.search);
  if (location.pathname === "/" && legacyParams.get("view") === "list") {
    legacyParams.set("view", "list");
    legacyParams.set("assignee", legacyParams.get("person") ?? actorId);
    legacyParams.delete("person");
    return <Navigate to={"/tasks?" + legacyParams} replace />;
  }
  if (
    location.pathname === "/" &&
    ["calendar", "schedule"].includes(legacyParams.get("view") ?? "")
  ) {
    return (
      <Navigate
        to={{
          pathname: "/calendar",
          search: location.search,
          hash: location.hash,
        }}
        replace
      />
    );
  }
  if (location.pathname === "/reports") {
    return (
      <Navigate
        to={{
          pathname: "/insights",
          search: location.search,
          hash: location.hash,
        }}
        replace
      />
    );
  }
  if (location.pathname === "/tasks" && legacyParams.has("tab")) {
    if (legacyParams.get("tab") === "inbox")
      legacyParams.set("project", state.workspace.inboxId);
    legacyParams.delete("tab");
    return <Navigate to={"/tasks?" + legacyParams} replace />;
  }
  if (resource.redirect)
    return <Navigate to={resource.redirect} replace state={location.state} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={cx("sidebar", mobile && "mobile-open")}>
        <Link
          to="/"
          className="wordmark"
          aria-label="Kazi home"
          onClick={() => setMobile(false)}
        >
          <Brand />
        </Link>
        <div className="sidebar-scroll">
          <button
            className="sidebar-search"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} />
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav aria-label="Main navigation">
            {primary.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobile(false)}
                aria-label={item.label}
                end={item.path === "/"}
                className={() =>
                  cx(
                    "nav-item",
                    (item.path === navigationLocation.pathname ||
                      (item.path === "/calendar" &&
                        navigationLocation.pathname.startsWith("/calendar/")) ||
                      (item.path === "/projects" &&
                        navigationLocation.pathname.startsWith("/project/")) ||
                      (item.path === "/plans" &&
                        navigationResource.kind === "plan")) &&
                      "active",
                  )
                }
              >
                <item.icon size={18} strokeWidth={1.6} />
                <span>{item.label}</span>
                {item.path === "/notifications" && unread > 0 && (
                  <span className="nav-count">{unread}</span>
                )}
                {item.path === "/plans" && pending > 0 && (
                  <span className="nav-dot" />
                )}
              </NavLink>
            ))}
          </nav>
          <SidebarFavorites onSelect={() => setMobile(false)} />
        </div>
        <AccountMenu />
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <strong>{pageName}</strong>
            <TeamScope />
            {(demo || local) && (
              <span className="demo-label">
                {local ? "Local development" : "Demo"}
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Find anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button help-button"
              aria-label="Help and keyboard shortcuts"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={18} />
            </button>
            <button
              className="button primary topbar-add"
              aria-label="New task"
              onClick={() => addTask()}
            >
              <Plus size={15} />
              <span>New task</span>
            </button>
          </div>
        </header>
        {!online && (
          <div className="connection-banner" role="status">
            <WifiOff size={16} />
            You’re offline. This is a read-only view; reconnect to save,
            approve, or confirm calendar changes.
          </div>
        )}
        {import.meta.env.PROD && needsUpdate && (
          <div className="connection-banner update">
            <RefreshCw size={16} />A Kazi update is available.
            <button
              className="text-button"
              onClick={() => updateServiceWorker(true)}
            >
              Update now
              <ArrowRightIcon />
            </button>
          </div>
        )}
        {install && (
          <div className="install-banner">
            <Download size={15} />
            Install Kazi on this device.
            <button
              className="text-button"
              onClick={async () => {
                await install.prompt();
                setInstall(undefined);
              }}
            >
              Install app
              <ArrowUpRight size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss install guidance"
              onClick={() => setInstall(undefined)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <main className="main-scroll" id="main-content">
          {resource.task ? (
            <TaskDetail
              id={resource.task.id}
              onClose={closeTask}
              onOpen={openTask}
              backLabel={
                background?.pathname.startsWith("/sprints/")
                  ? "Back to sprint"
                  : undefined
              }
            />
          ) : (
            <Suspense
              fallback={
                <div role="status" aria-label="Opening page">
                  <PageLoading />
                </div>
              }
            >
              <Routes
                location={
                  dialogOpen && !resource.staleRevision && background
                    ? background
                    : location
                }
              >
                <Route path="/" element={<OverviewPage {...props} />} />
                <Route path="/calendar" element={<CalendarPage {...props} />} />
                <Route
                  path="/calendar/subscriptions"
                  element={<CalendarSubscriptionsPage />}
                />
                <Route
                  path="/my-tasks"
                  element={
                    <Navigate to={`/tasks?assignee=${actorId}`} replace />
                  }
                />
                <Route
                  path="/inbox"
                  element={
                    <Navigate
                      to={`/tasks?project=${state.workspace.inboxId}`}
                      replace
                    />
                  }
                />
                <Route path="/tasks" element={<TasksPage {...props} />} />
                <Route path="/sprints" element={<SprintsPage />} />
                <Route
                  path="/sprints/new"
                  element={<SprintPlanner {...props} />}
                />
                <Route
                  path="/sprints/:id/edit"
                  element={<SprintPlanner {...props} />}
                />
                <Route
                  path="/sprints/:id"
                  element={<SprintDetail {...props} />}
                />
                <Route path="/projects" element={<ProjectsPage {...props} />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route
                  path="/projects/:id"
                  element={<ProjectDetail {...props} />}
                />
                <Route
                  path="/project/:id"
                  element={<ProjectDetail {...props} />}
                />
                <Route
                  path="/project/:id/task/:taskId"
                  element={
                    resource.task ? (
                      <ProjectDetail {...props} />
                    ) : (
                      <MissingResource kind="task" />
                    )
                  }
                />
                <Route
                  path="/task/:taskId"
                  element={<MissingResource kind="task" />}
                />
                <Route
                  path="/tasks/:taskId"
                  element={<MissingResource kind="task" />}
                />
                <Route
                  path="/plan/:planId"
                  element={
                    resource.staleRevision && resource.plan ? (
                      <div className="page">
                        <Empty
                          title="This plan link is outdated."
                          body="The proposal has changed since this link was created."
                          action={
                            <button
                              className="button secondary"
                              onClick={() =>
                                navigate(
                                  planPath(
                                    resource.plan!.id,
                                    resource.plan!.revision,
                                  ),
                                  { replace: true },
                                )
                              }
                            >
                              Review the current proposal
                            </button>
                          }
                        />
                      </div>
                    ) : resource.plan ? (
                      <PlansPage openPlan={openPlan} />
                    ) : (
                      <MissingResource kind="plan" />
                    )
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <Suspense
                      fallback={
                        <div role="status" aria-label="Opening insights">
                          <PageLoading />
                        </div>
                      }
                    >
                      <InsightsPage openTask={openTask} />
                    </Suspense>
                  }
                />
                <Route
                  path="/week"
                  element={
                    <Navigate
                      to={{ pathname: "/plans", search: location.search }}
                      replace
                    />
                  }
                />
                <Route
                  path="/plans"
                  element={<PlansPage openPlan={openPlan} />}
                />
                <Route
                  path="/notifications"
                  element={
                    <NotificationsPage
                      openTask={openTask}
                      openPlan={openPlan}
                    />
                  }
                />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/teams" element={<TeamPage directory />} />
                <Route
                  path="/settings"
                  element={<SettingsPage key="settings" />}
                />
                <Route
                  path="/connections"
                  element={<SettingsPage key="connections" connections />}
                />
                <Route path="/join" element={<JoinPage />} />
                <Route
                  path="*"
                  element={
                    <Empty
                      title="Page not found"
                      body="That page is not available in Kazi."
                      action={
                        <Link className="button primary" to="/">
                          Back to overview
                        </Link>
                      }
                    />
                  }
                />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <TaskForm
        key={taskForm + "-" + taskProject}
        open={taskForm}
        onClose={() => setTaskForm(false)}
        projectId={taskProject}
      />
      <ProjectForm open={projectForm} onClose={() => setProjectForm(false)} />
      <PlanReview
        id={resource.staleRevision ? undefined : resource.plan?.id}
        onClose={closeResource}
      />
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search Kazi"
        description="Search the tasks and projects you have access to."
      >
        <div className="global-search-input">
          <Search size={20} />
          <input
            aria-label="Search Kazi"
            placeholder="Search tasks and projects"
            autoComplete="off"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="global-search-results">
          {matchingTasks.length > 0 && <span className="eyebrow">TASKS</span>}
          {matchingTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSearchOpen(false);
                openTask(t.id);
              }}
            >
              <span className="search-task-circle" />
              <span>
                {t.title}
                <ProjectTag
                  project={state.projects.find((p) => p.id === t.projectId)}
                />
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
          {matchingProjects.length > 0 && (
            <span className="eyebrow">PROJECTS</span>
          )}
          {matchingProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSearchOpen(false);
                navigate(projectPath(p.id));
              }}
            >
              <Folder size={17} />
              <span>{p.title}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
          {!matchingTasks.length && !matchingProjects.length && (
            <div className="search-empty" role="status">
              <Search size={24} aria-hidden="true" />
              <p>No matching tasks or projects</p>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="Help & shortcuts"
        description="Keyboard shortcuts and application help."
      >
        <div className="help-content">
          <div>
            <kbd>⌘ / Ctrl K</kbd>
            <span>Find a task or project</span>
          </div>
          <div>
            <kbd>N</kbd>
            <span>Capture a new task</span>
          </div>
          <div>
            <kbd>Esc</kbd>
            <span>Close a dialog</span>
          </div>
          <p>
            Start in Personal planning. Give related tasks a project. Connect
            your calendar when you’re ready to turn remaining work into
            realistic sessions.
          </p>
          <p>
            Plans are proposals until approved. Recovery plans preserve every
            earlier version and your original deadline.
          </p>
          {demo && (
            <div className="inline-info">
              You’re exploring a local demonstration with synthetic people,
              work, and availability. Changes persist in this browser. Live
              authentication, calendar access, background jobs, and MCP require
              the service configuration in the README.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
function ArrowRightIcon() {
  return <ChevronRight size={14} />;
}

function MissingResource({ kind }: { kind: "task" | "plan" }) {
  return (
    <div className="page">
      <Empty
        title={`This ${kind} isn’t available.`}
        body="It may have been removed, or you may need access from its owner."
        action={
          <Link className="button secondary" to="/">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
