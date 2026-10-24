import { Temporal } from "@js-temporal/polyfill";
import { dayBounds, type OverviewEvent } from "./overview";
export type CalendarScale = "month" | "week" | "day";
export function calendarPeriod(anchor: string, scale: CalendarScale) {
  const date = Temporal.PlainDate.from(anchor);
  const start =
    scale === "month"
      ? date.with({ day: 1 })
      : scale === "week"
        ? date.subtract({ days: date.dayOfWeek - 1 })
        : date;
  const end =
    scale === "month"
      ? start.with({ day: start.daysInMonth })
      : scale === "week"
        ? start.add({ days: 6 })
        : start;
  const gridStart =
    scale === "month" ? start.subtract({ days: start.dayOfWeek - 1 }) : start;
  const count =
    scale === "month"
      ? Math.ceil((start.dayOfWeek - 1 + start.daysInMonth) / 7) * 7
      : scale === "week"
        ? 7
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
        : { days: direction * (scale === "week" ? 7 : 1) },
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
export function timedCalendarBounds(events: OverviewEvent[], zone: string) {
  let startHour = 8,
    endHour = 18;
  for (const e of events) {
    if (e.start === undefined || e.end === undefined) continue;
    startHour = Math.min(startHour, Math.floor(clockHour(e.start, zone)));
    const end =
      e.end === dayBounds(e.date, zone).end
        ? 24
        : Math.ceil(clockHour(e.end, zone));
    endHour = Math.max(endHour, end);
  }
  return { startHour, endHour };
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
