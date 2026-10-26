import { Temporal } from "@js-temporal/polyfill";
import { dayBounds, type OverviewEvent } from "./overview";
export type CalendarScale = "month" | "week" | "workweek" | "day" | "3day";
export function calendarPeriod(anchor: string, scale: CalendarScale) {
  const date = Temporal.PlainDate.from(anchor);
  const start =
    scale === "month"
      ? date.with({ day: 1 })
      : scale === "week" || scale === "workweek"
        ? date.subtract({ days: date.dayOfWeek - 1 })
        : date;
  const end =
    scale === "month"
      ? start.with({ day: start.daysInMonth })
      : scale === "week"
        ? start.add({ days: 6 })
        : scale === "workweek"
          ? start.add({ days: 4 })
          : scale === "3day"
            ? start.add({ days: 2 })
            : start;
  const gridStart =
    scale === "month" ? start.subtract({ days: start.dayOfWeek - 1 }) : start;
  const count =
    scale === "month"
      ? Math.ceil((start.dayOfWeek - 1 + start.daysInMonth) / 7) * 7
      : scale === "week"
        ? 7
        : scale === "workweek"
          ? 5
          : scale === "3day"
            ? 3
            : 1;
  return {
    start: start.toString(),
    end: end.toString(),
    days: Array.from({ length: count }, (_, i) =>
      gridStart.add({ days: i }).toString(),
    ),
  };
}
export function moveCalendarDate(
  date: string,
  scale: CalendarScale,
  direction: number,
) {
  return Temporal.PlainDate.from(date)
    .add(
      scale === "month"
        ? { months: direction }
        : {
            days:
              direction *
              (["week", "workweek"].includes(scale)
                ? 7
                : scale === "3day"
                  ? 3
                  : 1),
          },
    )
    .toString();
}
function localHour(day: string, hour: number, zone: string) {
  return hour === 24
    ? dayBounds(day, zone).end
    : Number(
        Temporal.PlainDate.from(day).toZonedDateTime({
          timeZone: zone,
          plainTime: Temporal.PlainTime.from({ hour }),
        }).epochMilliseconds,
      );
}
const clockHour = (at: number, zone: string) => {
  const t = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone);
  return t.hour + t.minute / 60;
};
export interface CalendarWorkingWindow {
  startHour: number;
  endHour: number;
}
/** The viewer supplies only authorized working windows in the displayed zone.
 * Visible bookings always expand the window; hidden/redacted teammate settings
 * must never be interpreted as their actual working hours. */
export function timedCalendarBounds(
  events: OverviewEvent[],
  zone: string,
  workingWindows: readonly CalendarWorkingWindow[] = [
    { startHour: 9, endHour: 17 },
  ],
) {
  const valid = workingWindows.filter(
    (window) =>
      Number.isFinite(window.startHour) &&
      Number.isFinite(window.endHour) &&
      window.startHour >= 0 &&
      window.endHour <= 24 &&
      window.endHour > window.startHour,
  );
  const windows = valid.length ? valid : [{ startHour: 9, endHour: 17 }];
  let first = Math.min(...windows.map((window) => window.startHour));
  let last = Math.max(...windows.map((window) => window.endHour));
  for (const event of events) {
    if (
      event.start === undefined ||
      event.end === undefined ||
      !Number.isFinite(event.start) ||
      !Number.isFinite(event.end) ||
      event.end <= event.start
    )
      continue;
    const bounds = dayBounds(event.date, zone);
    if (event.end <= bounds.start || event.start >= bounds.end) continue;
    first = Math.min(
      first,
      event.start <= bounds.start ? 0 : clockHour(event.start, zone),
    );
    last = Math.max(
      last,
      event.end >= bounds.end ? 24 : clockHour(event.end, zone),
    );
  }
  return {
    startHour: Math.max(0, Math.floor(first) - 1),
    endHour: Math.min(24, Math.ceil(last) + 1),
  };
}

/** UI preview only; the canonical command rechecks calendar rules on save. */
export function resizeCalendarInterval(
  interval: { start: number; end: number },
  edge: "start" | "end",
  deltaMinutes: number,
  limits: { minMinutes: number; maxMinutes: number },
) {
  const minimum = Math.max(15, limits.minMinutes) * 60000;
  const maximum = Math.max(limits.minMinutes, limits.maxMinutes) * 60000;
  return edge === "start"
    ? {
        start: Math.max(
          interval.end - maximum,
          Math.min(
            interval.end - minimum,
            interval.start + deltaMinutes * 60000,
          ),
        ),
        end: interval.end,
      }
    : {
        start: interval.start,
        end: Math.max(
          interval.start + minimum,
          Math.min(
            interval.start + maximum,
            interval.end + deltaMinutes * 60000,
          ),
        ),
      };
}
export function calendarHours(
  day: string,
  zone: string,
  startHour: number,
  endHour: number,
) {
  const start = localHour(day, startHour, zone),
    end = localHour(day, endHour, zone);
  return {
    start,
    end,
    hours: (end - start) / 3600000,
    ticks: Array.from(
      { length: Math.ceil((end - start) / 3600000) },
      (_, i) => start + i * 3600000,
    ),
  };
}
export interface TimedCalendarEvent {
  event: OverviewEvent;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}
// Pack overlaps into separate lanes; elapsed instants preserve repeated/skipped DST hours.
export function layoutCalendarEvents(
  events: OverviewEvent[],
  day: string,
  zone: string,
  startHour: number,
  endHour: number,
): TimedCalendarEvent[] {
  const window = calendarHours(day, zone, startHour, endHour);
  const timed = events
    .filter(
      (e) =>
        e.date === day &&
        e.start !== undefined &&
        e.end !== undefined &&
        e.end > window.start &&
        e.start < window.end,
    )
    .sort(
      (a, b) =>
        a.start! - b.start! || b.end! - a.end! || a.id.localeCompare(b.id),
    );
  const output: TimedCalendarEvent[] = [];
  let group: TimedCalendarEvent[] = [],
    groupEnd = -Infinity,
    laneEnds: number[] = [];
  const finish = () => {
    group.forEach((e) => (e.lanes = laneEnds.length));
    group = [];
    laneEnds = [];
    groupEnd = -Infinity;
  };
  for (const event of timed) {
    if (event.start! >= groupEnd) finish();
    let lane = laneEnds.findIndex((end) => end <= event.start!);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = event.end!;
    groupEnd = Math.max(groupEnd, event.end!);
    const item = {
      event,
      top: (Math.max(event.start!, window.start) - window.start) / 3600000,
      height:
        (Math.min(event.end!, window.end) -
          Math.max(event.start!, window.start)) /
        3600000,
      lane,
      lanes: 1,
    };
    group.push(item);
    output.push(item);
  }
  finish();
  return output;
}
