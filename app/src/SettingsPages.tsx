import { defaultAgingDays } from "../shared/model";
import { AgendaSettings } from "./AgendaSettings";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  Check,
  Clock3,
  ArrowUpRight,
  CalendarDays,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Link2,
  Copy,
  Users,
  Plus,
  UserPlus,
  Trash2,
  Download,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Mail,
  Inbox,
} from "lucide-react";
import { useData } from "./data";
import { AccountSettings, WorkspaceSettings } from "./AccountPages";
import {
  ConnectionsOverview,
  McpSettings,
  McpActivity,
} from "./ConnectionsPages";
import { Avatar, Modal, useUI, Empty, cx, duration } from "./components";
import { type Preferences, defaults } from "../shared/model";
export function NotificationsPage({
  openTask,
  openPlan,
}: {
  openTask: (id: string) => void;
  openPlan: (id: string) => void;
}) {
  const { state, dispatch } = useData(),
    { run } = useUI(),
    [filter, setFilter] = useState("unread");
  const now = Date.now();
  const items = state.notifications
    .filter(
      (n) =>
        (filter === "all" || !n.read) &&
        (!n.snoozedUntil || n.snoozedUntil <= now) &&
        n.deliveryAt <= now,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="page notifications-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">NOTIFICATIONS</p>
          <h1>Notifications</h1>
          <p>Task reminders and plans that need your review.</p>
        </div>
        <Link className="button secondary" to="/settings">
          <Bell size={15} />
          Notification preferences
        </Link>
      </div>
      <div className="tabs">
        <button
          className={filter === "unread" ? "active" : ""}
          onClick={() => setFilter("unread")}
        >
          Unread{" "}
          <span>
            {
              state.notifications.filter((n) => !n.read && n.deliveryAt <= now)
                .length
            }
          </span>
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All notifications
        </button>
      </div>
      <section className="notification-list">
        {items.map((n) => (
          <article
            className={cx("notification-card", n.read && "read")}
            key={n.id}
          >
            <span
              className={cx(
                "notification-icon",
                n.kind === "overdue"
                  ? "clay"
                  : n.kind === "review"
                    ? "olive"
                    : "gold",
              )}
            >
              {n.kind === "overdue" ? (
                <RefreshCw size={21} />
              ) : n.kind === "review" ? (
                <CalendarDays size={21} />
              ) : (
                <Bell size={21} />
              )}
            </span>
            <div className="notification-content">
              <div>
                <span className="eyebrow">
                  {n.kind === "overdue"
                    ? "OVERDUE"
                    : n.kind === "review"
                      ? "PLAN REVIEW"
                      : n.kind === "stale"
                        ? "PROGRESS CHECK"
                        : "REMINDER"}
                </span>
                <time>
                  {new Date(n.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </div>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              <div className="notification-actions">
                {n.proposalId && (
                  <button
                    className="text-button"
                    onClick={() => openPlan(n.proposalId!)}
                  >
                    Review plan
                    <ArrowUpRight size={14} />
                  </button>
                )}
                {n.taskId && (
                  <button
                    className="text-button"
                    onClick={() => openTask(n.taskId!)}
                  >
                    Open task
                    <ArrowUpRight size={14} />
                  </button>
                )}
                <button
                  className="text-button muted"
                  onClick={() =>
                    run(
                      () =>
                        dispatch({
                          type: "notification",
                          id: n.id,
                          action: "snooze",
                        }),
                      "Snoozed for a day. Your task is unchanged.",
                    )
                  }
                >
                  <Clock3 size={13} />
                  Snooze
                </button>
                {!n.read && (
                  <button
                    className="text-button muted"
                    onClick={() =>
                      run(() =>
                        dispatch({
                          type: "notification",
                          id: n.id,
                          action: "read",
                        }),
                      )
                    }
                  >
                    <Check size={14} />
                    Mark as read
                  </button>
                )}
              </div>
            </div>
            {!n.read && <span className="unread-dot" />}
          </article>
        ))}
        {!items.length && (
          <div className="panel">
            <Empty
              title="No notifications"
              body="You’re all caught up. We’ll let you know when something needs your attention."
            />
          </div>
        )}
      </section>
    </div>
  );
}
export function TeamPage() {
  const { teamId, teams, setTeam, createTeam, demo } = useData(),
    { run } = useUI();
  const [creating, setCreating] = useState(false);
  if (teamId !== "all") return <TeamMembersPage />;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Teams & people</h1>
          <p>
            One account, with separate membership and performance for each team.
          </p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Create team
        </button>
      </div>
      <div className="team-directory">
        {teams.map((team) => (
          <article key={team.id}>
            <h2>{team.kind === "personal" ? "Personal" : team.name}</h2>
            <p>
              {team.role === "owner"
                ? "You manage this team"
                : "Your role: " + team.role}
            </p>
            <button
              className="button secondary"
              onClick={() => setTeam(team.id)}
            >
              People & access
            </button>
          </article>
        ))}
      </div>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a team"
        description="You will be its manager. Projects, tasks, and performance stay attributed to this team."
      >
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name"));
            const result = await run(async () => {
              await createTeam(name);
              return true;
            }, "Team created");
            if (result) setCreating(false);
          }}
        >
          <label>
            Team name
            <input name="name" required maxLength={100} autoFocus />
          </label>
          {demo && (
            <p className="inline-info">
              Creating another team requires the connected backend.
            </p>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button className="button primary" disabled={demo}>
              Create team
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
function TeamMembersPage() {
  const { state, actorId, dispatch, enableCollaboration, inviteUrl, demo } =
      useData(),
    { run } = useUI(),
    [inviteOpen, setInviteOpen] = useState(false),
    [remove, setRemove] = useState<string>();
  const me = state.members.find((m) => m.id === actorId)!,
    canManage = ["owner", "admin"].includes(me.role);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>People & access</h1>
          <p>
            {state.workspace.name} · Manage people, roles, and project access.
          </p>
        </div>
        {canManage &&
          (state.workspace.kind === "team" ? (
            <button
              className="button primary"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={16} />
              Invite a teammate
            </button>
          ) : (
            me.role === "owner" && (
              <button
                className="button primary"
                onClick={() =>
                  run(
                    () => enableCollaboration(),
                    "Collaboration enabled for this app",
                  )
                }
              >
                <UserPlus size={16} />
                Enable collaboration
              </button>
            )
          ))}
      </div>
      <div className="team-summary">
        <div>
          <h2>
            {state.members.length}{" "}
            {state.members.length === 1 ? "person" : "people"}
          </h2>
          <p>Access applies to the projects in this application.</p>
        </div>
        <span className="badge neutral">{me.role}</span>
      </div>
      {state.workspace.kind === "personal" && (
        <p className="collaboration-notice">
          Enable collaboration to invite people into this app. Shared projects
          will be accessible to the members you invite. Private projects keep
          their access restrictions.
        </p>
      )}
      <section className="panel member-table">
        <div className="list-label">
          <span>PERSON</span>
          <span>ROLE & ACCESS</span>
        </div>
        {state.members.map((m) => (
          <div className="member-row" key={m.id}>
            <Avatar name={m.name} color={m.color} />
            <div>
              <strong>
                {m.name}
                {m.id === actorId && <span className="muted"> (you)</span>}
              </strong>
              <small>{m.email}</small>
            </div>
            <span className="role-badge">{m.role}</span>
            <span className="member-task-count">
              {
                state.tasks.filter(
                  (t) =>
                    t.assigneeId === m.id &&
                    ![
                      "done",
                      "archived",
                      "blocked",
                      "canceled",
                      "rejected",
                    ].includes(t.status),
                ).length
              }{" "}
              active tasks
            </span>
            {canManage && m.id !== actorId && m.role !== "owner" ? (
              <button
                className="icon-button danger-text"
                aria-label={"Remove " + m.name}
                onClick={() => setRemove(m.id)}
              >
                <Trash2 size={15} />
              </button>
            ) : (
              <ShieldCheck size={16} className="muted" />
            )}
          </div>
        ))}
      </section>
      <div className="section-line history-heading">
        <h2>Invitations</h2>
        <span className="muted">Secure links · expire after 7 days</span>
      </div>
      {state.invitations.length ? (
        <section className="panel member-table">
          {state.invitations.map((i) => (
            <div className="member-row" key={i.id}>
              <span className="invite-avatar">
                <Mail size={17} />
              </span>
              <div>
                <strong>{i.email}</strong>
                <small>
                  Expires {new Date(i.expiresAt).toLocaleDateString()}
                </small>
              </div>
              <span className="role-badge">{i.role}</span>
              <span className="badge neutral">
                {i.status} ·{" "}
                {i.deliveryStatus === "sent"
                  ? "Email sent"
                  : i.deliveryStatus === "queued"
                    ? "Email queued"
                    : i.deliveryStatus === "failed"
                      ? "Email failed"
                      : "Link only"}
              </span>
              {i.status === "pending" && (
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    run(
                      () => dispatch({ type: "revoke_invitation", id: i.id }),
                      "Invitation revoked",
                    )
                  }
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </section>
      ) : (
        <div className="invitation-empty">
          <Link2 size={20} />
          <p>
            A secure invitation link is all you need.
            <br />
            <span>
              Email delivery is optional; a signup link always remains
              available.
            </span>
          </p>
        </div>
      )}
      <div className="team-privacy-note">
        <ShieldCheck size={21} />
        <div>
          <strong>Calendar access</strong>
          <p>
            Teammates control their own calendars and planning approvals. App
            access does not reveal private calendar details. Guests only see
            projects explicitly shared with them.
          </p>
        </div>
      </div>
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a teammate"
        description="Only the intended verified email address can accept this link."
      >
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await run(
              () =>
                dispatch({
                  type: "invite",
                  email: String(f.get("email")),
                  role: f.get("role") as "member",
                  projectIds: f.getAll("project").map(String),
                }),
              "Invitation created",
            );
          }}
        >
          <label>
            Teammate’s email
            <input
              name="email"
              type="email"
              required
              placeholder="name@example.com"
            />
          </label>
          <label>
            Role
            <select name="role">
              <option value="member">Member · shared projects</option>
              <option value="admin">Admin · manage projects and people</option>
              <option value="guest">
                Guest · explicitly selected projects only
              </option>
            </select>
          </label>
          <fieldset>
            <legend>Project access</legend>
            {state.projects.map((p) => (
              <label className="check-label" key={p.id}>
                <input name="project" type="checkbox" value={p.id} />
                {p.title}
              </label>
            ))}
          </fieldset>
          {inviteUrl && (
            <div className="invitation-link">
              <span>
                {demo ? "Demo result" : "Share this link with your teammate"}
              </span>
              <input aria-label="Invitation link" readOnly value={inviteUrl} />
              {!demo && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    run(
                      () => navigator.clipboard.writeText(inviteUrl),
                      "Link copied",
                    )
                  }
                >
                  <Copy size={14} />
                  Copy link
                </button>
              )}
            </div>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() => setInviteOpen(false)}
            >
              Done
            </button>
            <button className="button primary">
              Invite teammate
              <ArrowUpRight size={15} />
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(undefined)}
        title="Remove this teammate?"
        description="Their app access and future scheduling authority will be revoked."
      >
        <p className="modal-prose">
          Their open tasks become unassigned. Historical contributions and
          accepted plans keep their attribution.
        </p>
        <div className="modal-footer">
          <button
            className="button secondary"
            onClick={() => setRemove(undefined)}
          >
            Keep teammate
          </button>
          <button
            className="button danger"
            onClick={async () => {
              const r = await run(
                () => dispatch({ type: "remove_member", id: remove! }),
                "Access revoked; task history preserved",
              );
              if (r) setRemove(undefined);
            }}
          >
            Remove teammate
          </button>
        </div>
      </Modal>
    </div>
  );
}
export function SettingsPage({
  connections = false,
}: {
  connections?: boolean;
}) {
  const { state, actorId, dispatch, calendar, demo, reset } = useData(),
    { run, notify } = useUI(),
    [params, setParams] = useSearchParams(),
    [tab, setTab] = useState(
      params.get("calendar")
        ? "calendar"
        : (params.get("tab") ?? (connections ? "overview" : "planning")),
    ),
    [prefs, setPrefs] = useState<Preferences>(
      state.members.find((m) => m.id === actorId)?.preferences ?? defaults,
    ),
    [calendarList, setCalendarList] = useState<
      { id: string; name: string; writable: boolean }[]
    >([]);
  useEffect(
    () =>
      setPrefs(
        state.members.find((m) => m.id === actorId)?.preferences ?? defaults,
      ),
    [state.workspace.id, actorId],
  );
  const cal = state.calendars.find((c) => c.ownerId === actorId);
  useEffect(() => {
    const valid = connections
      ? ["overview", "calendar", "mcp", "activity"]
      : ["account", "planning", "workspace", "data"];
    const requested = params.get("tab");
    setTab(
      params.get("calendar")
        ? "calendar"
        : requested && valid.includes(requested)
          ? requested
          : connections
            ? "overview"
            : "planning",
    );
    if (params.get("calendar")) {
      setTab("calendar");
      if (params.get("calendar") === "error")
        notify(
          "Google consent was not completed. Start the connection again.",
          true,
        );
    }
  }, [params, connections]);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));
  const exportData = () => {
    const data = {
      format: "kazi-export/1",
      exportedAt: Date.now(),
      synthetic: demo,
      data: state,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "kazi-export-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    notify("Your authorized application data was exported");
  };
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>{connections ? "Connections" : "Settings"}</h1>
          <p>
            {connections
              ? "Calendar, MCP, and access for your agents."
              : "Your account, planning preferences, and app settings."}
          </p>
        </div>
        <span className="badge neutral">
          {state.members.find((m) => m.id === actorId)?.name}
        </span>
      </div>
      <div className="tabs settings-tabs">
        {(connections
          ? [
              { id: "overview", label: "Overview" },
              { id: "calendar", label: "Calendar" },
              { id: "mcp", label: "MCP & agents" },
              { id: "activity", label: "Activity" },
            ]
          : [
              { id: "account", label: "My account" },
              { id: "planning", label: "Planning" },
              { id: "workspace", label: "General" },
              { id: "data", label: "Data & app" },
            ]
        ).map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "account" && <AccountSettings />}
      {tab === "workspace" && <WorkspaceSettings />}
      {tab === "overview" && <ConnectionsOverview />}
      {tab === "mcp" && <McpSettings />}
      {tab === "activity" && <McpActivity />}
      {tab === "planning" && (
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(
              () => dispatch({ type: "preferences", preferences: prefs }),
              "Preferences saved",
            );
          }}
        >
          <section className="settings-section">
            <div>
              <h2>Plan approval</h2>
              <p>Choose how new recovery plans reach your calendar.</p>
            </div>
            <div className="review-setting">
              <div>
                <ShieldCheck size={23} />
                <div>
                  <strong>Review new plans before scheduling</strong>
                  <p>
                    {prefs.reviewRequired
                      ? "Kazi prepares a proposal. You approve it before anything is scheduled."
                      : "Kazi can create and schedule recovery plans automatically within your planning preferences."}
                  </p>
                </div>
              </div>
              <button
                className={cx("switch", prefs.reviewRequired && "on")}
                role="switch"
                aria-checked={prefs.reviewRequired}
                aria-label="Review new plans before scheduling"
                type="button"
                onClick={() => update("reviewRequired", !prefs.reviewRequired)}
              >
                <span />
              </button>
            </div>
            {!prefs.reviewRequired && (
              <div className="automatic-notice">
                <AlertTriangle size={19} />
                <p>
                  <strong>Automatic recovery · your calendar only.</strong>{" "}
                  Saving this enables eligible recovery scheduling within your
                  working hours, capacity, and horizon. Other teammates still
                  control their own review settings. Earlier plans and events
                  remain unchanged.
                </p>
              </div>
            )}
          </section>
          <section className="settings-section">
            <div>
              <h2>Working hours & capacity</h2>
              <p>Set the hours and capacity available for work sessions.</p>
            </div>
            <div className="form form-grid">
              <label>
                Time zone
                <select
                  value={prefs.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                >
                  {[
                    ...new Set([
                      prefs.timezone,
                      "America/Chicago",
                      "America/New_York",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Africa/Lagos",
                      "Africa/Nairobi",
                      "Asia/Kolkata",
                      "Asia/Tokyo",
                      "Australia/Sydney",
                      "UTC",
                    ]),
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <label>
                Daily focus capacity (minutes)
                <input
                  type="number"
                  min="30"
                  max="720"
                  step="15"
                  value={prefs.dailyMinutes}
                  onChange={(e) =>
                    update("dailyMinutes", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Day starts
                <select
                  value={prefs.startHour}
                  onChange={(e) => update("startHour", Number(e.target.value))}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Day ends
                <select
                  value={prefs.endHour}
                  onChange={(e) => update("endHour", Number(e.target.value))}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h + 1} value={h + 1}>
                      {String(h + 1).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="working-days"
              role="group"
              aria-label="Working days"
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (day, i) => (
                  <button
                    type="button"
                    aria-pressed={prefs.workingDays.includes(i + 1)}
                    className={
                      prefs.workingDays.includes(i + 1) ? "selected" : ""
                    }
                    key={day}
                    onClick={() =>
                      update(
                        "workingDays",
                        prefs.workingDays.includes(i + 1)
                          ? prefs.workingDays.filter((d) => d !== i + 1)
                          : [...prefs.workingDays, i + 1],
                      )
                    }
                  >
                    {day}
                  </button>
                ),
              )}
            </div>
            <div className="form form-grid three">
              <label>
                Shortest session (min)
                <input
                  type="number"
                  min="15"
                  max="120"
                  step="15"
                  value={prefs.minSession}
                  onChange={(e) => update("minSession", Number(e.target.value))}
                />
              </label>
              <label>
                Longest session (min)
                <input
                  type="number"
                  min="15"
                  max="240"
                  step="15"
                  value={prefs.maxSession}
                  onChange={(e) => update("maxSession", Number(e.target.value))}
                />
              </label>
              <label>
                Space between sessions (min)
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="5"
                  value={prefs.bufferMinutes}
                  onChange={(e) =>
                    update("bufferMinutes", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </section>
          <section className="settings-section">
            <div>
              <h2>Notifications & planning horizon</h2>
              <p>
                In-app alerts respect these hours. Backend reminders continue
                when your browser is closed.
              </p>
            </div>
            <div className="form form-grid three">
              <label>
                Quiet hours begin
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={prefs.quietStart}
                  onChange={(e) => update("quietStart", Number(e.target.value))}
                />
              </label>
              <label>
                Quiet hours end
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={prefs.quietEnd}
                  onChange={(e) => update("quietEnd", Number(e.target.value))}
                />
              </label>
              <label>
                Planning horizon (days)
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={prefs.horizonDays}
                  onChange={(e) =>
                    update("horizonDays", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <p className="muted settings-footnote">
              Deadline checkpoints: 72h and 24h. Overdue work receives one
              initial alert. Acknowledging an alert does not complete its task.
            </p>
          </section>
          <section className="settings-section">
            <h2>Workflow review thresholds</h2>
            <p>
              Flag tasks for review after this many days in a stage. To
              Brainstorm ideas wait until their review date.
            </p>
            <div className="form-grid">
              {(["backlog", "todo", "in_progress", "to_validate"] as const).map(
                (stage) => (
                  <label key={stage}>
                    {
                      {
                        backlog: "Backlog",
                        todo: "To do",
                        in_progress: "In progress",
                        to_validate: "To validate",
                      }[stage]
                    }{" "}
                    · days
                    <input
                      type="number"
                      aria-label={stage + " aging threshold"}
                      min={1}
                      max={stage === "backlog" ? 730 : 365}
                      value={
                        prefs.agingDays?.[stage] ?? defaultAgingDays[stage]
                      }
                      onChange={(e) =>
                        update("agingDays", {
                          ...defaultAgingDays,
                          ...prefs.agingDays,
                          [stage]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
          </section>
          <div className="settings-save">
            <span>Applies to your calendar and planning preferences.</span>
            <button className="button primary">
              <Check size={15} />
              Save preferences
            </button>
          </div>
        </form>
      )}
      {tab === "calendar" && <AgendaSettings />}
      {tab === "data" && (
        <div className="settings-form">
          <section className="settings-section">
            <h2>Export application data</h2>
            <p>
              Export the projects, tasks, activity, and accepted plan history
              you’re authorized to access. Calendar credentials and
              authentication secrets are never included.
            </p>
            <button className="button secondary" onClick={exportData}>
              <Download size={16} />
              Export my data
            </button>
          </section>
          <section className="settings-section">
            <h2>Install Kazi</h2>
            <p>
              Use your browser’s Install option, or Share → Add to Home Screen
              on supported iPhone and iPad browsers. The application shell works
              offline. Sign-in, changes, approvals, and calendar confirmation
              require connectivity.
            </p>
            <p className="muted">
              Private live data is not stored in the offline cache. Backend
              reminders run on Convex; installing the app does not create a
              background job on your device.
            </p>
          </section>
          <section className="settings-section">
            <h2>Connection & service status</h2>
            <div className="diagnostic-row">
              <span>Application mode</span>
              <strong>
                {demo ? "Synthetic local demo" : "Clerk + Convex"}
              </strong>
            </div>
            <div className="diagnostic-row">
              <span>Calendar authority</span>
              <strong>
                {cal?.status === "demo"
                  ? "Fixture only"
                  : (cal?.status ?? "Disconnected")}
              </strong>
            </div>
            <div className="diagnostic-row">
              <span>Required paid services</span>
              <strong>None in the core design</strong>
            </div>
            <p className="muted">
              Check actual service usage in the Convex and Cloudflare dashboards
              before increasing rollout. No automatic billing upgrade is
              configured.
            </p>
          </section>
          {demo && (
            <section className="settings-section">
              <h2>Reset demo</h2>
              <p>
                Reset the demonstration data on this browser. This does not
                touch any live account.
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  reset();
                  notify("Synthetic demo reset");
                }}
              >
                <RefreshCw size={15} />
                Reset demo data
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
export function JoinPage() {
  const [params] = useSearchParams(),
    { acceptInvite } = useData(),
    { run } = useUI();
  return (
    <div className="page">
      <section className="join-card">
        <span className="empty-mark">✳</span>
        <h1>Join Kazi</h1>
        <p>
          Accept this invitation using the verified email address it was sent
          to. You’ll only gain the access included in the invitation.
        </p>
        <button
          className="button primary"
          onClick={() =>
            run(
              () => acceptInvite(params.get("token") ?? ""),
              "Invitation accepted. Welcome to the team.",
            )
          }
        >
          <Users size={16} />
          Accept invitation
        </button>
      </section>
    </div>
  );
}
