import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  Clock3,
  ArrowUpRight,
  CalendarDays,
  RefreshCw,
  Check,
  Users,
} from "lucide-react";
import { PageTitle } from "./InfoTip";
import { useData } from "./data";
import { useUI, Empty, cx } from "./components";
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
export { TeamPage } from "./TeamsPage";
export { SettingsPage } from "./SettingsPage";
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
