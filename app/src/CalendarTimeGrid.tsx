import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { Clock3, MoveHorizontal } from "lucide-react";
import { useData } from "./data";
import { cx } from "./components";
import {
  calendarHours,
  layoutCalendarEvents,
  timedCalendarBounds,
} from "../shared/calendar";
import type { OverviewEvent } from "../shared/overview";
import { dateInZone } from "../shared/scheduler";
import { calendarDragType } from "./CalendarTaskTray";
const hourPixels = 64;
const clock = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  }).format(at);
const dateLabel = (day: string) =>
  Temporal.PlainDate.from(day).toLocaleString("en-US", {
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
  now = Date.now(),
  onSelectDay,
  onOpenTask,
  onCreateSlot,
  onEdit,
  onMove,
  color,
  canCreate = true,
}: {
  days: string[];
  events: OverviewEvent[];
  zone: string;
  selected: string;
  now?: number;
  onSelectDay: (day: string) => void;
  onOpenTask: (id: string) => void;
  onCreateSlot: (start: number, taskId?: string) => void;
  onEdit: (event: OverviewEvent) => void;
  onMove: (event: OverviewEvent, start: number, end: number) => void;
  color: (event: OverviewEvent) => CSSProperties;
  canCreate?: boolean;
}) {
  const { state, actorId, online } = useData();
  const preferences = state.members.find(
    (member) => member.id === actorId,
  )!.preferences;
  const { startHour, endHour } = timedCalendarBounds(events, zone);
  const dayHours = days.map((day) =>
    calendarHours(day, zone, startHour, endHour),
  );
  const maxHours = Math.max(...dayHours.map((hours) => hours.hours));
  const reference = dayHours[0];
  const [dropTarget, setDropTarget] = useState<{ day: string; at: number }>();
  const [resizing, setResizing] = useState<{ id: string; delta: number }>();
  const resizeClickHandled = useRef(false);
  const resizeStart = useRef<{ event: OverviewEvent; y: number } | undefined>(
    undefined,
  );
  const canEdit = (event: OverviewEvent) =>
    online &&
    event.kind === "scheduled" &&
    !!event.sessionId &&
    event.ownerId === actorId &&
    event.start !== undefined &&
    event.start >= now;
  const slotAt = (dayIndex: number, y: number, top: number) => {
    const timing = dayHours[dayIndex];
    const elapsed = Math.max(
      0,
      Math.min(((y - top) / hourPixels) * 60, timing.hours * 60 - 15),
    );
    return timing.start + Math.floor(elapsed / 15) * 900000;
  };
  const receiveDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    setDropTarget(undefined);
    if (!online || !canCreate) return;
    try {
      const data = JSON.parse(event.dataTransfer.getData(calendarDragType));
      const start = slotAt(
        index,
        event.clientY,
        event.currentTarget.getBoundingClientRect().top,
      );
      if (typeof data.sessionId === "string") {
        const original = events.find(
          (item) => item.sessionId === data.sessionId && canEdit(item),
        );
        if (original?.start !== undefined && original.end !== undefined)
          onMove(original, start, start + original.end - original.start);
      } else if (typeof data.taskId === "string")
        onCreateSlot(start, data.taskId);
    } catch {
      /* Only Kazi task and session drag payloads are accepted. */
    }
  };
  return (
    <>
      {days.length > 1 && (
        <p className="calendar-scroll-hint">
          <MoveHorizontal size={14} />
          Swipe or scroll to see the full{" "}
          {days.length === 5
            ? "workweek"
            : days.length === 3
              ? "three days"
              : "week"}
        </p>
      )}
      <div
        className={cx("overview-time-calendar", days.length === 1 && "daily")}
        tabIndex={0}
        aria-label="Scrollable work calendar"
        style={
          {
            "--day-count": days.length,
            "--due-height": "52px",
          } as CSSProperties
        }
      >
        <div
          className="time-calendar-columns"
          role="region"
          aria-label={
            days.length === 1
              ? "Daily work calendar"
              : days.length === 5
                ? "Workweek calendar"
                : "Weekly work calendar"
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
              {reference.ticks.map((at, index) => (
                <span key={at} style={{ top: index * hourPixels }}>
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
            const due = events.filter(
              (event) => event.date === day && event.kind === "deadline",
            );
            const timing = dayHours[index];
            const today = dateInZone(now, zone) === day;
            const workDay = preferences.workingDays.includes(
              Temporal.PlainDate.from(day).dayOfWeek,
            );
            return (
              <div
                className={cx(
                  "time-calendar-day",
                  selected === day && "selected",
                  today && "current-day",
                )}
                key={day}
              >
                <button
                  className="time-calendar-date-header"
                  aria-label={"View " + dateLabel(day)}
                  aria-pressed={selected === day}
                  aria-controls="selected-day-agenda"
                  onClick={() => onSelectDay(day)}
                >
                  <span>
                    {Temporal.PlainDate.from(day).toLocaleString("en-US", {
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
                        {due.slice(0, 1).map((event) => (
                          <button
                            key={event.id}
                            onClick={() =>
                              event.taskId && onOpenTask(event.taskId)
                            }
                            title={event.title}
                            style={color(event)}
                          >
                            {event.title}
                          </button>
                        ))}
                        {due.length > 1 && (
                          <button
                            className="day-due-more"
                            onClick={() => onSelectDay(day)}
                          >
                            +{due.length - 1}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="no-day-deadline">—</span>
                  )}
                </div>
                <div
                  className="time-calendar-body"
                  style={{ height: maxHours * hourPixels }}
                  onDragOver={(event) => {
                    if (
                      !online ||
                      !Array.from(event.dataTransfer.types).includes(
                        calendarDragType,
                      )
                    )
                      return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect =
                      event.dataTransfer.effectAllowed === "copy"
                        ? "copy"
                        : "move";
                    const at = slotAt(
                      index,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect().top,
                    );
                    setDropTarget((previous) =>
                      previous?.day === day && previous.at === at
                        ? previous
                        : { day, at },
                    );
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    )
                      setDropTarget(undefined);
                  }}
                  onDrop={(event) => receiveDrop(event, index)}
                >
                  <button
                    className="time-calendar-select"
                    disabled={!canCreate || !online}
                    aria-label={"Reserve time on " + dateLabel(day)}
                    title="Click a time to reserve work"
                    onClick={(event) => {
                      if (online)
                        onCreateSlot(
                          slotAt(
                            index,
                            event.clientY,
                            event.currentTarget.getBoundingClientRect().top,
                          ),
                        );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCreateSlot(
                          timing.start +
                            Math.max(0, preferences.startHour - startHour) *
                              3600000,
                        );
                      }
                    }}
                  />
                  {timing.ticks.map((at, tick) => {
                    const hour =
                      Temporal.Instant.fromEpochMilliseconds(
                        at,
                      ).toZonedDateTimeISO(zone).hour;
                    return (
                      <div
                        className={cx(
                          "time-calendar-hour",
                          (!workDay ||
                            hour < preferences.startHour ||
                            hour >= preferences.endHour) &&
                            "nonworking-hour",
                        )}
                        key={at}
                        style={{ top: tick * hourPixels, height: hourPixels }}
                      >
                        {timing.hours !== reference.hours && (
                          <small>{clock(at, zone)}</small>
                        )}
                      </div>
                    );
                  })}
                  {today && now >= timing.start && now < timing.end && (
                    <div
                      className="calendar-now-line"
                      style={{
                        top: ((now - timing.start) / 3600000) * hourPixels,
                      }}
                      aria-label={"Current time " + clock(now, zone)}
                    >
                      <span />
                    </div>
                  )}
                  {dropTarget?.day === day && (
                    <div
                      className="calendar-drop-marker"
                      style={{
                        top:
                          ((dropTarget.at - timing.start) / 3600000) *
                          hourPixels,
                      }}
                    >
                      <span>{clock(dropTarget.at, zone)}</span>
                    </div>
                  )}
                  {layoutCalendarEvents(
                    events,
                    day,
                    zone,
                    startHour,
                    endHour,
                  ).map(({ event, top, height, lane, lanes }) => {
                    const editable = canEdit(event);
                    const worker = state.members.find(
                      (member) =>
                        member.id ===
                        (event.ownerId ??
                          state.tasks.find((task) => task.id === event.taskId)
                            ?.assigneeId),
                    );
                    const workerLabel = worker ? `, worker ${worker.name}` : "";
                    const delta =
                      resizing?.id === event.id ? resizing.delta : 0;
                    const pixels = Math.max(
                      24,
                      (height + delta / 60) * hourPixels - 3,
                    );
                    const density =
                      pixels < 48
                        ? "compact"
                        : pixels < 78
                          ? "standard"
                          : "full";
                    return (
                      <div
                        key={event.id}
                        className={cx(
                          "time-calendar-event",
                          event.kind,
                          editable && "editable",
                        )}
                        data-density={density}
                        style={{
                          ...color(event),
                          top: top * hourPixels,
                          height: pixels,
                          left: `calc(${(lane / lanes) * 100}% + 3px)`,
                          width: `calc(${100 / lanes}% - 6px)`,
                        }}
                        draggable={editable}
                        onDragStart={(drag) => {
                          if (!editable) return drag.preventDefault();
                          drag.dataTransfer.setData(
                            calendarDragType,
                            JSON.stringify({ sessionId: event.sessionId }),
                          );
                          drag.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <button
                          className="calendar-event-open"
                          title={`${labels[event.kind]}: ${event.title}\n${clock(event.start!, zone)} – ${clock(event.end!, zone)}${workerLabel}`}
                          aria-label={`${labels[event.kind]}: ${event.title}, ${clock(event.start!, zone)} to ${clock(event.end!, zone)}${workerLabel}`}
                          onClick={() =>
                            event.taskId
                              ? onOpenTask(event.taskId)
                              : onSelectDay(day)
                          }
                        >
                          <strong>{event.title}</strong>
                          <span className="time-event-clock">
                            {clock(event.start!, zone)}
                          </span>
                          <small>{labels[event.kind]}</small>
                          {worker && worker.id !== actorId && (
                            <span
                              className="calendar-event-person"
                              title={worker.name}
                            >
                              {worker.name
                                .split(" ")
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                          )}
                        </button>
                        {editable && (
                          <>
                            <button
                              className="calendar-event-edit"
                              aria-label={"Edit time for " + event.title}
                              title="Edit time"
                              onClick={() => onEdit(event)}
                            >
                              <Clock3 size={12} />
                            </button>
                            <button
                              className="calendar-event-resize"
                              aria-label={"Resize time for " + event.title}
                              title="Drag to resize; Enter to edit"
                              onClick={() => {
                                if (resizeClickHandled.current) {
                                  resizeClickHandled.current = false;
                                  return;
                                }
                                onEdit(event);
                              }}
                              onPointerDown={(pointer) => {
                                pointer.preventDefault();
                                pointer.stopPropagation();
                                resizeClickHandled.current = false;
                                pointer.currentTarget.setPointerCapture(
                                  pointer.pointerId,
                                );
                                resizeStart.current = {
                                  event,
                                  y: pointer.clientY,
                                };
                              }}
                              onPointerMove={(pointer) => {
                                const initial = resizeStart.current;
                                if (!initial || initial.event.id !== event.id)
                                  return;
                                const delta =
                                  Math.round(
                                    ((pointer.clientY - initial.y) /
                                      hourPixels) *
                                      4,
                                  ) * 15;
                                setResizing({
                                  id: event.id,
                                  delta: Math.max(
                                    15 - (event.end! - event.start!) / 60000,
                                    delta,
                                  ),
                                });
                              }}
                              onPointerUp={(pointer) => {
                                pointer.preventDefault();
                                pointer.stopPropagation();
                                const initial = resizeStart.current;
                                resizeClickHandled.current = true;
                                resizeStart.current = undefined;
                                if (
                                  initial &&
                                  resizing?.id === event.id &&
                                  resizing.delta
                                )
                                  onMove(
                                    event,
                                    event.start!,
                                    event.end! + resizing.delta * 60000,
                                  );
                                else onEdit(event);
                                setResizing(undefined);
                              }}
                              onPointerCancel={() => {
                                resizeStart.current = undefined;
                                setResizing(undefined);
                              }}
                              onKeyDown={(key) => {
                                if (
                                  key.key === "ArrowDown" ||
                                  key.key === "ArrowUp"
                                ) {
                                  key.preventDefault();
                                  onMove(
                                    event,
                                    event.start!,
                                    Math.max(
                                      event.start! + 900000,
                                      event.end! +
                                        (key.key === "ArrowDown"
                                          ? 900000
                                          : -900000),
                                    ),
                                  );
                                }
                              }}
                            >
                              <span />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
