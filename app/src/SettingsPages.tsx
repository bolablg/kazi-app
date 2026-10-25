import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  Clock3,
  ArrowUpRight,
  CalendarDays,
  RefreshCw,
  Check,
  CheckCircle2,
  Users,
} from "lucide-react";
import { PageTitle } from "./InfoTip";
import { useData } from "./data";
import { useUI, Empty, cx } from "./components";
import { useCurrentMinute } from "./WorkViewScope";
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
  const now = useCurrentMinute();
  const available = state.notifications.filter(
    (n) => (!n.snoozedUntil || n.snoozedUntil <= now) && n.deliveryAt <= now,
  );
  const items = available
    .filter((n) => filter === "all" || !n.read)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="page notifications-page">
      <div className="page-heading">
        <div>
          <PageTitle help="Task reminders, mentions, and plans that need your review. Marking a notification as read does not complete its task.">
            Notifications
          </PageTitle>
        </div>
        <Link className="button secondary" to="/settings">
          <Bell size={15} />
          Notification preferences
        </Link>
      </div>
      <div className="tabs">
        <button
          className={filter === "unread" ? "active" : ""}
          aria-pressed={filter === "unread"}
          onClick={() => setFilter("unread")}
        >
          Unread <span>{available.filter((n) => !n.read).length}</span>
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          aria-pressed={filter === "all"}
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
                n.proposalId ? (
                  <CalendarDays size={21} />
                ) : (
                  <CheckCircle2 size={21} />
                )
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
                      ? n.proposalId
                        ? "PLAN REVIEW"
                        : "TASK REVIEW"
                      : n.kind === "stale"
                        ? "WORKFLOW REVIEW"
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
export { TeamPage } from "./TeamsPage";
export { SettingsPage } from "./SettingsPage";
export function JoinPage() {
  const [params] = useSearchParams(),
    { acceptInvite } = useData(),
    { run } = useUI();
  const token = params.get("token");
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  return (
    <div className="page">
      <section className="join-card">
        <span className="join-emblem">
          <Users size={24} aria-hidden="true" />
        </span>
        <h1>{token ? "Join Kazi" : "Invitation link missing"}</h1>
        <p>
          {token
            ? "Accept using the verified email address this invitation was sent to. You’ll receive the access included in the invitation."
            : "Open the complete invitation link from your teammate to join their team."}
        </p>
        {token ? (
          <button
            className="button primary"
            disabled={accepting}
            onClick={async () => {
              setAccepting(true);
              try {
                const accepted = await run(async () => {
                  await acceptInvite(token);
                  return true;
                }, "Invitation accepted. Welcome to the team.");
                if (accepted) navigate("/", { replace: true });
              } finally {
                setAccepting(false);
              }
            }}
          >
            <Users size={16} />
            {accepting ? "Joining…" : "Accept invitation"}
          </button>
        ) : (
          <Link className="button secondary" to="/">
            Back to overview
          </Link>
        )}
      </section>
    </div>
  );
}
