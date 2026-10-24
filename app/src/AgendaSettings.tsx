import { useState, useEffect } from "react";
import { CalendarDays, Copy, Download, Link2, RefreshCw } from "lucide-react";
import { useData } from "./data";
import { useUI } from "./components";

export function AgendaSettings() {
  const { state, actorId, dispatch, agenda, feeds, calendar, demo, online } =
    useData();
  const { run } = useUI();
  const cal = state.calendars.find((c) => c.ownerId === actorId);
  const [url, setUrl] = useState("");
  const [projectId, setProject] = useState("");
  const [deadlines, setDeadlines] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setUrl("");
    setProject("");
    setCalendars(undefined);
  }, [state.workspace.id]);
  const native = cal?.destinationId === "kazi";
  return (
    <div className="settings-form">
      <section className="settings-section">
        <div className="integration-heading">
          <CalendarDays size={28} />
          <div>
            <h2>Kazi agenda</h2>
            <p>Your confirmed focus sessions, available in any calendar app.</p>
          </div>
          <span className="badge neutral">
            {native ? "Active" : demo ? "Demo" : "Available"}
          </span>
        </div>
        <p>
          Approve a plan to reserve time in Kazi. A private calendar link
          publishes your confirmed sessions as busy time. Task deadlines can be
          included as reminders that keep the day free.
        </p>
        {!native && (
          <button
            className="button primary"
            disabled={!online}
            onClick={() =>
              run(
                () => dispatch({ type: "use_kazi_agenda" }),
                "Kazi agenda enabled",
              )
            }
          >
            Use Kazi agenda
          </button>
        )}
        <div className="form-grid">
          <label>
            Project
            <select
              aria-label="Calendar subscription project"
              value={projectId}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All my projects</option>
              {state.projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={deadlines}
              onChange={(e) => setDeadlines(e.target.checked)}
            />
            Include task deadlines
          </label>
        </div>
        <div className="integration-actions">
          <button
            className="button primary"
            disabled={demo || !online || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const result = await run(() =>
                  agenda("create", {
                    label: projectId
                      ? state.projects.find((p) => p.id === projectId)?.title
                      : "My Kazi agenda",
                    projectId: projectId || undefined,
                    includeDeadlines: deadlines,
                  }),
                );
                if (result) setUrl((result as { url: string }).url);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Link2 size={15} />
            {saving ? "Creating…" : "Create calendar link"}
          </button>
          <button
            className="button secondary"
            disabled={!online}
            onClick={() =>
              run(async () => {
                const body = await agenda("export", {
                  projectId: projectId || undefined,
                  includeDeadlines: deadlines,
                });
                const blob = URL.createObjectURL(
                  new Blob([String(body)], {
                    type: "text/calendar;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = blob;
                a.download = "kazi-agenda.ics";
                a.click();
                URL.revokeObjectURL(blob);
              }, "Calendar downloaded")
            }
          >
            <Download size={15} />
            Download ICS
          </button>
        </div>
        {url && (
          <div className="calendar-feed-created">
            <label>
              Private subscription URL
              <input
                readOnly
                value={url}
                aria-label="Private calendar subscription URL"
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="button secondary"
              onClick={() =>
                run(
                  () => navigator.clipboard.writeText(url),
                  "Calendar link copied",
                )
              }
            >
              <Copy size={15} />
              Copy link
            </button>
            <p>
              Save this link now. Anyone with it can read your agenda. Revoke it
              below to stop future access.
            </p>
            {/^https?:\/\/(127\.|localhost|\[::1\])/.test(url) && (
              <p className="inline-info">
                This development link works locally. Google and Outlook need a
                publicly reachable HTTPS backend to subscribe.
              </p>
            )}
          </div>
        )}
        <div className="calendar-feed-list">
          {feeds.map((feed) => (
            <div key={feed.id} className="calendar-feed-row">
              <span>
                <strong>{feed.label}</strong>
                <small>
                  {feed.revoked
                    ? "Revoked"
                    : feed.expiresAt < Date.now()
                      ? "Expired"
                      : "Active"}{" "}
                  ·{" "}
                  {feed.includeDeadlines
                    ? "Sessions & deadlines"
                    : "Focus sessions"}{" "}
                  · Expires {new Date(feed.expiresAt).toLocaleDateString()}
                </small>
              </span>
              {!feed.revoked && (
                <button
                  className="text-button danger-text"
                  disabled={!online}
                  onClick={() =>
                    run(
                      () => agenda("revoke", { id: feed.id }),
                      "Calendar link revoked",
                    )
                  }
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="settings-footnote">
          In Google Calendar choose “Other calendars → From URL”. In Outlook
          choose “Add calendar → Subscribe from web”. In Apple Calendar choose
          “File → New Calendar Subscription”. Subscribe to the link for updates;
          importing a downloaded file creates a snapshot.
        </p>
        <p className="settings-footnote">
          Your calendar provider controls refresh timing; updates can take over
          24 hours. For Google appointment schedules, select the subscribed Kazi
          calendar under calendars checked for availability. Eligible plans are
          required. Verify it before relying on it for bookings.
        </p>
        {demo && (
          <p className="inline-info">
            The demo supports ICS download. Live, revocable subscription links
            require the connected backend.
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>External availability · optional</h2>
        <p>
          Read Google free/busy times to avoid planning over outside meetings.
          Kazi publishes through its own agenda; the connection reads
          availability only.
        </p>
        {cal?.error && (
          <p role="alert" className="inline-error">
            {cal.error}
          </p>
        )}
        <div className="integration-actions">
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                const link = await calendar("connect");
                if (typeof link === "string") location.assign(link);
              })
            }
          >
            <Link2 size={15} />
            Connect Google availability
          </button>
          <button
            className="button secondary"
            onClick={() =>
              run(async () =>
                setCalendars((await calendar("list")) as typeof calendars),
              )
            }
          >
            Choose calendars
          </button>
          {!!cal?.selectedIds.length && (
            <button
              className="button secondary"
              onClick={() =>
                run(() => calendar("refresh"), "Availability refreshed")
              }
            >
              <RefreshCw size={15} />
              Refresh availability
            </button>
          )}
        </div>
        {calendars && (
          <form
            className="form calendar-selection"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await run(
                () =>
                  calendar("choose", {
                    selectedIds: f.getAll("calendar").map(String),
                    destinationId: "kazi",
                    shareAvailability: f.get("share") === "on",
                  }),
                "Availability calendars saved",
              );
            }}
          >
            <fieldset>
              <legend>Calendars to check for conflicts</legend>
              {calendars.map((c) => (
                <label className="check-label" key={c.id}>
                  <input
                    type="checkbox"
                    name="calendar"
                    value={c.id}
                    defaultChecked={cal?.selectedIds.includes(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </fieldset>
            <label className="check-label">
              <input
                type="checkbox"
                name="share"
                defaultChecked={cal?.shareAvailability}
              />
              Share only free/busy availability with team planners
            </label>
            <button className="button primary">
              Save availability calendars
            </button>
          </form>
        )}
        {!!cal?.selectedIds.length && (
          <button
            className="text-button danger-text"
            onClick={() =>
              run(
                () => calendar("disconnect"),
                "External availability disconnected; Kazi agenda remains active",
              )
            }
          >
            Disconnect Google availability
          </button>
        )}
        <p className="settings-footnote">
          Without external availability, planning checks your Kazi reservations
          and working hours. It cannot know about outside meetings. Old Google
          events already created by Kazi remain in Google when switching to
          subscriptions.
        </p>
      </section>
    </div>
  );
}
