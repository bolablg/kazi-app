import { projectStyle } from "./projectColors";
import { PageTitle } from "./InfoTip";
import { TaskLabels } from "./TaskLabels";
import { useState } from "react";
import {
  WorkViewFilters,
  useWorkViewScope,
  useCurrentMinute,
} from "./WorkViewScope";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Rows3,
  Clock3,
  ArrowUpRight,
  Link2,
} from "lucide-react";
import { useData } from "./data";
import { duration, cx } from "./components";
import { type WorkProps } from "./WorkPages";
import { CalendarTimeGrid } from "./CalendarTimeGrid";
import {
  calendarPeriod,
  moveCalendarDate,
  type CalendarScale,
} from "../shared/calendar";
import { isCommittedTask } from "../shared/workflow";
import { Temporal } from "@js-temporal/polyfill";
import { dateInZone, deadlineAt } from "../shared/scheduler";
import {
  overviewEvents,
  occupiedMinutes,
  type OverviewEvent,
} from "../shared/overview";
const kinds = {
  deadline: "Due",
  scheduled: "Scheduled",
  proposed: "Proposed",
  pending: "Sync pending",
  busy: "Busy",
};
const time = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(at);
const labelDate = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(day + "T12:00:00"));
export function CalendarPage(props: WorkProps) {
  const { state, actorId, demo } = useData();
  const zone = state.members.find((m) => m.id === actorId)!.preferences
    .timezone;
  const now = useCurrentMinute();
  const scope = useWorkViewScope();
  const { person, project } = scope;
  const today = dateInZone(now, zone);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "schedule" ? "schedule" : "calendar";
  const [anchor, setAnchor] = useState(today),
    [selected, setSelected] = useState(today),
    [drafts, setDrafts] = useState(false);
  const scale: CalendarScale = ["month", "week", "day"].includes(
    params.get("range") ?? "",
  )
    ? (params.get("range") as CalendarScale)
    : "month";
  const activeScale = view === "calendar" ? scale : "month";
  const period = calendarPeriod(anchor, activeScale);
  const days = period.days,
    month = anchor.slice(0, 7) + "-01";
  const monthDate = Temporal.PlainDate.from(month);
  const cellCount = days.length;
  const title =
    activeScale === "month"
      ? monthDate.toLocaleString("en-US", { month: "long", year: "numeric" })
      : activeScale === "day"
        ? Temporal.PlainDate.from(anchor).toLocaleString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : `${Temporal.PlainDate.from(period.start).toLocaleString("en-US", { month: "short", day: "numeric", ...(period.start.slice(0, 4) !== period.end.slice(0, 4) ? { year: "numeric" } : {}) })} – ${Temporal.PlainDate.from(period.end).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const updateView = (next: string) =>
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous);
      nextParams.set("view", next);
      return nextParams;
    });
  const changeScale = (next: CalendarScale) => {
    setAnchor(selected);
    setParams((previous) => {
      const nextParams = new URLSearchParams(previous);
      nextParams.set("view", "calendar");
      nextParams.set("range", next);
      return nextParams;
    });
  };
  const events = overviewEvents(state, {
    actorId,
    assigneeId: person,
    projectId: project,
    zone,
    from: days[0],
    to: days.at(-1)!,
    showProposed: drafts,
  });
  const byDay = new Map<string, OverviewEvent[]>();
  events.forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]));
  const periodEvents = events.filter(
    (e) => e.date >= period.start && e.date <= period.end,
  );
  const matchingTasks = state.tasks.filter(
    (t) =>
      state.projects.some((p) => p.id === t.projectId && !p.archived) &&
      (project === "all" || t.projectId === project) &&
      (person === "all" || t.assigneeId === person),
  );
  const tasks = matchingTasks.filter(isCommittedTask);
  const recovery = state.proposals.find(
    (p) =>
      p.status === "awaiting_review" &&
      p.trigger === "recovery" &&
      (project === "all" || p.projectId === project) &&
      (person === "all" ||
        p.alternatives[p.selected].sessions.some(
          (s) => s.assigneeId === person,
        ) ||
        p.createdBy === person),
  );
  const move = (amount: number) => {
    const next = moveCalendarDate(anchor, activeScale, amount);
    setAnchor(next);
    setSelected(next);
  };
  const renderEvents = (rows: OverviewEvent[]) =>
    rows.length ? (
      <div className="overview-event-list">
        {rows.map((e) => (
          <button
            key={e.id}
            className={cx("overview-event-row", e.kind)}
            style={projectStyle(
              state.projects.find((p) => p.id === e.projectId)?.color,
            )}
            disabled={e.kind === "busy"}
            onClick={() => e.taskId && props.openTask(e.taskId)}
          >
            <span className="event-time">
              {e.start !== undefined ? time(e.start, zone) : "Due date"}
              {e.end !== undefined && <small>{time(e.end, zone)}</small>}
            </span>
            <span className="event-row-title">
              <strong>{e.title}</strong>
              <small>
                {e.projectId
                  ? state.projects.find((p) => p.id === e.projectId)?.title
                  : "Your calendar · details private"}
              </small>
              {e.taskId && (
                <TaskLabels
                  labels={
                    state.tasks.find((task) => task.id === e.taskId)?.labels ??
                    []
                  }
                  limit={2}
                />
              )}
            </span>
            <span className={cx("event-kind", e.kind)}>{kinds[e.kind]}</span>
            {e.taskId && <ArrowUpRight size={14} />}
          </button>
        ))}
      </div>
    ) : (
      <p className="overview-empty">
        No deadlines or calendar blocks for this day.
      </p>
    );
  return (
    <div className="page overview-page">
      <div className="page-heading">
        <div>
          <PageTitle help="See deadlines, planned focus sessions, and availability. Calendar supports month, week, and day; Schedule lists the same agenda by date.">
            Calendar
          </PageTitle>
        </div>
        <div className="calendar-heading-actions">
          <Link className="button secondary" to="/calendar/subscriptions">
            <Link2 size={16} />
            Subscribe & export
          </Link>
          <Link className="button secondary" to="/plans?create=true">
            <Clock3 size={16} />
            Create a plan
          </Link>
        </div>
      </div>
      <div className="overview-view-bar">
        <div
          className="overview-tabs"
          role="tablist"
          aria-label="Calendar views"
          onKeyDown={(event) => {
            const views = ["calendar", "schedule"];
            const tab = (event.target as Element).closest<HTMLButtonElement>(
              'button[role="tab"]',
            );
            // Focus moves before the URL transition commits. Follow the tab
            // receiving this key instead of the previous rendered view.
            const index = views.indexOf(tab?.id.replace(/^tab-/, "") ?? view);
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % views.length
                : event.key === "ArrowLeft"
                  ? (index + views.length - 1) % views.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? views.length - 1
                      : undefined;
            if (next === undefined) return;
            event.preventDefault();
            updateView(views[next]);
            event.currentTarget
              .querySelector<HTMLButtonElement>("#tab-" + views[next])
              ?.focus();
          }}
        >
          {[
            { id: "calendar", label: "Calendar", icon: CalendarDays },
            { id: "schedule", label: "Schedule", icon: Rows3 },
          ].map((v) => (
            <button
              key={v.id}
              role="tab"
              id={"tab-" + v.id}
              aria-selected={view === v.id}
              tabIndex={view === v.id ? 0 : -1}
              aria-controls={"calendar-" + v.id}
              onClick={() => updateView(v.id)}
            >
              <v.icon size={16} />
              {v.label}
            </button>
          ))}
        </div>
        <WorkViewFilters page="Calendar" scope={scope} />
      </div>
      <section
        id={"calendar-" + view}
        role="tabpanel"
        aria-labelledby={"tab-" + view}
      >
        <div className="overview-summary" aria-label="Work summary">
          <div data-tone="blue">
            <strong>{tasks.length}</strong>
            <span>Open tasks</span>
          </div>
          <div data-tone="coral">
            <strong>
              {tasks.filter((t) => deadlineAt(t.deadline, zone) < now).length}
            </strong>
            <span>Overdue</span>
          </div>
          <div data-tone="teal">
            <strong>
              {duration(occupiedMinutes(periodEvents, "scheduled"))}
            </strong>
            <span>Scheduled this {activeScale}</span>
          </div>
          <div data-tone="violet">
            <strong>{duration(occupiedMinutes(periodEvents, "busy"))}</strong>
            <span>Calendar busy time {demo && "· demo"}</span>
          </div>
        </div>
        {recovery && (
          <div className="review-strip overview-review-strip">
            <span className="status-dot blocked" />
            <span>
              <strong>{recovery.title}</strong> requires review
            </span>
            <button
              className="button secondary"
              onClick={() => props.openPlan(recovery.id)}
            >
              Review Plan{" "}
              {(state.versions.find((v) => v.id === recovery.parentVersionId)
                ?.number ?? 0) + 1}
              <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        <div className="overview-period">
          <div className="period-navigation">
            <button
              className="icon-button"
              aria-label={"Previous " + activeScale}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={"Next " + activeScale}
              onClick={() => move(1)}
            >
              <ChevronRight size={18} />
            </button>
            <h2>{title}</h2>
            <button
              className="button secondary"
              onClick={() => {
                setAnchor(today);
                setSelected(today);
              }}
            >
              Today
            </button>
          </div>
          {view === "calendar" && (
            <div
              className="calendar-scale-control"
              role="group"
              aria-label="Calendar range"
            >
              {(["month", "week", "day"] as CalendarScale[]).map((value) => (
                <button
                  key={value}
                  aria-pressed={scale === value}
                  onClick={() => changeScale(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={drafts}
              onChange={(e) => setDrafts(e.target.checked)}
            />
            Include proposals
          </label>
        </div>
        {view === "calendar" ? (
          <>
            {scale === "month" ? (
              <div className="overview-calendar-wrap">
                <table
                  className="overview-calendar"
                  aria-label="Monthly work calendar"
                >
                  <thead>
                    <tr>
                      {[
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                      ].map((d) => (
                        <th scope="col" key={d}>
                          <span className="weekday-full">{d}</span>
                          <span className="weekday-short">{d.slice(0, 3)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: cellCount / 7 }, (_, week) => (
                      <tr key={week}>
                        {days.slice(week * 7, week * 7 + 7).map((day) => {
                          const rows = byDay.get(day) ?? [];
                          return (
                            <td
                              key={day}
                              className={cx(
                                day.slice(0, 7) !== month.slice(0, 7) &&
                                  "outside-month",
                                selected === day && "selected-day",
                                day === today && "today",
                              )}
                            >
                              <button
                                className="calendar-date-button"
                                aria-label={
                                  labelDate(day) + ", " + rows.length + " items"
                                }
                                aria-pressed={selected === day}
                                onClick={() => setSelected(day)}
                              >
                                <span>{Number(day.slice(-2))}</span>
                                <span className="mobile-item-count">
                                  {rows.length ? rows.length : ""}
                                </span>
                              </button>
                              <div className="month-events">
                                {rows.slice(0, 3).map((e) => (
                                  <button
                                    key={e.id}
                                    className={cx("month-event", e.kind)}
                                    style={projectStyle(
                                      state.projects.find(
                                        (p) => p.id === e.projectId,
                                      )?.color,
                                    )}
                                    onClick={() =>
                                      e.taskId
                                        ? props.openTask(e.taskId)
                                        : setSelected(day)
                                    }
                                    title={kinds[e.kind] + ": " + e.title}
                                  >
                                    <i />
                                    <span>
                                      {e.start !== undefined && (
                                        <small>{time(e.start, zone)} </small>
                                      )}
                                      {e.title}
                                    </span>
                                  </button>
                                ))}
                                {rows.length > 3 && (
                                  <button
                                    className="more-day-events"
                                    onClick={() => setSelected(day)}
                                  >
                                    +{rows.length - 3} more
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CalendarTimeGrid
                days={days}
                events={events}
                zone={zone}
                selected={selected}
                onSelectDay={setSelected}
                onOpenTask={props.openTask}
              />
            )}
            <div className="overview-calendar-legend">
              <span>
                <i className="deadline" />
                Deadline
              </span>
              <span>
                <i className="scheduled" />
                Scheduled work
              </span>
              <span>
                <i className="busy" />
                Private busy time
              </span>
              {drafts && (
                <span>
                  <i className="proposed" />
                  Proposal
                </span>
              )}
              <small>{zone}</small>
            </div>
            <section className="selected-day-agenda">
              <div className="section-line">
                <h2>{labelDate(selected)}</h2>
                <span>{(byDay.get(selected) ?? []).length} items</span>
              </div>
              {renderEvents(byDay.get(selected) ?? [])}
            </section>
          </>
        ) : (
          <div className="overview-schedule">
            {[...new Set(periodEvents.map((e) => e.date))].map((day) => (
              <section key={day}>
                <h2>{labelDate(day)}</h2>
                {renderEvents(byDay.get(day) ?? [])}
              </section>
            ))}
            {!periodEvents.length && (
              <p className="overview-empty">
                No deadlines or calendar blocks this month.
              </p>
            )}
          </div>
        )}
        <p className="overview-note">
          Deadlines are not time reservations. Proposals are not scheduled until
          approved. Busy time reflects your own calendar
          {demo ? " fixture" : ""}.
        </p>
      </section>
    </div>
  );
}
