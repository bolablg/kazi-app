import { describe, expect, it } from "vitest";
import { fixtureState } from "../shared/fixtures";
import { ganttRows } from "../shared/gantt";
import type { Task } from "../shared/model";

const base = fixtureState(Date.parse("2026-10-26T13:00:00Z")).tasks[0];
const task = (id: string, patch: Partial<Task> = {}): Task => ({
  ...base,
  id,
  title: id,
  startDate: undefined,
  deadline: undefined,
  milestone: false,
  dependencies: [],
  status: "todo",
  ...patch,
});
const zone = () => "America/Chicago";

describe("project Gantt dates", () => {
  it("keeps explicit ranges, single starts, due markers, and undated work distinct", () => {
    const tasks = [
      task("range", { startDate: "2026-10-26", deadline: "2026-10-30" }),
      task("start", { startDate: "2026-10-27" }),
      task("due", { deadline: "2026-10-28" }),
      task("undated"),
    ];
    const before = structuredClone(tasks);
    expect(
      ganttRows(tasks, tasks, zone).map(({ task, start, end, kind }) => ({
        id: task.id,
        start,
        end,
        kind,
      })),
    ).toEqual([
      { id: "range", start: "2026-10-26", end: "2026-10-30", kind: "bar" },
      { id: "start", start: "2026-10-27", end: "2026-10-27", kind: "bar" },
      { id: "due", start: "2026-10-28", end: "2026-10-28", kind: "deadline" },
    ]);
    expect(tasks).toEqual(before);
  });

  it("places milestones on their due date and normalizes timed deadlines before sorting", () => {
    const tasks = [
      task("milestone", {
        startDate: "2026-10-20",
        deadline: "2026-10-30",
        milestone: true,
      }),
      task("timed", { deadline: "2026-10-27T02:00:00Z" }),
      task("date", { deadline: "2026-10-27" }),
      task("start milestone", { startDate: "2026-10-29", milestone: true }),
    ];
    expect(
      ganttRows(tasks, tasks, zone).map(({ task, start, end, kind }) => [
        task.id,
        start,
        end,
        kind,
      ]),
    ).toEqual([
      ["timed", "2026-10-26", "2026-10-26", "deadline"],
      ["date", "2026-10-27", "2026-10-27", "deadline"],
      ["start milestone", "2026-10-29", "2026-10-29", "milestone"],
      ["milestone", "2026-10-30", "2026-10-30", "milestone"],
    ]);
  });

  it("flags only unfinished dependencies that overrun an explicit planned start", () => {
    const dependency = task("prerequisite", { deadline: "2026-10-28" });
    const successor = task("successor", {
      startDate: "2026-10-27",
      deadline: "2026-10-30",
      dependencies: [dependency.id, "unavailable"],
    });
    const rows = (next: Task, before = dependency) =>
      ganttRows([next], [before, next], zone)[0];
    expect(rows(successor).conflict).toBe(true);
    expect(rows(successor).dependencies.map((d) => d.task.id)).toEqual([
      dependency.id,
    ]);
    expect(rows({ ...successor, startDate: undefined }).conflict).toBe(false);
    expect(rows({ ...successor, status: "done" }).conflict).toBe(false);
    expect(rows(successor, { ...dependency, status: "done" }).conflict).toBe(
      false,
    );
    expect(
      rows(successor, { ...dependency, deadline: "2026-10-27" }).conflict,
    ).toBe(false);
    expect(
      rows(successor, { ...dependency, deadline: undefined }).conflict,
    ).toBe(false);
  });
});
