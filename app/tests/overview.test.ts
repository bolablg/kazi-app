import { describe, it, expect } from "vitest";
import { fixtureState as seedState, DEMO_USER } from "../shared/fixtures";
import {
  overviewEvents,
  occupiedMinutes,
  dayBounds,
  taskDate,
  type OverviewEvent,
} from "../shared/overview";
const now = Date.parse("2026-10-26T13:00:00Z");
const options = {
  actorId: DEMO_USER,
  assigneeId: DEMO_USER,
  projectId: "all",
  zone: "America/Chicago",
  from: "2026-10-01",
  to: "2026-10-31",
  showProposed: false,
};
describe("overview schedule semantics", () => {
  it("keeps due dates and proposals separate from actual occupied time", () => {
    const state = seedState(now);
    const before = structuredClone(state);
    const events = overviewEvents(state, options);
    expect(events.some((e) => e.kind === "deadline")).toBe(true);
    expect(events.some((e) => e.kind === "proposed")).toBe(false);
    expect(occupiedMinutes(events, "scheduled")).toBe(60);
    const drafts = overviewEvents(state, { ...options, showProposed: true });
    expect(drafts.some((e) => e.kind === "proposed")).toBe(true);
    expect(occupiedMinutes(drafts, "scheduled")).toBe(60);
    expect(state).toEqual(before);
  });
  it("splits private busy time at local midnight, including a 25-hour DST day", () => {
    const state = seedState(now);
    const bounds = dayBounds("2026-11-01", "America/New_York");
    expect((bounds.end - bounds.start) / 3600000).toBe(25);
    state.busy = [
      {
        ownerId: DEMO_USER,
        start: bounds.start - 3600000,
        end: bounds.end + 3600000,
      },
      { ownerId: "other-user", start: bounds.start, end: bounds.end },
    ];
    const events = overviewEvents(state, {
      ...options,
      zone: "America/New_York",
      from: "2026-10-31",
      to: "2026-11-02",
    }).filter((e) => e.kind === "busy");
    expect(events.map((e) => e.date)).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(occupiedMinutes(events, "busy")).toBe(27 * 60);
  });
  it("merges overlapping busy intervals without double-counting", () => {
    const event = (start: number, end: number): OverviewEvent => ({
      id: String(start),
      kind: "busy",
      title: "Private",
      date: "2026-10-26",
      start,
      end,
    });
    expect(
      occupiedMinutes(
        [event(0, 60 * 60000), event(30 * 60000, 90 * 60000)],
        "busy",
      ),
    ).toBe(90);
  });
  it("uses the display timezone for timed deadlines and preserves date-only deadlines", () => {
    const task = seedState(now).tasks[0];
    expect(
      taskDate(
        { ...task, deadline: "2026-10-27T02:00:00Z" },
        "America/Chicago",
      ),
    ).toBe("2026-10-26");
    expect(
      taskDate({ ...task, deadline: "2026-10-27" }, "America/Chicago"),
    ).toBe("2026-10-27");
  });
  it("filters project and owner while keeping only the signed-in person's busy time", () => {
    const state = seedState(now);
    const events = overviewEvents(state, {
      ...options,
      projectId: state.projects[1].id,
    });
    expect(
      events
        .filter((e) => e.taskId)
        .every((e) => e.projectId === state.projects[1].id),
    ).toBe(true);
    expect(
      events
        .filter((e) => e.taskId)
        .every(
          (e) =>
            state.tasks.find((t) => t.id === e.taskId)?.assigneeId ===
            DEMO_USER,
        ),
    ).toBe(true);
    expect(events.some((e) => e.kind === "busy")).toBe(true);
  });
});

it("keeps a reservation with its calendar owner after task reassignment", () => {
  const state = seedState(now);
  const id = state.versions[0].sessions[0].taskId;
  state.tasks.find((t) => t.id === id)!.assigneeId = "demo-amira";
  const mine = overviewEvents(state, options).filter(
    (e) => e.kind === "scheduled",
  );
  expect(mine.some((e) => e.taskId === id)).toBe(true);
  expect(
    overviewEvents(state, { ...options, assigneeId: "demo-amira" }).some(
      (e) => e.kind === "scheduled" && e.taskId === id,
    ),
  ).toBe(false);
});
it("a released current receipt takes precedence over an accepted history snapshot", () => {
  const state = seedState(now),
    v = state.versions[0],
    p = structuredClone(state.proposals[0]);
  p.id = v.proposalId;
  p.status = "partial";
  p.alternatives[0].sessions = v.sessions.map((s) => ({
    ...s,
    status: "released",
  }));
  p.selected = 0;
  state.proposals.push(p);
  expect(
    overviewEvents(state, options).some((e) => e.kind === "scheduled"),
  ).toBe(false);
});
it("counts simultaneous scheduled work separately for different calendar owners", () => {
  const event: OverviewEvent = {
    id: "one",
    title: "Work",
    date: "2026-10-26",
    kind: "scheduled",
    start: 0,
    end: 3600000,
    ownerId: "alice",
  };
  expect(
    occupiedMinutes(
      [event, { ...event, id: "two", ownerId: "bob" }],
      "scheduled",
    ),
  ).toBe(120);
});
