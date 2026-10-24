// @vitest-environment edge-runtime
import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { seedState, DEMO_USER } from "../shared/fixtures";
import { loadState, persist } from "../convex/store";
import { sha256 } from "../convex/crypto";
import evaluation from "../../docs/mcp-evaluation.xml?raw";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());
it("solves ten fixed, independent, read-only MCP evaluation questions through authenticated HTTP tools", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    a = t.withIdentity({
      subject: DEMO_USER,
      name: "Alex Morgan",
      email: "alex@example.test",
      emailVerified: true,
    });
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  await t.run(async (ctx) => {
    const before = await loadState(ctx, workspaceId),
      after = seedState(Date.now()),
      inbox = after.workspace.inboxId;
    after.workspace = before.workspace;
    after.projects[0].id = before.workspace.inboxId;
    after.tasks.forEach((task) => {
      if (task.projectId === inbox) task.projectId = before.workspace.inboxId;
    });
    await persist(ctx, workspaceId, before, after);
  });
  const token = "kazi_evaluation_reader";
  await t.mutation(internal.tokens.save, {
    subject: DEMO_USER,
    hash: await sha256(token),
    label: "Read-only evaluation",
    scopes: ["read"],
  });
  const names = new Set<string>();
  async function read(name: string, args: Record<string, unknown> = {}) {
    names.add(name);
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: { workspaceId, ...args } },
      }),
    });
    const result = (await response.json()).result;
    expect(result.isError).not.toBe(true);
    return result.structuredContent.result;
  }
  async function list(name: string, args: Record<string, unknown> = {}) {
    const items: any[] = [];
    let cursor = 0;
    while (true) {
      const result = await read(name, { ...args, limit: 2, cursor });
      items.push(...result.items);
      if (result.nextCursor === null) return items;
      cursor = result.nextCursor;
    }
  }
  const before = await a.query(api.commands.snapshot, { workspaceId });
  const projects = await list("list_projects"),
    tasks = await list("list_tasks"),
    members = await list("list_members"),
    history = await list("get_plan_history");
  const remaining = (task: any) =>
    task.remainingMinutes ?? task.estimatedMinutes ?? 0;
  const open = (task: any) =>
    !["done", "rejected", "canceled"].includes(task.status) &&
    !tasks.some((child) => child.parentId === task.id);
  const largest = projects
    .map((p) => ({
      p,
      minutes: tasks
        .filter((t) => t.projectId === p.id && open(t))
        .reduce((n, t) => n + remaining(t), 0),
    }))
    .sort((a, b) => b.minutes - a.minutes)[0].p;
  const milestone = tasks.find(
    (t) =>
      t.milestone &&
      t.priority === "high" &&
      open(t) &&
      t.deadline < "2026-10-26",
  );
  const milestoneProject = await read("get_project", {
    id: milestone.projectId,
  });
  const notification = (await list("list_notifications")).find(
    (n) => n.proposalId,
  );
  const preview = await read("get_proposal", { id: notification.proposalId });
  expect(history.some((v) => v.id === preview.parentVersionId)).toBe(true);
  const report = (
    await read("get_report", { from: "2026-10-20", to: "2026-10-26" })
  ).report;
  const lateTask = (await read("get_task", { id: report.late[0].taskId })).task;
  const lateProject = await read("get_project", { id: lateTask.projectId });
  const plannedProject = await read("get_project", {
    id: history[0].projectId,
  });
  const ownerRemaining = tasks
    .filter(
      (t) =>
        t.projectId === plannedProject.id &&
        t.assigneeId === plannedProject.ownerId &&
        open(t),
    )
    .reduce((n, t) => n + remaining(t), 0);
  const inspired = history[0].taskSnapshot.find(
    (t: any) => t.title === "Collect launch inspiration",
  );
  const reserved = history[0].sessions
    .filter((s: any) => s.taskId === inspired.id)
    .reduce((n: number, s: any) => n + (s.end - s.start) / 60000, 0);
  const alex = members.find((m) => m.name === "Alex Morgan");
  const highMinutes = tasks
    .filter((t) => t.assigneeId === alex.id && t.priority === "high" && open(t))
    .reduce((n, t) => n + remaining(t), 0);
  const practice = tasks.find(
      (t) => t.title === "Practice networking fundamentals",
    ),
    privateProject = await read("get_project", { id: practice.projectId });
  const answers = [
    largest.title,
    members.find((m) => m.id === milestoneProject.ownerId).name,
    preview.recoveryTarget,
    String(report.onTimeRate),
    lateProject.title,
    String(ownerRemaining),
    String(reserved),
    String(highMinutes),
    String(report.medianCycleMinutes),
    privateProject.private &&
    privateProject.memberIds.length === 1 &&
    privateProject.memberIds[0] === practice.assigneeId
      ? "True"
      : "False",
  ];
  const expected = [...evaluation.matchAll(/<answer>(.*?)<\/answer>/g)].map(
    (match) => match[1],
  );
  expect(expected).toHaveLength(10);
  expect(answers).toEqual(expected);
  expect(names.size).toBeGreaterThanOrEqual(8);
  const after = await a.query(api.commands.snapshot, { workspaceId });
  expect(after.tasks).toEqual(before.tasks);
  expect(after.versions).toEqual(before.versions);
  expect(after.proposals).toEqual(before.proposals);
}, 30000);
