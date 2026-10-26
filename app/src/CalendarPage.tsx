import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Temporal } from "@js-temporal/polyfill";
import {
  ArrowUpRight,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Link2,
  PanelRight,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { projectStyle } from "./projectColors";
import { InfoTip, PageTitle } from "./InfoTip";
import { TaskLabels } from "./TaskLabels";
import {
  WorkViewFilters,
  useWorkViewScope,
  useCurrentMinute,
} from "./WorkViewScope";
import { useData } from "./data";
import { duration, cx, useUI } from "./components";
import type { WorkProps } from "./WorkPages";
import { CalendarTimeGrid } from "./CalendarTimeGrid";
import { CalendarTaskTray, calendarDragType } from "./CalendarTaskTray";
import {
  CalendarSessionDialog,
  type CalendarDraft,
  type CalendarUndo,
} from "./CalendarSessionDialog";
import {
  calendarPeriod,
  moveCalendarDate,
  type CalendarScale,
} from "../shared/calendar";
import {
  calendarDayCapacity,
  calendarSessions,
  calendarReservations,
} from "../shared/calendarPlanning";
import { dateInZone } from "../shared/scheduler";
import { overviewEvents, type OverviewEvent } from "../shared/overview";
import type { Task, Command } from "../shared/model";
import "./calendar-workbench.css";

const kinds = {
  deadline: "Due",
  scheduled: "Scheduled",
  proposed: "Proposed",
  pending: "Sync pending",
  busy: "Busy",
};
const ranges = ["day", "3day", "workweek", "week", "month"] as const;
const rangeLabels: Record<CalendarScale, string> = {
  day: "Day",
  "3day": "3 days",
  workweek: "Workweek",
  week: "Week",
  month: "Month",
};
const time = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(at);
const labelDate = (day: string) =>
  Temporal.PlainDate.from(day).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
const validDate = (value?: string | null) => {
  try {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Temporal.PlainDate.from(value).toString()
      : undefined;
  } catch {
    return undefined;
  }
};
type ColorBy = "project" | "tag" | "priority";
type CalendarPreferences = {
  range: CalendarScale;
  colorBy: ColorBy;
  proposals: boolean;
};
const defaultPreferences = (): CalendarPreferences => ({
  range:
    typeof matchMedia === "function" && matchMedia("(max-width: 700px)").matches
      ? "day"
      : "workweek",
  colorBy: "project",
  proposals: false,
});
function readPreferences(key: string): CalendarPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return {
      range: ranges.includes(value?.range)
        ? value.range
        : defaultPreferences().range,
      colorBy: ["project", "tag", "priority"].includes(value?.colorBy)
        ? value.colorBy
        : "project",
      proposals: value?.proposals === true,
    };
  } catch {
    return defaultPreferences();
  }
}
const tagPalette = [
  "#d2e3fc",
  "#e7d7fa",
  "#ceead6",
  "#fdd9b5",
  "#e2e5e9",
  "#feefc3",
  "#f9d2e6",
  "#c7ece8",
];
function tagFill(tag: string) {
  const key = tag.normalize("NFKC").trim().toLowerCase();
  const categories: Record<string, number> = {
    research: 0,
    design: 1,
    development: 2,
    meeting: 3,
    admin: 4,
    writing: 5,
    marketing: 6,
    review: 7,
  };
  let hash = 2166136261;
  for (const character of key)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return tagPalette[categories[key] ?? (hash >>> 0) % tagPalette.length];
}

export function CalendarPage(props: WorkProps) {
  const { state, actorId, teamId, dispatch, online, calendar } = useData();
  const { run } = useUI();
  const preferences = state.members.find(
    (member) => member.id === actorId,
  )!.preferences;
  const zone = preferences.timezone;
  const now = useCurrentMinute(),
    today = dateInZone(now, zone);
  const scope = useWorkViewScope();
  const { person, project } = scope;
  const [params, setParams] = useSearchParams();
  const preferenceKey = `kazi.calendar.preferences.v1:${actorId}:${state.workspace.id}:${teamId}`;
  const [stored, setStored] = useState(() => ({
    key: preferenceKey,
    value: readPreferences(preferenceKey),
  }));
  const saved =
    stored.key === preferenceKey
      ? stored.value
      : readPreferences(preferenceKey);
  const remember = (patch: Partial<CalendarPreferences>) => {
    const next = { ...saved, ...patch };
    setStored({ key: preferenceKey, value: next });
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Calendar remains usable when storage is unavailable. */
    }
  };
  const scale: CalendarScale = ranges.includes(
    params.get("range") as CalendarScale,
  )
    ? (params.get("range") as CalendarScale)
    : saved.range;
  const schedule = params.get("view") === "schedule";
  const activeScale = schedule ? "month" : scale;
  const anchor = validDate(params.get("date")) ?? today;
  const selected = validDate(params.get("selected")) ?? anchor;
  const drafts = params.has("proposals")
    ? params.get("proposals") === "true"
    : saved.proposals;
  const colorBy: ColorBy = ["project", "tag", "priority"].includes(
    params.get("color") ?? "",
  )
    ? (params.get("color") as ColorBy)
    : saved.colorBy;
  const [trayOpen, setTrayOpen] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(min-width: 1200px)").matches,
  );
  const [agendaOpen, setAgendaOpen] = useState(scale === "month");
  const [draft, setDraft] = useState<CalendarDraft>();
  const [undo, setUndo] = useState<CalendarUndo>();
  const [undoing, setUndoing] = useState(false);
  const agenda = useRef<HTMLElement>(null);
  const period = calendarPeriod(anchor, activeScale),
    days = period.days,
    month = anchor.slice(0, 7);
  const tasks = state.tasks.filter(
    (task) =>
      state.projects.some(
        (item) => item.id === task.projectId && !item.archived,
      ) &&
      (project === "all" || task.projectId === project) &&
      (person === "all" || task.assigneeId === person),
  );
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
  events.forEach((event) =>
    byDay.set(event.date, [...(byDay.get(event.date) ?? []), event]),
  );
  const taskMap = useMemo(
    () => new Map(state.tasks.map((task) => [task.id, task])),
    [state.tasks],
  );
  const taskColor = (task?: Task): CSSProperties => {
    if (colorBy === "priority")
      return {
        "--project-fill":
          task?.priority === "high"
            ? "#fadbd5"
            : task?.priority === "medium"
              ? "#fff0c2"
              : "#dce8fa",
        "--project-accent":
          task?.priority === "high"
            ? "#a83929"
            : task?.priority === "medium"
              ? "#8a5d00"
              : "#285aa0",
      } as CSSProperties;
    if (colorBy === "tag")
      return {
        "--project-fill": task?.labels[0] ? tagFill(task.labels[0]) : "#edf0f3",
        "--project-accent": "#424750",
      } as CSSProperties;
    return projectStyle(
      state.projects.find((item) => item.id === task?.projectId)?.color,
    );
  };
  const eventColor = (event: OverviewEvent) =>
    taskColor(event.taskId ? taskMap.get(event.taskId) : undefined);
  const reservedMinutes = new Map<string, number>();
  for (const session of calendarReservations(state)) {
    if (session.end <= now) continue;
    reservedMinutes.set(
      session.taskId,
      (reservedMinutes.get(session.taskId) ?? 0) +
        (session.end - Math.max(session.start, now)) / 60000,
    );
  }
  const ownCalendar = state.calendars.find((item) => item.ownerId === actorId);
  const capacity = calendarDayCapacity(state, actorId, selected, now);
  const title =
    activeScale === "month"
      ? Temporal.PlainDate.from(anchor).toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        })
      : activeScale === "day"
        ? Temporal.PlainDate.from(anchor).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : `${Temporal.PlainDate.from(period.start).toLocaleString("en-US", { month: "short", day: "numeric" })} – ${Temporal.PlainDate.from(period.end).toLocaleString("en-US", { ...(period.start.slice(0, 7) !== period.end.slice(0, 7) ? { month: "short" } : {}), day: "numeric" })}`;
  const setDate = (value: string) => {
    const date = validDate(value);
    if (!date) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("date", date);
      next.set("selected", date);
      return next;
    });
  };
  const selectDay = (day: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("selected", day);
      return next;
    });
    setAgendaOpen(true);
    requestAnimationFrame(() => {
      const panel = agenda.current;
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      if (bounds.top > innerHeight - 120 || bounds.bottom < 0)
        panel.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
    });
  };
  const setView = (value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("date", selected);
      next.set("view", value === "schedule" ? "schedule" : "calendar");
      if (value !== "schedule") next.set("range", value);
      return next;
    });
    if (value !== "schedule") remember({ range: value as CalendarScale });
  };
  const defaultStart = (day = selected) => {
    const date = Temporal.PlainDate.from(day);
    let at = Number(
      date.toZonedDateTime({
        timeZone: zone,
        plainTime: { hour: preferences.startHour },
      }).epochMilliseconds,
    );
    if (date.toString() === today)
      at = Math.max(at, Math.ceil(now / 900000) * 900000);
    return at;
  };
  const createSlot = (start: number, taskId?: string) => {
    if (!online) return;
    const task = taskId ? taskMap.get(taskId) : undefined;
    const estimate = task?.remainingMinutes ?? task?.estimatedMinutes;
    const unallocated =
      estimate === undefined
        ? preferences.minSession
        : Math.max(0, estimate - (reservedMinutes.get(taskId ?? "") ?? 0));
    const minutes = Math.max(
      preferences.minSession,
      Math.min(preferences.maxSession, unallocated),
    );
    setDraft({ taskId, start, end: start + minutes * 60000 });
  };
  const editable = (event: OverviewEvent) =>
    online &&
    event.kind === "scheduled" &&
    !!event.sessionId &&
    event.ownerId === actorId &&
    event.start !== undefined &&
    event.start >= now;
  const recovery = state.proposals.find(
    (proposal) =>
      proposal.status === "awaiting_review" &&
      proposal.trigger === "recovery" &&
      (project === "all" || proposal.projectId === project) &&
      (person === "all" ||
        proposal.createdBy === person ||
        proposal.alternatives[proposal.selected].sessions.some(
          (item) => item.assigneeId === person,
        )),
  );
  const renderEvents = (rows: OverviewEvent[]) =>
    rows.length ? (
      <div className="overview-event-list">
        {rows.map((event) => (
          <div
            className={cx("calendar-agenda-entry", event.kind)}
            key={event.id}
          >
            <button
              className={cx("overview-event-row", event.kind)}
              style={eventColor(event)}
              disabled={event.kind === "busy"}
              onClick={() => event.taskId && props.openTask(event.taskId)}
            >
              <span className="event-time">
                {event.start !== undefined
                  ? time(event.start, zone)
                  : "Due date"}
                {event.end !== undefined && (
                  <small>{time(event.end, zone)}</small>
                )}
              </span>
              <span className="event-row-title">
                <strong>{event.title}</strong>
                <small>
                  {event.projectId
                    ? state.projects.find((item) => item.id === event.projectId)
                        ?.title
                    : "Your calendar · details private"}
                </small>
                {event.taskId && (
                  <TaskLabels
                    labels={taskMap.get(event.taskId)?.labels ?? []}
                    limit={2}
                  />
                )}
              </span>
              <span className={cx("event-kind", event.kind)}>
                {kinds[event.kind]}
              </span>
              {event.taskId && <ArrowUpRight size={14} />}
            </button>
            {editable(event) && (
              <button
                className="icon-button"
                aria-label={"Edit time for " + event.title}
                onClick={() =>
                  setDraft({
                    taskId: event.taskId,
                    start: event.start!,
                    end: event.end!,
                    event,
                  })
                }
              >
                <Clock3 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className="calendar-agenda-empty">
        <Clock3 size={24} />
        <strong>Room for what matters</strong>
        <p>No deadlines or reserved work on this day.</p>
        <button
          className="text-button"
          onClick={() => createSlot(defaultStart())}
        >
          Reserve time
        </button>
      </div>
    );
  const undoCommand: Command | undefined = (() => {
    if (!undo?.created) return undo?.command;
    const rows = calendarSessions(state);
    const first = rows.find((row) => row.id === undo.created!.sessionId);
    if (!first) return undefined;
    const created = first.seriesId
      ? rows.filter((row) => row.seriesId === first.seriesId)
      : [first];
    if (created.length !== undo.created.count) return undefined;
    return {
      type: "restore_calendar_sessions",
      sessions: created.map((row) => ({
        sessionId: row.id,
        revision: 1,
        start: row.start,
        end: row.end,
        status: "released" as const,
        reminderMinutes: row.reminderMinutes ?? null,
      })),
    };
  })();
  return (
    <div className="page calendar-workbench-page">
      <header className="calendar-page-heading">
        <PageTitle help="Reserve time directly on the calendar. Drag a task into a slot, move a session, or use its clock button to edit. Deadlines and task status stay unchanged. Teammates’ sessions are read-only; use Plans for shared proposals.">
          Calendar
        </PageTitle>
        <div className="calendar-page-actions">
          <Link
            className="icon-button"
            aria-label="Subscribe & export"
            title="Subscribe & export"
            to="/calendar/subscriptions"
          >
            <Link2 size={18} />
          </Link>
          <Link
            className="icon-button"
            aria-label="Create a plan"
            title="Create a plan"
            to="/plans?create=true"
          >
            <Clock3 size={18} />
          </Link>
          <button
            className={cx(
              "button secondary calendar-tray-toggle",
              trayOpen && "active",
            )}
            aria-label="Unscheduled tasks"
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen(!trayOpen)}
          >
            <PanelRight size={16} />
            <span>Tasks</span>
          </button>
          <details className="calendar-options">
            <summary aria-label="Calendar options" title="Calendar options">
              <SlidersHorizontal size={18} />
            </summary>
            <div className="calendar-options-panel">
              <WorkViewFilters page="Calendar" scope={scope} />
              <label>
                Color by
                <select
                  aria-label="Calendar color by"
                  value={colorBy}
                  onChange={(event) => {
                    const value = event.target.value as ColorBy;
                    remember({ colorBy: value });
                    setParams((previous) => {
                      const next = new URLSearchParams(previous);
                      next.set("color", value);
                      return next;
                    });
                  }}
                >
                  <option value="project">Project</option>
                  <option value="tag">Tag</option>
                  <option value="priority">Priority</option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={drafts}
                  onChange={(event) => {
                    const value = event.target.checked;
                    remember({ proposals: value });
                    setParams((previous) => {
                      const next = new URLSearchParams(previous);
                      next.set("proposals", String(value));
                      return next;
                    });
                  }}
                />
                Include proposals
              </label>
              <small>{zone}</small>
            </div>
          </details>
        </div>
      </header>
      <div className="calendar-toolbar">
        <div className="calendar-period-controls">
          <button
            className="icon-button"
            aria-label={"Previous " + activeScale}
            onClick={() => setDate(moveCalendarDate(anchor, activeScale, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={"Next " + activeScale}
            onClick={() => setDate(moveCalendarDate(anchor, activeScale, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <details className="calendar-jump">
            <summary>
              <h2>{title}</h2>
              <ChevronDown size={13} />
            </summary>
            <label>
              Go to date
              <input
                aria-label="Calendar date"
                type="date"
                value={anchor}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </details>
          <button
            className="button secondary calendar-today"
            onClick={() => setDate(today)}
          >
            Today
          </button>
        </div>
        <select
          className="calendar-view-select"
          aria-label="Calendar view"
          value={schedule ? "schedule" : scale}
          onChange={(event) => setView(event.target.value)}
        >
          {ranges.map((range) => (
            <option key={range} value={range}>
              {rangeLabels[range]}
            </option>
          ))}
          <option value="schedule">Schedule</option>
        </select>
      </div>
      <div className="calendar-capacity-strip" aria-label="Daily capacity">
        <span
          className="calendar-capacity-dot"
          data-overbooked={capacity.overbookedMinutes > 0}
        />
        <span>
          <strong>
            {capacity.availabilityFresh
              ? duration(capacity.availableMinutes)
              : "—"}
          </strong>{" "}
          available{" "}
          <span className="calendar-capacity-date">
            {Temporal.PlainDate.from(selected).toLocaleString("en-US", {
              weekday: "short",
            })}
          </span>
        </span>
        <span>
          <strong>{duration(capacity.scheduledMinutes)}</strong> reserved
        </span>
        {capacity.overbookedMinutes > 0 && (
          <span className="calendar-overbooked">
            {duration(capacity.overbookedMinutes)} over capacity
          </span>
        )}
        <InfoTip label="How calendar capacity works">
          Your working hours and daily limit, less reserved work and private
          busy time. This is planned allocation, not time worked.{" "}
          {capacity.explanations.join(" ")}
        </InfoTip>
        {!capacity.availabilityFresh &&
          (ownCalendar?.selectedIds.length ? (
            <button
              className="text-button calendar-refresh"
              onClick={() =>
                void run(() => calendar("refresh"), "Availability refreshed")
              }
            >
              Refresh availability
            </button>
          ) : (
            <Link
              className="text-button calendar-refresh"
              to="/calendar/subscriptions"
            >
              Set up agenda
            </Link>
          ))}
        {recovery && (
          <button
            className="text-button calendar-review-link"
            onClick={() => props.openPlan(recovery.id)}
          >
            Review plan
            <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {person !== actorId && (
        <div className="calendar-overlay-note">
          {person === "all"
            ? "Team overlay"
            : "Viewing " +
              (state.members.find((item) => item.id === person)?.name ??
                "teammate")}
          <span>Other people’s sessions are read-only.</span>
        </div>
      )}
      {undo && (
        <div className="calendar-undo" role="status">
          <span>{undo.label}</span>
          <button
            className="text-button"
            disabled={undoing || !online || !undoCommand}
            onClick={async () => {
              setUndoing(true);
              const result = await run(
                () => dispatch(undoCommand!),
                "Calendar change undone",
              );
              setUndoing(false);
              if (result !== undefined) setUndo(undefined);
            }}
          >
            <Undo2 size={14} />
            {undoing ? "Undoing…" : !undoCommand ? "Preparing Undo…" : "Undo"}
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss calendar undo"
            onClick={() => setUndo(undefined)}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className={cx("calendar-workbench", trayOpen && "tray-open")}>
        <section className="calendar-surface" aria-label="Calendar workspace">
          {schedule ? (
            <div className="overview-schedule calendar-schedule-view">
              {[
                ...new Set(
                  events
                    .filter(
                      (event) =>
                        event.date >= period.start && event.date <= period.end,
                    )
                    .map((event) => event.date),
                ),
              ].map((day) => (
                <section key={day}>
                  <h2>{labelDate(day)}</h2>
                  {renderEvents(byDay.get(day) ?? [])}
                </section>
              ))}
              {!events.length && (
                <div className="calendar-agenda-empty">
                  <Clock3 size={24} />
                  <strong>No work scheduled this month</strong>
                  <button
                    className="button secondary"
                    onClick={() => createSlot(defaultStart())}
                  >
                    Reserve time
                  </button>
                </div>
              )}
            </div>
          ) : scale === "month" ? (
            <div className="overview-calendar-wrap">
              <table
                className="overview-calendar calendar-month"
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
                    ].map((day) => (
                      <th scope="col" key={day}>
                        <span className="weekday-full">{day}</span>
                        <span className="weekday-short">{day.slice(0, 3)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: days.length / 7 }, (_, week) => (
                    <tr key={week}>
                      {days.slice(week * 7, week * 7 + 7).map((day) => {
                        const rows = byDay.get(day) ?? [];
                        return (
                          <td
                            key={day}
                            className={cx(
                              day.slice(0, 7) !== month && "outside-month",
                              selected === day && "selected-day",
                              day === today && "today",
                            )}
                            onDragOver={(event) => {
                              if (
                                Array.from(event.dataTransfer.types).includes(
                                  calendarDragType,
                                )
                              )
                                event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              try {
                                const data = JSON.parse(
                                  event.dataTransfer.getData(calendarDragType),
                                );
                                if (typeof data.taskId === "string")
                                  createSlot(defaultStart(day), data.taskId);
                              } catch {}
                            }}
                          >
                            <button
                              className="calendar-date-button"
                              aria-label={
                                labelDate(day) + ", " + rows.length + " items"
                              }
                              aria-pressed={selected === day}
                              aria-controls="selected-day-agenda"
                              onClick={() => selectDay(day)}
                            >
                              <span>{Number(day.slice(-2))}</span>
                              <span className="mobile-item-count">
                                {rows.length || ""}
                              </span>
                            </button>
                            <button
                              className="calendar-month-add"
                              aria-label={"Reserve time on " + labelDate(day)}
                              onClick={() => createSlot(defaultStart(day))}
                            >
                              <CalendarPlus size={13} />
                            </button>
                            <div className="month-events">
                              {rows.slice(0, 3).map((event) => (
                                <button
                                  key={event.id}
                                  className={cx("month-event", event.kind)}
                                  style={eventColor(event)}
                                  onClick={() =>
                                    event.taskId
                                      ? props.openTask(event.taskId)
                                      : selectDay(day)
                                  }
                                  title={kinds[event.kind] + ": " + event.title}
                                >
                                  <i />
                                  <span>
                                    {event.start !== undefined && (
                                      <small>{time(event.start, zone)} </small>
                                    )}
                                    {event.title}
                                  </span>
                                </button>
                              ))}
                              {rows.length > 3 && (
                                <button
                                  className="more-day-events"
                                  aria-controls="selected-day-agenda"
                                  onClick={() => selectDay(day)}
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
              now={now}
              onSelectDay={selectDay}
              onOpenTask={props.openTask}
              color={eventColor}
              canCreate={person === actorId || person === "all"}
              onCreateSlot={createSlot}
              onEdit={(event) =>
                setDraft({
                  taskId: event.taskId,
                  start: event.start!,
                  end: event.end!,
                  event,
                })
              }
              onMove={(event, start, end) =>
                setDraft({ taskId: event.taskId, start, end, event })
              }
            />
          )}
          {!schedule && (
            <div className="calendar-footbar">
              <button
                className="text-button"
                aria-expanded={agendaOpen}
                onClick={() => setAgendaOpen(!agendaOpen)}
              >
                {labelDate(selected)}
                <ChevronDown size={14} />
              </button>
              <span>
                {zone}
                <InfoTip label="Calendar states">
                  Colored blocks reserve work time. Due dates are separate.
                  Proposed sessions remain tentative until approved. Private
                  busy time never reveals event details.
                </InfoTip>
              </span>
            </div>
          )}
          {!schedule && (
            <section
              className="selected-day-agenda calendar-selected-agenda"
              id="selected-day-agenda"
              aria-labelledby="selected-day-heading"
              ref={agenda}
              hidden={!agendaOpen}
            >
              <div className="section-line">
                <h2
                  id="selected-day-heading"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {labelDate(selected)}
                </h2>
                <span>{(byDay.get(selected) ?? []).length} items</span>
              </div>
              {renderEvents(byDay.get(selected) ?? [])}
            </section>
          )}
        </section>
        {trayOpen && (
          <CalendarTaskTray
            tasks={tasks}
            reservedMinutes={reservedMinutes}
            onSchedule={(task) => createSlot(defaultStart(), task.id)}
            onOpenTask={props.openTask}
            onClose={() => setTrayOpen(false)}
            color={taskColor}
          />
        )}
      </div>
      {draft && (
        <CalendarSessionDialog
          key={`${draft.event?.id ?? "new"}:${draft.start}:${draft.end}`}
          draft={draft}
          tasks={tasks}
          zone={zone}
          onClose={() => setDraft(undefined)}
          onSaved={(action) => {
            setDraft(undefined);
            setUndo(action);
          }}
        />
      )}
    </div>
  );
}
