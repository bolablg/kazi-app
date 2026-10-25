import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  Clock3,
  Plus,
  GitBranch,
  History,
  AlertTriangle,
  RefreshCw,
  Layers,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useData } from "./data";
import {
  Modal,
  useUI,
  Empty,
  duration,
  dueLabel,
  cx,
  ProjectTag,
} from "./components";
import { type Proposal, type Version } from "../shared/model";
import { addDays, dateInZone, MINUTE } from "../shared/scheduler";
const time = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(at);
const date = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone,
  }).format(at);
const stateLabel = {
  awaiting_review: "Awaiting your review",
  applying: "Scheduling in progress",
  applied: "On your calendar",
  partial: "Partially scheduled",
  rejected: "Not scheduled",
  stale: "Needs a fresh preview",
  failed: "Scheduling needs attention",
};
export function PlanReview({
  id,
  onClose,
}: {
  id: string | undefined;
  onClose: () => void;
}) {
  const { state, actorId, dispatch, demo, online } = useData(),
    { run } = useUI();
  const [saving, setSaving] = useState(false);
  const p = state.proposals.find((p) => p.id === id);
  if (!p) return null;
  const a = p.alternatives[p.selected],
    me = state.members.find((m) => m.id === actorId)!,
    zone = me.preferences.timezone,
    parent = state.versions.find((v) => v.id === p.parentVersionId),
    project = state.projects.find((x) => x.id === p.projectId),
    accepted = state.versions.find((v) => v.proposalId === p.id),
    pending = p.status === "awaiting_review";
  const approve = async () => {
    setSaving(true);
    await run(
      () => dispatch({ type: "approve", id: p.id, revision: p.revision }),
      demo
        ? "Demo scheduling receipt updated"
        : "Approval recorded. Calendar writes will be confirmed in the scheduling receipt.",
    );
    setSaving(false);
  };
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={
        p.trigger === "recovery"
          ? `Review recovery plan: ${p.title}`
          : "Review weekly plan"
      }
      description={`${stateLabel[p.status]} · Revision ${p.revision}${demo ? " · Synthetic demonstration" : ""}`}
      wide
    >
      <div className="plan-review">
        <div className="plan-lineage-banner">
          <span className="lineage-node">
            {parent ? "Plan " + parent.number : "Your work"}
          </span>
          <ArrowRight size={19} />
          <span className="lineage-node active">
            Plan {accepted?.number ?? (parent?.number ?? 0) + 1}
            {pending ? " · proposed" : ""}
          </span>
          <span>
            <ShieldCheck size={14} />
            {parent ? "Previous plan preserved" : "Review before scheduling"}
          </span>
        </div>
        {p.trigger === "recovery" && (
          <div className="deadline-comparison">
            <div>
              <span>ORIGINAL DEADLINE</span>
              <strong>
                {dueLabel(
                  project?.deadline ??
                    state.tasks.find(
                      (t) => p.taskRevisions[t.id] !== undefined && t.deadline,
                    )?.deadline,
                )}
              </strong>
              <small>Preserved in the original plan</small>
            </div>
            <ArrowRight size={18} />
            <div>
              <span>RECOVERY TARGET</span>
              <strong>
                {p.recoveryTarget ? dueLabel(p.recoveryTarget) : "Not set"}
              </strong>
              <small>A target, separate from the deadline</small>
            </div>
          </div>
        )}
        <div className="review-totals">
          <div>
            <strong>{duration(a.scheduledMinutes)}</strong>
            <span>planned focus time</span>
          </div>
          <div>
            <strong>{a.sessions.length}</strong>
            <span>work sessions</span>
          </div>
          <div className={a.remainingMinutes ? "warning-text" : ""}>
            <strong>{duration(a.remainingMinutes)}</strong>
            <span>unscheduled</span>
          </div>
        </div>
        {pending && p.alternatives.length > 1 && (
          <div
            className="alternative-picker"
            role="group"
            aria-label="Plan alternatives"
          >
            {p.alternatives.map((alt, index) => (
              <button
                key={index}
                className={p.selected === index ? "selected" : ""}
                onClick={() =>
                  run(
                    () =>
                      dispatch({
                        type: "select_alternative",
                        id: p.id,
                        revision: p.revision,
                        selected: index,
                      }),
                    "Alternative selected. Previous approvals cleared.",
                  )
                }
              >
                <span>
                  OPTION {index + 1}
                  {p.selected === index && <Check size={13} />}
                </span>
                <strong>
                  {index === 0
                    ? "Earlier progress"
                    : index === 1
                      ? "A later focus"
                      : "Fewer, longer blocks"}
                </strong>
                <small>
                  {alt.sessions.length} sessions ·{" "}
                  {duration(alt.scheduledMinutes)}
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="section-line">
          <h3>{pending ? "Proposed sessions" : "Scheduling receipt"}</h3>
          <span className="muted">{zone.replaceAll("_", " ")}</span>
        </div>
        <div className="review-sessions">
          {a.sessions.map((session) => {
            const task = state.tasks.find((t) => t.id === session.taskId),
              owner = state.members.find((m) => m.id === session.assigneeId);
            return (
              <div className="review-session" key={session.id}>
                <span className="review-session-date">
                  {date(session.start, zone)}
                  <small>
                    {time(session.start, zone)} – {time(session.end, zone)}
                  </small>
                </span>
                <div>
                  <strong>{task?.title ?? "Archived task"}</strong>
                  <small>
                    {owner?.name ?? "Former member"} ·{" "}
                    {duration((session.end - session.start) / MINUTE)}
                  </small>
                  {session.error && (
                    <p className="warning-text">{session.error}</p>
                  )}
                </div>
                <span
                  className={cx(
                    "badge",
                    session.status === "scheduled"
                      ? "olive"
                      : session.status === "failed"
                        ? "clay"
                        : "neutral",
                  )}
                >
                  {demo && session.status === "scheduled"
                    ? "Demo confirmed"
                    : session.status === "pending"
                      ? "Awaiting sync"
                      : session.status}
                </span>
              </div>
            );
          })}
        </div>
        {!a.sessions.length && (
          <Empty
            title="Missing planning details"
            body="Check estimates, ownership, calendar connection, and your planning horizon."
          />
        )}
        {a.unscheduled.length > 0 && (
          <div className="shortfall">
            <div>
              <AlertTriangle size={18} />
              <h3>
                {a.remainingMinutes
                  ? `${duration(a.remainingMinutes)} still unscheduled.`
                  : "Some work is awaiting information."}
              </h3>
            </div>
            <p>
              Reduce scope, adjust an estimate, ask for help, or choose a later
              recovery target. Your deadline stays unchanged.
            </p>
            {a.unscheduled.map((u) => (
              <div className="unscheduled-item" key={u.taskId}>
                <strong>
                  {state.tasks.find((t) => t.id === u.taskId)?.title}
                  {u.minutes ? " · " + duration(u.minutes) : ""}
                </strong>
                <small>{u.reason}</small>
              </div>
            ))}
          </div>
        )}
        <details className="planning-explanation">
          <summary>How this plan was made</summary>
          <ul>
            {a.explanations.map((e) => (
              <li key={e}>{e}</li>
            ))}
            <li>
              Calendar availability checked{" "}
              {new Date(p.availabilityAt).toLocaleTimeString()}. It is checked
              again before calendar writes.
            </li>
            <li>
              Busy reservations from previous plans continue to block time.
            </li>
          </ul>
        </details>
        <div className="approval-explanation">
          <ShieldCheck size={18} />
          <p>
            {me.preferences.reviewRequired || project?.reviewRequired
              ? "You’re in control. Review is on. Only you can approve sessions for your calendar."
              : "Automatic recovery is enabled within your personal constraints. Each teammate still controls their own calendar."}
            {demo
              ? " This demo simulates writes; it does not connect to Google Calendar."
              : ""}
          </p>
        </div>
        {accepted &&
          a.sessions.some(
            (s) =>
              s.assigneeId === actorId &&
              s.start > Date.now() &&
              s.status === "scheduled",
          ) && (
            <details className="release-reservations">
              <summary>Release selected future reservations</summary>
              <p>
                This removes only the checked future focus events from your
                calendar. The original plan snapshot stays in history. This is
                separate from creating a recovery plan.
              </p>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const sessionIds = new FormData(e.currentTarget)
                    .getAll("release")
                    .map(String);
                  if (!sessionIds.length) return;
                  await run(
                    () =>
                      dispatch({
                        type: "release_sessions",
                        versionId: accepted.id,
                        sessionIds,
                      }),
                    demo
                      ? "Demo future reservations released; history preserved"
                      : "Release requested. Check the scheduling receipt for confirmation.",
                  );
                }}
              >
                {a.sessions
                  .filter(
                    (s) =>
                      s.assigneeId === actorId &&
                      s.start > Date.now() &&
                      s.status === "scheduled",
                  )
                  .map((s) => (
                    <label className="check-label" key={s.id}>
                      <input type="checkbox" name="release" value={s.id} />
                      {date(s.start, zone)} · {time(s.start, zone)} ·{" "}
                      {state.tasks.find((t) => t.id === s.taskId)?.title}
                    </label>
                  ))}
                <button className="button secondary" disabled={!online}>
                  Release selected future sessions
                </button>
              </form>
            </details>
          )}
        <div className="modal-footer">
          {pending ? (
            <>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() =>
                  run(
                    () =>
                      dispatch({
                        type: "reject",
                        id: p.id,
                        revision: p.revision,
                      }),
                    "Proposal rejected. Nothing was scheduled.",
                  )
                }
              >
                Not this plan
              </button>
              <button
                className="button primary"
                onClick={approve}
                disabled={!online || saving || !a.sessions.length}
              >
                <Check size={16} />
                {saving
                  ? "Checking availability…"
                  : a.unscheduled.length
                    ? "Approve available sessions"
                    : "Approve and schedule"}
              </button>
            </>
          ) : (
            <button className="button primary" onClick={onClose}>
              Back to my plans
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
export function PlannerForm({
  open,
  onClose,
  onCreated,
  initialProject,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  initialProject?: string;
}) {
  const { state, actorId, dispatch, teams, teamId } = useData(),
    { run } = useUI(),
    [saving, setSaving] = useState(false),
    [recovery, setRecovery] = useState(false),
    [planningTeam, setPlanningTeam] = useState(
      state.resourceTeams?.[initialProject ?? ""] ??
        (teamId === "all" ? teams[0]?.id : teamId),
    ),
    [planningProject, setPlanningProject] = useState(initialProject ?? "");
  const zone = state.members.find((m) => m.id === actorId)!.preferences
      .timezone,
    today = dateInZone(Date.now(), zone);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan work sessions"
      description="Realistic focus sessions, with space around them."
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setSaving(true);
          const id = await run(() =>
            dispatch(
              {
                type: "propose",
                projectId: planningProject || undefined,
                startDate: String(f.get("start")),
                days: Number(f.get("days")),
                trigger: recovery ? "recovery" : "weekly",
                recoveryTarget: recovery ? String(f.get("target")) : undefined,
              },
              { teamId: planningTeam },
            ),
          );
          setSaving(false);
          if (id) {
            onClose();
            onCreated(id);
          }
        }}
      >
        {teamId === "all" && teams.length > 1 && (
          <label>
            Team
            <select
              aria-label="Planning team"
              value={planningTeam}
              onChange={(event) => {
                setPlanningTeam(event.target.value);
                setPlanningProject("");
              }}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <small>
              Plan one team at a time. Existing reservations in your other teams
              still protect your availability.
            </small>
          </label>
        )}
        <label>
          What would you like to plan?
          <select
            name="projectId"
            value={planningProject}
            onChange={(event) => setPlanningProject(event.target.value)}
          >
            <option value="">My assigned work</option>
            {state.projects
              .filter(
                (p) =>
                  !p.archived &&
                  (!state.resourceTeams ||
                    state.resourceTeams[p.id] === planningTeam),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Start date
            <input
              type="date"
              name="start"
              defaultValue={today}
              min={today}
              required
            />
          </label>
          <label>
            Planning window
            <select name="days" defaultValue="7">
              <option value="7">One week</option>
              <option value="14">Two weeks</option>
              <option value="28">Four weeks (within saved horizon)</option>
            </select>
          </label>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={recovery}
            onChange={(e) => setRecovery(e.target.checked)}
          />
          Create a recovery proposal
        </label>
        {recovery && (
          <label>
            Proposed recovery target
            <input
              type="date"
              name="target"
              min={today}
              defaultValue={addDays(today, 6)}
              required
            />
            <small>
              Your original deadline and all earlier plans remain preserved.
            </small>
          </label>
        )}
        <div className="approval-explanation">
          <ShieldCheck size={19} />
          <p>
            This creates a preview. Sessions stay off your calendar until the
            required owners approve them.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? "Preparing preview…" : "Preview my plan"}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PlansPage({ openPlan }: { openPlan: (id: string) => void }) {
  const { state, actorId } = useData(),
    [params, setParams] = useSearchParams(),
    [planning, setPlanning] = useState(false),
    [comparing, setComparing] = useState(false);
  const tab = params.get("tab") === "history" ? "history" : "proposals",
    lineage = params.get("project") ?? "all",
    create = params.get("create") === "true";
  const changeQuery = (key: string, value: string) => {
    // Read the current URL so consecutive tab/filter actions retain each other
    // even before React has committed the preceding navigation.
    const next = new URLSearchParams(window.location.search);
    next.set(key, value);
    setParams(next);
  };
  useEffect(() => {
    if (!create) return;
    setPlanning(true);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }, [create, setParams]);
  const zone = state.members.find((m) => m.id === actorId)!.preferences
    .timezone;
  const proposals = state.proposals.filter(
      (p) =>
        (lineage === "all" || p.projectId === lineage) &&
        p.status === "awaiting_review",
    ),
    versions = state.versions
      .filter((v) => lineage === "all" || v.projectId === lineage)
      .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="page plans-page">
      <div className="page-heading">
        <div>
          <h1>Plans</h1>
          <p>Create proposals, review sessions, and track accepted plans.</p>
        </div>
        <div className="plans-heading-actions">
          <Link
            className="button secondary"
            to="/calendar?view=calendar&range=week"
          >
            <CalendarDays size={16} />
            Open calendar
          </Link>
          <button className="button primary" onClick={() => setPlanning(true)}>
            <Plus size={16} />
            New proposal
          </button>
        </div>
      </div>
      <div className="plans-policy">
        <ShieldCheck size={20} />
        <div>
          <strong>
            Review new plans before scheduling ·{" "}
            {state.members.find((m) => m.id === actorId)?.preferences
              .reviewRequired
              ? "ON"
              : "OFF"}
          </strong>
          <p>
            {state.members.find((m) => m.id === actorId)?.preferences
              .reviewRequired
              ? "You approve every new plan. A proposal alone never changes your calendar."
              : "Kazi can schedule eligible recovery plans automatically within your saved personal constraints."}
          </p>
        </div>
        <Link to="/settings" className="text-button">
          Manage
          <ArrowUpRight size={14} />
        </Link>
      </div>
      <div
        className="overview-tabs section-tabs"
        role="tablist"
        aria-label="Plan views"
      >
        {[
          { id: "proposals", label: "Proposals" },
          { id: "history", label: "History" },
        ].map((view) => (
          <button
            key={view.id}
            role="tab"
            id={"plans-tab-" + view.id}
            aria-selected={tab === view.id}
            aria-controls={"plans-" + view.id}
            onClick={() => changeQuery("tab", view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={"plans-" + tab}
        aria-labelledby={"plans-tab-" + tab}
      >
        <div className="filter-bar">
          <select
            aria-label="Filter plans by project"
            value={lineage}
            onChange={(e) => changeQuery("project", e.target.value)}
          >
            <option value="all">All projects</option>
            {state.projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {tab === "history" && (
            <button
              className="button secondary"
              disabled={versions.length < 2}
              onClick={() => setComparing(true)}
            >
              <Layers size={15} />
              Compare versions
            </button>
          )}
        </div>
        {tab === "proposals" ? (
          <>
            <div className="section-line">
              <h2>
                Ready for your review{" "}
                <span className="count">{proposals.length}</span>
              </h2>
            </div>
            <div className="proposal-grid">
              {proposals.map((p) => {
                const a = p.alternatives[p.selected],
                  parent = state.versions.find(
                    (v) => v.id === p.parentVersionId,
                  );
                return (
                  <article className="proposal-card" key={p.id}>
                    <div className="section-line">
                      <span className="badge gold">
                        {p.trigger === "recovery"
                          ? "Recovery proposal"
                          : "Weekly proposal"}
                      </span>
                      <GitBranch size={18} />
                    </div>
                    <h2>{p.title}</h2>
                    <p>
                      {p.trigger === "recovery"
                        ? `A fresh path forward${parent ? " from Plan " + parent.number : ""}, with your remaining work.`
                        : "A realistic plan, built around your available time."}
                    </p>
                    <div className="proposal-numbers">
                      <span>
                        <strong>{duration(a.scheduledMinutes)}</strong>planned
                        time
                      </span>
                      <span>
                        <strong>{a.sessions.length}</strong>focus sessions
                      </span>
                      {a.remainingMinutes > 0 && (
                        <span className="warning-text">
                          <strong>{duration(a.remainingMinutes)}</strong>
                          unscheduled
                        </span>
                      )}
                    </div>
                    <button
                      className="button primary"
                      onClick={() => openPlan(p.id)}
                    >
                      Review Plan {(parent?.number ?? 0) + 1}
                      <ArrowUpRight size={15} />
                    </button>
                    <small>
                      <ShieldCheck size={12} />
                      Nothing scheduled until approved
                    </small>
                  </article>
                );
              })}
              {!proposals.length && (
                <div className="panel">
                  <Empty
                    title="You’re all caught up."
                    body="Your next proposal will appear here, ready for your review."
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="section-line history-heading">
              <h2>Your plan history</h2>
              <span className="muted">
                <History size={14} />
                Accepted plan versions.
              </span>
            </div>
            <div className="history-list">
              {versions.map((v) => (
                <article className="history-card" key={v.id}>
                  <div className="history-line">
                    <span className="version-number">{v.number}</span>
                    <div>
                      <h3>
                        {state.projects.find((p) => p.id === v.projectId)
                          ?.title ?? "Personal plan"}{" "}
                        <span>· Plan {v.number}</span>
                      </h3>
                      <p>
                        {v.parentId
                          ? `Recovery from Plan ${state.versions.find((p) => p.id === v.parentId)?.number ?? "previous"}`
                          : "The original plan"}{" "}
                        · {date(v.createdAt, zone)}
                      </p>
                    </div>
                  </div>
                  <div className="history-metrics">
                    <span>{v.taskSnapshot.length} tasks</span>
                    <span>
                      {duration(
                        v.sessions.reduce(
                          (n, s) => n + (s.end - s.start) / MINUTE,
                          0,
                        ),
                      )}
                    </span>
                    <span className="badge neutral">
                      <ShieldCheck size={12} />
                      Preserved
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`View Plan ${v.number}`}
                      onClick={() => {
                        const p = state.proposals.find(
                          (p) => p.id === v.proposalId,
                        );
                        if (p) openPlan(p.id);
                        else {
                          changeQuery("project", v.projectId ?? "all");
                          setComparing(true);
                        }
                      }}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </article>
              ))}
              {!versions.length && (
                <Empty
                  title="No accepted plans yet"
                  body="Accepted plans will appear here. Rejected proposals do not consume a plan number."
                />
              )}
            </div>
          </>
        )}
      </section>
      <PlannerForm
        open={planning}
        onClose={() => setPlanning(false)}
        onCreated={openPlan}
        initialProject={lineage === "all" ? undefined : lineage}
      />
      <PlanComparison
        open={comparing}
        onClose={() => setComparing(false)}
        versions={versions}
      />
    </div>
  );
}
function PlanComparison({
  open,
  onClose,
  versions,
}: {
  open: boolean;
  onClose: () => void;
  versions: Version[];
}) {
  const { state } = useData();
  const [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  const a = versions.find((v) => v.id === left) ?? versions.at(-1),
    b = versions.find((v) => v.id === right) ?? versions[0];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compare plan versions"
      description="Accepted snapshots never change when the current task or calendar does."
      wide
    >
      <div className="comparison-controls">
        <select
          aria-label="Earlier plan"
          value={a?.id ?? ""}
          onChange={(e) => setLeft(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {state.projects.find((p) => p.id === v.projectId)?.title ??
                "Personal plan"}{" "}
              · Plan {v.number}
            </option>
          ))}
        </select>
        <ArrowRight size={18} />
        <select
          aria-label="Later plan"
          value={b?.id ?? ""}
          onChange={(e) => setRight(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Plan {v.number} · {v.trigger}
            </option>
          ))}
        </select>
      </div>
      {a && b ? (
        <>
          <div className="comparison-grid">
            {[a, b].map((v, i) => (
              <div key={i} className="comparison-version">
                <span className="eyebrow">IMMUTABLE SNAPSHOT</span>
                <h2>Plan {v.number}</h2>
                <p>
                  {v.trigger === "recovery" ? "Recovery plan" : "Original plan"}{" "}
                  · {v.sessions.length} sessions
                </p>
                {v.recoveryTarget && (
                  <p>Recovery target: {dueLabel(v.recoveryTarget)}</p>
                )}
                {v.taskSnapshot.map((t) => (
                  <div className="comparison-task" key={t.id}>
                    <strong>{t.title}</strong>
                    <span>
                      {t.status === "done"
                        ? "Completed"
                        : duration(t.remainingMinutes ?? 0) + " remaining"}
                    </span>
                    <small>Original deadline: {dueLabel(t.deadline)}</small>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="approval-explanation">
            <ShieldCheck size={18} />
            <p>
              Finished work stays finished. Recovery creates a new attempt for
              the same task; it never duplicates the task or rewrites an earlier
              calendar snapshot.
            </p>
          </div>
        </>
      ) : (
        <Empty
          title="Your history starts with Plan 1."
          body="Accept a proposal to create your first version."
        />
      )}
    </Modal>
  );
}
