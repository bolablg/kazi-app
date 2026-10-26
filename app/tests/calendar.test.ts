import { describe, it, expect } from "vitest";
import {
  calendarPeriod,
  moveCalendarDate,
  calendarHours,
  layoutCalendarEvents,
  timedCalendarBounds,
} from "../shared/calendar";
import { dayBounds, type OverviewEvent } from "../shared/overview";
describe("calendar date windows", () => {
  it("includes a complete Monday-to-Sunday week across year and month boundaries", () => {
    const week = calendarPeriod("2027-01-01", "week");
    expect(week.start).toBe("2026-12-28");
    expect(week.end).toBe("2027-01-03");
    expect(week.days).toHaveLength(7);
    expect(calendarPeriod("2026-11-01", "week").start).toBe("2026-10-26");
  });
  it("uses five workdays and three-day windows across the year boundary", () => {
    const workweek = calendarPeriod("2027-01-01", "workweek");
    expect(workweek.days).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(workweek.end).toBe("2027-01-01");
    expect(moveCalendarDate("2027-01-01", "workweek", 1)).toBe("2027-01-08");
    expect(calendarPeriod("2026-12-31", "3day").days).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(moveCalendarDate("2026-12-31", "3day", 1)).toBe("2027-01-03");
  });
  it("clamps month navigation and moves weeks/days by calendar dates", () => {
    expect(moveCalendarDate("2027-01-31", "month", 1)).toBe("2027-02-28");
    expect(moveCalendarDate("2026-12-28", "week", 1)).toBe("2027-01-04");
    expect(moveCalendarDate("2028-02-28", "day", 1)).toBe("2028-02-29");
    expect(calendarPeriod("2026-11-01", "day").days).toEqual(["2026-11-01"]);
  });
  it("pads monthly grids while keeping month totals inside the actual month", () => {
    const month = calendarPeriod("2026-11-15", "month");
    expect(month.start).toBe("2026-11-01");
    expect(month.end).toBe("2026-11-30");
    expect(month.days[0]).toBe("2026-10-26");
    expect(month.days.at(-1)).toBe("2026-12-06");
  });
});
const event = (id: string, start: string, end: string): OverviewEvent => ({
  id,
  title: id,
  date: "2026-10-26",
  kind: "scheduled",
  start: Date.parse(start),
  end: Date.parse(end),
});
describe("timed calendar layout", () => {
  it("places overlapping events in separate lanes and restores full width after a gap", () => {
    const events = [
      event("one", "2026-10-26T14:00:00Z", "2026-10-26T15:00:00Z"),
      event("two", "2026-10-26T14:30:00Z", "2026-10-26T15:30:00Z"),
      event("three", "2026-10-26T16:00:00Z", "2026-10-26T17:00:00Z"),
    ];
    const layout = layoutCalendarEvents(
      events,
      "2026-10-26",
      "America/Chicago",
      8,
      18,
    );
    expect(layout[0]).toMatchObject({ lane: 0, lanes: 2, top: 1, height: 1 });
    expect(layout[1]).toMatchObject({ lane: 1, lanes: 2 });
    expect(layout[2]).toMatchObject({ lane: 0, lanes: 1 });
  });
  it("shows early and late events and excludes due-date-only items from time reservations", () => {
    const events = [
      event("early", "2026-10-26T10:00:00Z", "2026-10-26T11:00:00Z"),
      event("late", "2026-10-27T03:00:00Z", "2026-10-27T04:00:00Z"),
      {
        id: "due",
        title: "Due task",
        date: "2026-10-26",
        kind: "deadline" as const,
      },
    ];
    expect(timedCalendarBounds(events, "America/Chicago")).toEqual({
      startHour: 5,
      endHour: 23,
    });
    expect(
      layoutCalendarEvents(events, "2026-10-26", "America/Chicago", 5, 23),
    ).toHaveLength(2);
  });
  it("keeps the repeated hour separate on a 25-hour daylight-saving day", () => {
    const day = "2026-11-01",
      zone = "America/New_York";
    const hours = calendarHours(day, zone, 0, 24);
    expect(hours.hours).toBe(25);
    expect(hours.ticks).toHaveLength(25);
    const events = [
      {
        ...event("first", "2026-11-01T05:15:00Z", "2026-11-01T05:45:00Z"),
        date: day,
      },
      {
        ...event("second", "2026-11-01T06:15:00Z", "2026-11-01T06:45:00Z"),
        date: day,
      },
    ];
    const layout = layoutCalendarEvents(events, day, zone, 0, 24);
    expect(layout[1].top - layout[0].top).toBe(1);
    expect(calendarHours("2026-03-08", zone, 0, 24).hours).toBe(23);
    expect(hours.end).toBe(dayBounds(day, zone).end);
  });
});
