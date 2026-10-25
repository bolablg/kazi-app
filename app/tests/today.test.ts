import { describe, expect, it } from "vitest";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { visibleState } from "../shared/domain";
import { buildTodayOverview } from "../shared/today";
import type { Task } from "../shared/model";

const now = Date.parse("2026-10-26T13:00:00Z");
const options = { actorId: DEMO_USER, now };

describe("Today overview", () => {
  it("uses local dates for timed deadlines and separates overdue instants from upcoming deadlines today", () => {
    const state = fixtureState(now);
    state.tasks = state.tasks.slice(0, 3).map((task, index) => ({
      ...task,
      status: "todo",
      assigneeId: DEMO_USER,
      deadline: ["2026-10-27T02:00:00Z", "2026-10-26T12:00:00Z", "2026-10-26"][
        index
      ],
    }));
    const before = structuredClone(state);
    const result = buildTodayOverview(state, options);
    expect(result.date).toBe("2026-10-26");
    expect(result.counts.overdue).toBe(1);
    expect(result.counts.dueToday).toBe(2);
    expect(result.counts.attention).toBe(3);
    expect(result.attention.overdue[0].id).toBe(state.tasks[1].id);
    expect(state).toEqual(before);
  });
  it("keeps the owner's validation queue even when the task has a different worker", () => {
    const state = fixtureState(now);
    state.tasks = [
      {
        ...state.tasks[0],
        id: "review-mine",
        ownerId: DEMO_USER,
        assigneeId: "demo-amira",
        status: "to_validate",
      },
      {
        ...state.tasks[0],
        id: "review-others",
        ownerId: "demo-amira",
        assigneeId: DEMO_USER,
        status: "to_validate",
      },
    ];
    const result = buildTodayOverview(state, options);
    expect(result.attention.toValidate.map((task) => task.id)).toEqual([
      "review-mine",
    ]);
    expect(result.focus).toHaveLength(0);
    state.tasks[0].ownerId = undefined;
    expect(buildTodayOverview(state, options).counts.toValidate).toBe(1);
  });
  it("omits drafts, completed and archived work, and leaves future starts out of focus", () => {
    const state = fixtureState(now);
    state.tasks = ["backlog", "done", "archived", "todo", "in_progress"].map(
      (status, index) => ({
        ...state.tasks[0],
        id: "task-" + index,
        status: status as Task["status"],
        deadline: "2026-10-25",
        startDate: "2026-10-30",
      }),
    );
    const result = buildTodayOverview(state, options);
    expect(result.counts.overdue).toBe(2);
    expect(result.focus.map((task) => task.status)).toEqual(["in_progress"]);
  });
  it("does not call To do work ready while its prerequisites are unfinished or unavailable", () => {
    const state = fixtureState(now);
    const first = state.tasks[0];
    state.tasks = [
      { ...first, id: "prerequisite", status: "in_progress" },
      {
        ...first,
        id: "waiting",
        status: "todo",
        dependencies: ["prerequisite"],
      },
      {
        ...first,
        id: "unavailable",
        status: "todo",
        dependencies: ["missing"],
      },
    ];
    expect(
      buildTodayOverview(state, options).focus.map((task) => task.id),
    ).toEqual(["prerequisite"]);
    state.tasks[0].status = "done";
    expect(
      buildTodayOverview(state, options).focus.map((task) => task.id),
    ).toEqual(["waiting"]);
  });
  it("honors authorized projects, project/person selections, and archived projects", () => {
    const state = fixtureState(now);
    state.members.find((member) => member.id === DEMO_USER)!.role = "member";
    const hidden = state.projects.find((project) => project.id === "brand")!;
    hidden.private = true;
    hidden.ownerId = "demo-amira";
    hidden.memberIds = ["demo-amira"];
    state.activities = state.tasks.map((task, index) => ({
      id: "event-" + index,
      taskId: task.id,
      projectId: task.projectId,
      actorId: DEMO_USER,
      at: now,
      kind: "comment",
      message: "Visible only with project access",
    }));
    const authorized = visibleState(state, DEMO_USER);
    const result = buildTodayOverview(authorized, {
      ...options,
      person: "all",
    });
    expect(JSON.stringify(result)).not.toContain('"projectId":"brand"');
    expect(
      result.projects.recent.some((project) => project.id === "brand"),
    ).toBe(false);
    const website = buildTodayOverview(authorized, {
      ...options,
      project: "website",
      person: "demo-daniel",
    });
    expect(
      website.focus.every(
        (task) =>
          task.projectId === "website" && task.assigneeId === "demo-daniel",
      ),
    ).toBe(true);
    authorized.projects.find((project) => project.id === "website")!.archived =
      true;
    expect(
      buildTodayOverview(authorized, { ...options, project: "website" }).counts
        .attention,
    ).toBe(0);
  });
  it("shows favorites separately from recently updated projects and excludes default planning from Recent", () => {
    const state = fixtureState(now);
    state.members[0].favoriteProjectIds = ["brand", state.workspace.inboxId];
    state.tasks.find((task) => task.projectId === "website")!.updatedAt = now;
    const result = buildTodayOverview(state, options);
    expect(result.projects.favorites.map((project) => project.id)).toEqual([
      state.workspace.inboxId,
      "brand",
    ]);
    expect(result.projects.recent[0].id).toBe("website");
    expect(
      result.projects.recent.some(
        (project) => project.id === state.workspace.inboxId,
      ),
    ).toBe(false);
  });
  it("paginates complete authorized queues, keeps exact counts, and includes relevant history on archived tasks", () => {
    const state = fixtureState(now);
    const template = state.tasks[0];
    state.tasks = Array.from({ length: 20 }, (_, index) => ({
      ...template,
      id: "task-" + index,
      status: "in_progress",
      deadline: "2026-10-25",
    }));
    state.activities = state.tasks.map((task, index) => ({
      id: "event-" + index,
      taskId: task.id,
      actorId: DEMO_USER,
      at: now - index,
      kind: "comment",
      message: "Progress discussion",
    }));
    const result = buildTodayOverview(state, options);
    expect(result.counts.attention).toBe(20);
    expect(result.attention.all).toHaveLength(5);
    expect(result.focus).toHaveLength(5);
    expect(result.activity).toHaveLength(5);
    expect(result.pagination.activity).toEqual({
      page: 1,
      pages: 4,
      total: 20,
      from: 1,
      to: 5,
    });
    const paged = buildTodayOverview(state, {
      ...options,
      attentionPage: 2,
      focusPage: 3,
      activityPage: 4,
    });
    expect(paged.attention.all).toHaveLength(5);
    expect(
      paged.attention.all.some((task) =>
        result.attention.all.some((first) => first.id === task.id),
      ),
    ).toBe(false);
    expect(paged.pagination.focus).toMatchObject({ page: 3, from: 11, to: 15 });
    expect(paged.activity.map(({ event }) => event.id)).toEqual([
      "event-15",
      "event-16",
      "event-17",
      "event-18",
      "event-19",
    ]);
    expect(
      buildTodayOverview(state, { ...options, activityPage: 999 }).pagination
        .activity.page,
    ).toBe(4);
    expect(
      buildTodayOverview(state, { ...options, attentionPage: NaN }).pagination
        .attention.all.page,
    ).toBe(1);
    expect(
      buildTodayOverview(state, { ...options, focusPage: -1 }).pagination.focus
        .page,
    ).toBe(1);
    state.tasks = state.tasks.slice(0, 7);
    const last = buildTodayOverview(state, {
      ...options,
      attentionPage: 4,
      focusPage: 4,
      activityPage: 4,
    });
    expect(last.pagination.focus).toEqual({
      page: 2,
      pages: 2,
      total: 7,
      from: 6,
      to: 7,
    });
    expect(last.focus).toHaveLength(2);
    expect(last.activity).toHaveLength(2);
    state.tasks[0].status = "archived";
    expect(buildTodayOverview(state, options).activity[0].task.status).toBe(
      "archived",
    );
    state.activities[0].at = now + 10000;
    expect(
      buildTodayOverview(state, options).activity.some(
        ({ event }) => event.id === "event-0",
      ),
    ).toBe(false);
  });
  it("returns a stable empty page when filters remove all matches", () => {
    const state = fixtureState(now);
    const result = buildTodayOverview(state, {
      ...options,
      project: "unavailable",
      activityPage: 3,
    });
    expect(result.focus).toEqual([]);
    expect(result.activity).toEqual([]);
    expect(result.pagination.activity).toEqual({
      page: 1,
      pages: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});
