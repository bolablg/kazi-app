import { Temporal } from "@js-temporal/polyfill";
import { defaults, type Preferences, type State } from "./model";

export type WorkingCalendar = Pick<
  Preferences,
  "timezone" | "workingDays" | "startHour" | "endHour"
>;

export function reportingCalendar(
  state: State,
  actorId: string,
): WorkingCalendar {
  const preferences =
    state.members.find((member) => member.id === actorId)?.preferences ??
    defaults;
  return {
    timezone: preferences.timezone,
    workingDays: [...preferences.workingDays],
    startHour: preferences.startHour,
    endHour: preferences.endHour,
  };
}

/** Calendar intersection, not a measurement of work performed. Dates use the report's working calendar. */
export function workingClock(calendar: WorkingCalendar) {
  const windows = new Map<string, { start: number; end: number } | null>();
  const atHour = (date: Temporal.PlainDate, hour: number) => {
    const minutes = Math.round(hour * 60);
    const day = minutes === 1440 ? date.add({ days: 1 }) : date;
    return day.toZonedDateTime({
      timeZone: calendar.timezone,
      plainTime: Temporal.PlainTime.from({
        hour: Math.floor(minutes / 60) % 24,
        minute: minutes % 60,
      }),
    }).epochMilliseconds;
  };
  return (start: number, end: number) => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      calendar.endHour <= calendar.startHour ||
      !calendar.workingDays.length
    )
      return 0;
    let date = Temporal.Instant.fromEpochMilliseconds(Math.trunc(start))
      .toZonedDateTimeISO(calendar.timezone)
      .toPlainDate();
    const last = Temporal.Instant.fromEpochMilliseconds(Math.trunc(end))
      .toZonedDateTimeISO(calendar.timezone)
      .toPlainDate();
    let minutes = 0;
    while (Temporal.PlainDate.compare(date, last) <= 0) {
      const key = date.toString();
      if (!windows.has(key))
        windows.set(
          key,
          calendar.workingDays.includes(date.dayOfWeek)
            ? {
                start: atHour(date, calendar.startHour),
                end: atHour(date, calendar.endHour),
              }
            : null,
        );
      const window = windows.get(key);
      if (window)
        minutes +=
          Math.max(
            0,
            Math.min(end, window.end) - Math.max(start, window.start),
          ) / 60000;
      date = date.add({ days: 1 });
    }
    return minutes;
  };
}
