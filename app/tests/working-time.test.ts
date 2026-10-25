import { expect, it } from "vitest";
import { workingClock } from "../shared/workingTime";
import { buildStageReport } from "../shared/lifecycle";
import { buildReport } from "../shared/reports";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import type { LifecycleEvent } from "../shared/model";

const calendar = {
  timezone: "America/New_York",
  workingDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};
const at = (value: string) => Date.parse(value);

it("counts only the working portions across nights and a weekend", () => {
  const minutes = workingClock(calendar);
  expect(
    minutes(at("2026-10-23T16:00:00-04:00"), at("2026-10-26T10:00:00-04:00")),
  ).toBe(120);
  expect(
    minutes(at("2026-10-24T12:00:00-04:00"), at("2026-10-25T15:00:00-04:00")),
  ).toBe(0);
  expect(
    minutes(at("2026-10-26T07:00:00-04:00"), at("2026-10-26T11:30:00-04:00")),
  ).toBe(150);
});
it("uses local working dates across a daylight-saving offset change", () => {
  expect(
    workingClock(calendar)(
      at("2026-10-30T16:00:00-04:00"),
      at("2026-11-02T10:00:00-05:00"),
    ),
  ).toBe(120);
});
it("uses real interval overlap when a configured Sunday shift crosses daylight saving", () => {
  const minutes = workingClock({
    ...calendar,
    workingDays: [7],
    startHour: 1,
    endHour: 4,
  });
  expect(
    minutes(at("2026-03-08T00:00:00-05:00"), at("2026-03-09T00:00:00-04:00")),
  ).toBe(120);
  expect(
    minutes(at("2026-11-01T00:00:00-04:00"), at("2026-11-02T00:00:00-05:00")),
  ).toBe(240);
});
it("supports end-of-day shifts and rejects reversed intervals", () => {
  const minutes = workingClock({
    ...calendar,
    timezone: "UTC",
    startHour: 22,
    endHour: 24,
  });
  expect(minutes(at("2026-10-26T21:00:00Z"), at("2026-10-27T00:30:00Z"))).toBe(
    120,
  );
  expect(minutes(10, 1)).toBe(0);
});
it("sums repeated stage visits per task before computing both means, and separates current age", () => {
  const now = at("2026-10-26T18:00:00Z");
  const state = fixtureState(now);
  const member = state.members.find((m) => m.id === DEMO_USER)!;
  member.preferences = { ...member.preferences, ...calendar, timezone: "UTC" };
  const task = state.tasks.find((t) => t.id === "t1")!;
  task.status = "in_progress";
  state.tasks = [task];
  const base = {
    entityType: "task" as const,
    entityId: task.id,
    projectId: task.projectId,
    actorId: DEMO_USER,
    assigneeId: DEMO_USER,
    action: "update_task",
    changes: ["status"],
  };
  const history: LifecycleEvent[] = [
    {
      ...base,
      id: "a",
      at: at("2026-10-23T16:00:00Z"),
      toStatus: "in_progress",
    },
    {
      ...base,
      id: "b",
      at: at("2026-10-26T10:00:00Z"),
      fromStatus: "in_progress",
      toStatus: "to_validate",
    },
    {
      ...base,
      id: "c",
      at: at("2026-10-26T11:00:00Z"),
      fromStatus: "to_validate",
      toStatus: "in_progress",
    },
    {
      ...base,
      id: "d",
      at: at("2026-10-26T13:00:00Z"),
      fromStatus: "in_progress",
      toStatus: "to_validate",
    },
    {
      ...base,
      id: "e",
      at: at("2026-10-26T16:00:00Z"),
      fromStatus: "to_validate",
      toStatus: "in_progress",
    },
  ];
  const report = buildStageReport(state, history, {
    from: "2026-10-01",
    to: "2026-10-26",
    zone: "UTC",
    actorId: DEMO_USER,
    person: DEMO_USER,
    project: task.projectId,
    now,
  });
  const stage = report.stages.find((stage) => stage.status === "in_progress")!;
  expect(stage.exits).toBe(2);
  expect(stage.sampleTasks).toBe(1);
  expect(stage.calendar.meanMinutes).toBe(68 * 60);
  expect(stage.working.meanMinutes).toBe(4 * 60);
  expect(
    report.taskStageDurations.find(
      (row) => row.taskId === task.id && row.status === "in_progress",
    ),
  ).toMatchObject({ visits: 2, calendarMinutes: 68 * 60, workingMinutes: 240 });
  expect(
    report.stages.find((stage) => stage.status === "to_validate")?.working
      .meanMinutes,
  ).toBe(240);
  expect(stage.working.medianCurrentAgeMinutes).toBe(60);
  expect(stage.calendar.medianCurrentAgeMinutes).toBe(120);
});
it("exposes both calendar and working lead/cycle time from the same immutable finish timestamps", () => {
  const now = at("2026-10-26T18:00:00Z");
  const state = fixtureState(now);
  state.members.find((m) => m.id === DEMO_USER)!.preferences = {
    ...state.members[0].preferences,
    ...calendar,
    timezone: "UTC",
  };
  const task = state.tasks[0];
  const report = buildReport(
    state,
    [
      {
        id: "finish",
        taskId: task.id,
        projectId: task.projectId,
        actorId: DEMO_USER,
        assigneeId: DEMO_USER,
        at: at("2026-10-26T10:00:00Z"),
        taskCreatedAt: at("2026-10-23T16:00:00Z"),
        startedAt: at("2026-10-23T16:30:00Z"),
        type: "completed",
        leaf: true,
        minutes: 0,
      },
    ],
    {
      from: "2026-10-01",
      to: "2026-10-26",
      zone: "UTC",
      actorId: DEMO_USER,
      person: "all",
      project: "all",
      now,
    },
  );
  expect(report.medianLeadMinutes).toBe(66 * 60);
  expect(report.medianWorkingLeadMinutes).toBe(120);
  expect(report.medianWorkingCycleMinutes).toBe(90);
});
