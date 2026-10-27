import { useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  CalendarDays,
  Clock3,
  Repeat2,
  Bell,
  Trash2,
  Globe2,
  ChevronDown,
  CircleAlert,
} from "lucide-react";
import { Modal, duration, useUI } from "./components";
import { InfoTip } from "./InfoTip";
import { useData } from "./data";
import {
  calendarSessionIssues,
  calendarSessions,
  shiftedCalendarSessions,
} from "../shared/calendarPlanning";
import type { Task, Command } from "../shared/model";
import type { OverviewEvent } from "../shared/overview";

export interface CalendarDraft {
  taskId?: string;
  start: number;
  end: number;
  event?: OverviewEvent;
}
export interface CalendarUndo {
  label: string;
  command?: Command;
  created?: { sessionId: string; count: number };
}
export const calendarLocalValue = (instant: number, zone: string) =>
  Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
export function calendarInstant(value: string, zone: string) {
  return Number(
    Temporal.PlainDateTime.from(value).toZonedDateTime(zone, {
      disambiguation: "reject",
    }).epochMilliseconds,
  );
}

export function CalendarSessionDialog({
  draft,
  tasks,
  zone,
  onClose,
  onSaved,
}: {
  draft: CalendarDraft;
  tasks: Task[];
  zone: string;
  onClose: () => void;
  onSaved: (undo?: CalendarUndo) => void;
}) {
  const { state, actorId, dispatch, online } = useData();
  const { run } = useUI();
  const editing = draft.event;
  const direct = state.calendarSessions?.find(
    (item) => item.id === editing?.sessionId,
  );
  const taskOptions = tasks.filter(
    (task) =>
      task.assigneeId === actorId &&
      ["todo", "in_progress"].includes(task.status),
  );
  const [taskId, setTask] = useState(draft.taskId ?? editing?.taskId ?? "");
  const [startText, setStart] = useState(calendarLocalValue(draft.start, zone));
  const [endText, setEnd] = useState(calendarLocalValue(draft.end, zone));
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [count, setCount] = useState(4);
  const [scope, setScope] = useState<"occurrence" | "following" | "series">(
    "occurrence",
  );
  const [reminder, setReminder] = useState(
    String(direct?.reminderMinutes ?? ""),
  );
  const native =
    state.calendars.find((cal) => cal.ownerId === actorId)?.destinationId ===
    "kazi";
  const [enableNative, setEnableNative] = useState(native);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const task = state.tasks.find((item) => item.id === taskId);
  const project = state.projects.find((item) => item.id === task?.projectId);
  const times = useMemo(() => {
    try {
      const start = calendarInstant(startText, zone),
        end = calendarInstant(endText, zone);
      return { start, end, minutes: Math.round((end - start) / 60000) };
    } catch {
      return undefined;
    }
  }, [startText, endText, zone]);
  const issues =
    times && taskId
      ? calendarSessionIssues(
          state,
          { taskId, start: times.start, end: times.end },
          actorId,
          Date.now(),
          editing?.sessionId ? [editing.sessionId] : [],
        )
      : [];
  const guidance = issues.filter(
    (issue) => !(enableNative && /Kazi agenda|native agenda/i.test(issue)),
  );
  const snapshotUndo = (): Command | undefined => {
    if (!editing?.sessionId) return undefined;
    const current = calendarSessions(state).find(
      (row) => row.id === editing.sessionId,
    );
    if (!current) return undefined;
    const affected = shiftedCalendarSessions(
      state,
      current,
      current.start,
      current.end,
      scope,
      Date.now(),
    )
      .map((row) => row.session)
      .filter((row) => row.status === "scheduled");
    return {
      type: "restore_calendar_sessions",
      sessions: affected.map((row) => ({
        sessionId: row.id,
        revision: row.revision + 1,
        start: row.start,
        end: row.end,
        status: row.status,
        reminderMinutes: row.reminderMinutes ?? null,
      })),
    };
  };
  const save = async () => {
    setError("");
    if (!times || times.minutes <= 0) {
      setError("Choose a valid start and end in this time zone.");
      return;
    }
    if (!taskId) {
      setError("Choose a task to reserve time for.");
      return;
    }
    if (!enableNative) {
      setError("Confirm that this reservation belongs in your Kazi agenda.");
      return;
    }
    setSaving(true);
    let restore: Command | undefined;
    const result = await run(
      async () => {
        restore = snapshotUndo();
        if (!native) await dispatch({ type: "use_kazi_agenda" });
        const command: Command = editing?.sessionId
          ? {
              type: "update_calendar_session",
              sessionId: editing.sessionId,
              revision: editing.sessionRevision ?? 1,
              start: times.start,
              end: times.end,
              scope,
              reminderMinutes: reminder === "" ? null : Number(reminder),
            }
          : {
              type: "schedule_calendar_session",
              taskId,
              start: times.start,
              end: times.end,
              ...(repeat === "none"
                ? {}
                : { recurrence: { frequency: repeat, count, timezone: zone } }),
              ...(reminder === "" ? {} : { reminderMinutes: Number(reminder) }),
            };
        return dispatch(command);
      },
      editing ? "Calendar reservation updated" : "Time reserved in Kazi",
    );
    setSaving(false);
    if (result === undefined) return;
    const undo: CalendarUndo = restore
      ? { label: "Calendar time updated", command: restore }
      : {
          label:
            repeat === "none" ? "Time reserved" : "Focus sessions reserved",
          created: { sessionId: result, count: repeat === "none" ? 1 : count },
        };
    onSaved(undo);
  };
  const release = async () => {
    if (!editing?.sessionId || !times) return;
    setSaving(true);
    let restore: Command | undefined;
    const result = await run(async () => {
      restore = snapshotUndo();
      return dispatch({
        type: "cancel_calendar_session",
        sessionId: editing.sessionId!,
        revision: editing.sessionRevision ?? 1,
        scope,
      });
    }, "Calendar reservation released");
    setSaving(false);
    if (result === undefined) return;
    onSaved(restore ? { label: "Time released", command: restore } : undefined);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit calendar time" : "Reserve time"}
      className="calendar-session-dialog"
      icon={<CalendarDays size={22} aria-hidden="true" />}
    >
      <form
        className="calendar-session-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="calendar-session-body">
          <div className="calendar-session-task-field">
            {editing ? (
              <div className="calendar-session-task">
                <span className="calendar-session-label">Task</span>
                <strong>{task?.title ?? editing.title}</strong>
              </div>
            ) : (
              <label className="calendar-session-field">
                <span>Task</span>
                <span className="calendar-session-select">
                  <select
                    aria-label="Task to schedule"
                    value={taskId}
                    onChange={(event) => setTask(event.target.value)}
                    required
                  >
                    <option value="">Choose a task…</option>
                    {taskOptions.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </label>
            )}
            {project && (
              <div className="calendar-session-project">
                <span
                  className="calendar-session-project-dot"
                  style={{ background: project.color }}
                  aria-hidden="true"
                />
                <span>{project.title}</span>
              </div>
            )}
          </div>
          {!editing && !taskOptions.length && (
            <p className="calendar-session-guidance">
              Move a task to To do or In progress to reserve time. Backlog ideas
              stay in Backlog.
            </p>
          )}
          <section
            className="calendar-session-timing"
            aria-label="Reservation time"
          >
            <div className="calendar-session-times">
              <label className="calendar-session-field">
                <span>Start</span>
                <input
                  aria-label="Session start"
                  type="datetime-local"
                  step="900"
                  value={startText}
                  onChange={(event) => setStart(event.target.value)}
                  required
                />
              </label>
              <label className="calendar-session-field">
                <span>End</span>
                <input
                  aria-label="Session end"
                  type="datetime-local"
                  step="900"
                  value={endText}
                  onChange={(event) => setEnd(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="calendar-session-context">
              <output
                className="calendar-session-duration"
                aria-label="Reservation duration"
                aria-live="polite"
              >
                <Clock3 size={14} aria-hidden="true" />
                {times && times.minutes > 0
                  ? duration(times.minutes)
                  : "Choose valid times"}
              </output>
              <span className="calendar-session-timezone">
                <Globe2 size={14} aria-hidden="true" />
                <span>{zone.replaceAll("_", " ")}</span>
                <InfoTip label="About calendar reservations">
                  Times use {zone.replaceAll("_", " ")}. Reservations allocate
                  planned time. They do not change a task’s deadline or status
                  and are not logged work time.
                </InfoTip>
              </span>
            </div>
          </section>
          <div className="calendar-session-preferences">
            {editing?.seriesId ? (
              <label className="calendar-session-field">
                <span>
                  <Repeat2 size={15} aria-hidden="true" /> Apply changes to
                </span>
                <span className="calendar-session-select">
                  <select
                    aria-label="Edit recurring sessions"
                    value={scope}
                    onChange={(event) =>
                      setScope(event.target.value as typeof scope)
                    }
                  >
                    <option value="occurrence">This session</option>
                    <option value="following">
                      This and following sessions
                    </option>
                    <option value="series">Entire series</option>
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </label>
            ) : (
              !editing && (
                <label className="calendar-session-field">
                  <span>
                    <Repeat2 size={15} aria-hidden="true" /> Repeat
                  </span>
                  <span className="calendar-session-select">
                    <select
                      aria-label="Repeat focus session"
                      value={repeat}
                      onChange={(event) =>
                        setRepeat(event.target.value as typeof repeat)
                      }
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Every working day</option>
                      <option value="weekly">Weekly</option>
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </label>
              )
            )}
            <label className="calendar-session-field">
              <span>
                <Bell size={15} aria-hidden="true" /> In-app reminder
              </span>
              <span className="calendar-session-select">
                <select
                  aria-label="Session reminder"
                  value={reminder}
                  onChange={(event) => setReminder(event.target.value)}
                >
                  <option value="">None</option>
                  {[0, 5, 10, 15, 30, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes ? `${minutes} minutes before` : "At start time"}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </span>
            </label>
          </div>
          {!editing && repeat !== "none" && (
            <label className="calendar-session-count calendar-session-field">
              <span>
                <Repeat2 size={15} aria-hidden="true" /> Number of sessions
              </span>
              <input
                aria-label="Number of focus sessions"
                type="number"
                min={2}
                max={26}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
          )}
          {!native && (
            <label className="calendar-native-consent">
              <input
                type="checkbox"
                checked={enableNative}
                onChange={(event) => setEnableNative(event.target.checked)}
              />
              <span>Reserve this time in my Kazi agenda</span>
            </label>
          )}
          {!!guidance.length && (
            <div
              className="calendar-session-checks"
              aria-label="Reservation checks"
            >
              <CircleAlert size={17} aria-hidden="true" />
              <div>
                <strong>Before saving</strong>
                <ul>
                  {guidance.slice(0, 4).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </div>
        <div className="calendar-session-actions">
          {editing && (
            <button
              type="button"
              className="text-button danger-text calendar-session-release"
              disabled={saving || !online}
              onClick={() => void release()}
            >
              <Trash2 size={15} aria-hidden="true" /> Release time
            </button>
          )}
          <div className="calendar-session-save-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={saving || !online || !taskId || !times || !enableNative}
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Reserve time"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
