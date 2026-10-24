import { useData } from "./data";
import { projectStyle } from "./projectColors";
import type { CSSProperties } from "react";
import {
  calendarHours,
  layoutCalendarEvents,
  timedCalendarBounds,
} from "../shared/calendar";
import type { OverviewEvent } from "../shared/overview";
import { cx } from "./components";
const hourPixels = 64;
const clock = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  }).format(at);
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
const labels = {
  deadline: "Due",
  scheduled: "Scheduled",
  proposed: "Proposed",
  pending: "Sync pending",
  busy: "Busy",
};
export function CalendarTimeGrid({
  days,
  events,
  zone,
  selected,
  onSelectDay,
  onOpenTask,
}: {
  days: string[];
  events: OverviewEvent[];
  zone: string;
  selected: string;
  onSelectDay: (day: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const { state } = useData();
  const color = (projectId?: string) =>
    projectStyle(state.projects.find((p) => p.id === projectId)?.color);
  const { startHour, endHour } = timedCalendarBounds(events, zone);
  const dayHours = days.map((day) =>
    calendarHours(day, zone, startHour, endHour),
  );
  const maxHours = Math.max(...dayHours.map((h) => h.hours));
  const reference = dayHours[0];
  const dueHeight = Math.max(
    82,
    Math.min(
      4,
      Math.max(
        ...days.map(
          (day) =>
            events.filter((e) => e.date === day && e.kind === "deadline")
              .length,
        ),
      ),
    ) *
      28 +
      14,
  );
  return (
    <div
      className={cx("overview-time-calendar", days.length === 1 && "daily")}
      style={
        {
          "--day-count": days.length,
          "--due-height": dueHeight + "px",
        } as CSSProperties
      }
    >
      <div
        className="time-calendar-columns"
        role="region"
        aria-label={
          days.length === 1 ? "Daily work calendar" : "Weekly work calendar"
        }
      >
        <div className="time-calendar-labels" aria-hidden="true">
          <div className="time-calendar-date-header" title={zone}>
            Time
          </div>
          <div className="time-calendar-due-label">Due</div>
          <div
            className="time-calendar-axis"
            style={{ height: maxHours * hourPixels }}
          >
            {reference.ticks.map((at, i) => (
              <span key={at} style={{ top: i * hourPixels }}>
                {new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  timeZone: zone,
                  ...(reference.hours !== endHour - startHour
                    ? { timeZoneName: "short" as const }
                    : {}),
                }).format(at)}
              </span>
            ))}
          </div>
        </div>
        {days.map((day, index) => {
          const rows = events.filter((e) => e.date === day),
            due = rows.filter((e) => e.kind === "deadline");
          const timing = dayHours[index],
            adjusted = timing.hours !== reference.hours;
          return (
            <div
              className={cx(
                "time-calendar-day",
                selected === day && "selected",
              )}
              key={day}
            >
              <button
                className="time-calendar-date-header"
                aria-label={"View " + dateLabel(day)}
                aria-pressed={selected === day}
                onClick={() => onSelectDay(day)}
              >
                <span>
                  {new Date(day + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                  })}
                </span>
                <strong>{Number(day.slice(-2))}</strong>
              </button>
              <div className="time-calendar-due">
                {due.length ? (
                  <>
                    <button
                      className="day-due-summary"
                      onClick={() => onSelectDay(day)}
                    >
                      {due.length} due
                    </button>
                    <div className="day-due-items">
                      {due.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => e.taskId && onOpenTask(e.taskId)}
                          title={e.title}
                          style={color(e.projectId)}
                        >
                          {e.title}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="no-day-deadline">—</span>
                )}
              </div>
              <div
                className="time-calendar-body"
                style={{ height: maxHours * hourPixels }}
              >
                {timing.ticks.map((at, i) => (
                  <div
                    className="time-calendar-hour"
                    key={at}
                    style={{ top: i * hourPixels }}
                  >
                    {adjusted && <small>{clock(at, zone)}</small>}
                  </div>
                ))}
                {layoutCalendarEvents(
                  events,
                  day,
                  zone,
                  startHour,
                  endHour,
                ).map(({ event: e, top, height, lane, lanes }) => (
                  <button
                    key={e.id}
                    className={cx("time-calendar-event", e.kind)}
                    title={`${labels[e.kind]}: ${e.title}\n${clock(e.start!, zone)} – ${clock(e.end!, zone)}`}
                    aria-label={`${labels[e.kind]}: ${e.title}, ${clock(e.start!, zone)} to ${clock(e.end!, zone)}`}
                    style={{
                      ...color(e.projectId),
                      top: top * hourPixels,
                      height: Math.max(20, height * hourPixels - 3),
                      left: `calc(${(lane / lanes) * 100}% + 3px)`,
                      width: `calc(${100 / lanes}% - 6px)`,
                    }}
                    onClick={() =>
                      e.taskId ? onOpenTask(e.taskId) : onSelectDay(day)
                    }
                  >
                    <span className="time-event-clock">
                      {clock(e.start!, zone)}
                    </span>
                    <strong>{e.title}</strong>
                    <small>{labels[e.kind]}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
