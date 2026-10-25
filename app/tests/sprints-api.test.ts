// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { loadState, persist } from "../convex/store";
import { sha256 } from "../convex/crypto";
import type { input } from "zod";
import { commandSchema, type Command } from "../shared/model";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());
const user = {
  subject: "sprint-owner",
  name: "Sprint Owner",
  email: "owner@example.test",
  emailVerified: true,
};
const create: Command = {
  type: "create_sprint",
  title: "Practical first sprint",
  objective: "Ship a usable invitation flow",
  successCriteria: "A teammate can join",
  startDate: "2026-10-26",
  endDate: "2026-11-08",
  timezone: "America/Chicago",
  taskIds: [],
};

it("persists sprint selection, planning, and closeout through the real Convex services with idempotent retries", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    owner = t.withIdentity(user);
  const workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
  let index = 0;
  const execute = (command: Command, requestId = `sprint-api-${++index}`) =>
    owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify(command),
      requestId,
    });
  const taskId = await execute({
    type: "create_task",
    title: "Build invitations",
    description: "",
    status: "todo",
    priority: "medium",
    estimatedMinutes: 60,
    dependencies: [],
    labels: [],
  });
  const sprintId = await execute(
    { ...create, taskIds: [taskId] },
    "create-sprint-retry",
  );
  expect(
    await execute({ ...create, taskIds: [taskId] }, "create-sprint-retry"),
  ).toBe(sprintId);
  await execute({ type: "start_sprint", id: sprintId, revision: 1 });
  const proposalId = await owner.action(api.commands.plan, {
    workspaceId,
    command: JSON.stringify({
      type: "propose",
      sprintId,
      startDate: "2026-10-26",
      days: 14,
      trigger: "weekly",
    }),
    requestId: "sprint-calendar-preview",
  });
  let state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.sprints).toHaveLength(1);
  expect(
    state.proposals.find((p) => p.id === proposalId)?.alternatives[0].sessions,
  ).toHaveLength(1);
  await owner.action(api.commands.plan, {
    workspaceId,
    command: JSON.stringify({ type: "approve", id: proposalId, revision: 1 }),
    requestId: "sprint-calendar-approve",
  });
  state = await owner.query(api.commands.snapshot, { workspaceId });
  const version = structuredClone(state.versions[0]);
  expect(version.sprintId).toBe(sprintId);
  expect(version.sessions[0].status).toBe("scheduled");
  await execute(
    {
      type: "close_sprint",
      id: sprintId,
      revision: 2,
      outcome: "partial",
      note: "Continue after review",
      decisions: [{ taskId, action: "outside" }],
    },
    "close-sprint-retry",
  );
  await execute(
    {
      type: "close_sprint",
      id: sprintId,
      revision: 2,
      outcome: "partial",
      note: "Continue after review",
      decisions: [{ taskId, action: "outside" }],
    },
    "close-sprint-retry",
  );
  state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.sprints![0].closeout?.tasks[0].status).toBe("todo");
  expect(state.tasks[0].status).toBe("todo");
  expect(state.versions[0]).toEqual(version);
  await expect(
    t.run(async (ctx) => {
      const before = await loadState(ctx, workspaceId),
        after = structuredClone(before);
      after.sprints![0].objective = "Rewritten history";
      await persist(ctx, workspaceId, before, after);
    }),
  ).rejects.toThrow("Closed sprint history");
  const stranger = t.withIdentity({
    subject: "other-workspace",
    name: "Other",
  });
  await stranger.mutation(api.commands.bootstrap, {});
  await expect(
    stranger.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify({
        type: "start_sprint",
        id: sprintId,
        revision: 1,
      }),
      requestId: "outside-attempt",
    }),
  ).rejects.toThrow("unavailable");
});

it("uses MCP sprint capabilities with read and write scope boundaries, including status-changing closeout", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    owner = t.withIdentity(user);
  const workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
  const taskId = await owner.mutation(api.commands.execute, {
    workspaceId,
    command: JSON.stringify({
      type: "create_task",
      title: "Existing card",
      description: "",
      priority: "medium",
      dependencies: [],
      labels: [],
    }),
    requestId: "mcp-card",
  });
  const token = "kazi_sprint_only_test";
  await t.mutation(internal.tokens.save, {
    subject: user.subject,
    hash: await sha256(token),
    label: "Sprint access",
    scopes: ["read", "sprints:write"],
  });
  const call = async (
    name: string,
    args: Record<string, unknown> = {},
    credential = token,
  ) => {
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: { workspaceId, ...args } },
      }),
    });
    return (await response.json()).result;
  };
  const created = await call("create_sprint", {
    ...create,
    type: undefined,
    title: undefined,
    objectives: [
      {
        id: "mcp-objective",
        title: create.objective,
        successCriteria: "A teammate can join",
      },
    ],
    objectiveAssignments: { [taskId]: "mcp-objective" },
    taskIds: [taskId],
    requestId: "mcp-sprint-create",
  });
  expect(created.isError).not.toBe(true);
  const listed = await call("list_sprints");
  const sprint = listed.structuredContent.result.items[0];
  expect(sprint.objective).toBe(create.objective);
  expect(sprint.title).toBe("Perso - Sprint - W44");
  expect(sprint.objectiveAssignments).toEqual({ [taskId]: "mcp-objective" });
  expect(
    (await call("get_sprint", { id: sprint.id })).structuredContent.result.id,
  ).toBe(sprint.id);
  expect(
    (await call("list_tasks", { sprintId: sprint.id })).structuredContent.result
      .items,
  ).toHaveLength(1);
  expect(
    (
      await call("start_sprint", {
        id: sprint.id,
        revision: 1,
        requestId: "mcp-sprint-start",
      })
    ).isError,
  ).not.toBe(true);
  const denied = await call("close_sprint", {
    id: sprint.id,
    revision: 2,
    outcome: "missed",
    decisions: [{ taskId, action: "backlog" }],
    requestId: "mcp-sprint-close-denied",
  });
  expect(denied.isError).toBe(true);
  expect(JSON.stringify(denied)).toContain("tasks:write");
  expect(
    (
      await call("close_sprint", {
        id: sprint.id,
        revision: 2,
        objectiveOutcomes: [
          { objectiveId: "mcp-objective", outcome: "missed" },
        ],
        decisions: [{ taskId, action: "outside" }],
        requestId: "mcp-sprint-close",
      })
    ).isError,
  ).not.toBe(true);
  const readToken = "kazi_sprint_read_test";
  await t.mutation(internal.tokens.save, {
    subject: user.subject,
    hash: await sha256(readToken),
    label: "Read only",
    scopes: ["read"],
  });
  expect(
    (
      await call(
        "create_sprint",
        { ...create, type: undefined, requestId: "read-only-create" },
        readToken,
      )
    ).isError,
  ).toBe(true);
  expect((await call("list_sprints", {}, readToken)).isError).not.toBe(true);
});

it("round-trips automatic names, objective assignments, calendar snapshots, and independent objective reviews", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    owner = t.withIdentity(user);
  const workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
  let index = 0;
  const execute = (command: input<typeof commandSchema>) =>
    owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify(command),
      requestId: `objectives-api-${++index}`,
    });
  const taskIds = await Promise.all(
    ["Build invitations", "Verify access"].map((title) =>
      execute({
        type: "create_task",
        title,
        description: "",
        status: "todo",
        priority: "medium",
        estimatedMinutes: 60,
        dependencies: [],
        labels: [],
      }),
    ),
  );
  const objectives = [
    {
      id: "invitation",
      title: "A colleague can join",
      successCriteria: "Invitation accepted",
    },
    {
      id: "access",
      title: "A colleague has correct access",
      successCriteria: "Access verified",
    },
  ];
  const objectiveAssignments = {
    [taskIds[0]]: "invitation",
    [taskIds[1]]: "access",
  };
  const sprintId = await execute({
    type: "create_sprint",
    startDate: "2026-10-26",
    endDate: "2026-11-08",
    timezone: "America/Chicago",
    taskIds,
    objectives,
    objectiveAssignments,
  });
  let state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.sprints![0]).toMatchObject({
    title: "Perso - Sprint - W44",
    automaticName: true,
    objectives,
    objectiveAssignments,
    status: "planned",
  });
  await execute({
    type: "update_sprint",
    id: sprintId,
    revision: 1,
    patch: { focus: "A useful first shared workspace" },
  });
  await execute({ type: "start_sprint", id: sprintId, revision: 2 });
  const proposalId = await owner.action(api.commands.plan, {
    workspaceId,
    command: JSON.stringify({
      type: "propose",
      sprintId,
      startDate: "2026-10-26",
      days: 14,
      trigger: "weekly",
    }),
    requestId: "objectives-calendar-preview",
  });
  await owner.action(api.commands.plan, {
    workspaceId,
    command: JSON.stringify({ type: "approve", id: proposalId, revision: 1 }),
    requestId: "objectives-calendar-approve",
  });
  state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.versions[0].inputs!.sprintObjectives).toMatchObject(objectives);
  expect(state.versions[0].inputs!.sprintObjectiveAssignments).toEqual(
    objectiveAssignments,
  );
  expect(state.versions[0].inputs!.sprintFocus).toBe(
    "A useful first shared workspace",
  );
  expect(
    state.versions[0].sessions.map((session) => session.taskId).sort(),
  ).toEqual([...taskIds].sort());
  await expect(
    execute({
      type: "close_sprint",
      id: sprintId,
      revision: 3,
      objectiveOutcomes: [{ objectiveId: "invitation", outcome: "achieved" }],
      decisions: taskIds.map((taskId) => ({
        taskId,
        action: "outside" as const,
      })),
    }),
  ).rejects.toThrow("Assess every sprint objective");
  await execute({
    type: "close_sprint",
    id: sprintId,
    revision: 3,
    objectiveOutcomes: [
      {
        objectiveId: "invitation",
        outcome: "achieved",
        note: "Invitation accepted",
      },
      {
        objectiveId: "access",
        outcome: "partial",
        note: "One permission remains to verify",
      },
    ],
    decisions: taskIds.map((taskId) => ({
      taskId,
      action: "outside" as const,
    })),
  });
  state = await owner.query(api.commands.snapshot, { workspaceId });
  const closed = structuredClone(state.sprints![0]);
  expect(closed.initialObjectives).toMatchObject(objectives);
  expect(closed.initialObjectiveAssignments).toEqual(objectiveAssignments);
  expect(closed.closeout?.objectiveAssignments).toEqual(objectiveAssignments);
  expect(closed.closeout?.outcome).toBeUndefined();
  expect(
    closed.closeout?.objectives?.map((objective) => objective.outcome),
  ).toEqual(["achieved", "partial"]);
  await execute({
    type: "update_task",
    id: taskIds[0],
    patch: { title: "Later renamed card" },
  });
  state = await owner.query(api.commands.snapshot, { workspaceId });
  expect(state.sprints![0]).toEqual(closed);
  await expect(
    t.run(async (ctx) => {
      const before = await loadState(ctx, workspaceId),
        after = structuredClone(before);
      after.sprints![0].closeout!.objectives![0].outcome = "missed";
      await persist(ctx, workspaceId, before, after);
    }),
  ).rejects.toThrow("Closed sprint history");
});
