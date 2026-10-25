// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";
import { buildTodayOverview } from "../shared/today";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

it("MCP Today matches the app's read model, enforces read scope, and isolates selected teams", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules);
  const subject = "today-alice";
  const alice = t.withIdentity({
    subject,
    name: "Alice",
    email: "alice@example.test",
    emailVerified: true,
  });
  const workspaceId = (await alice.mutation(api.commands.bootstrap, {}))!;
  const teamId = await alice.mutation(api.commands.createTeam, {
    name: "Delivery",
  });
  for (const id of [workspaceId, teamId])
    await alice.mutation(api.commands.execute, {
      workspaceId: id,
      requestId: "capture-today",
      command: JSON.stringify({
        type: "create_task",
        title: "Review delivery",
        description: "",
        deadline: "2026-10-26",
        priority: "high",
        dependencies: [],
        labels: [],
      }),
    });
  for (const [token, scopes] of [
    ["kazi_today_reader", ["read"]],
    ["kazi_today_writer", ["tasks:write"]],
  ] as const)
    await t.mutation(internal.tokens.save, {
      subject,
      hash: await sha256(token),
      label: "Today test",
      scopes: [...scopes],
    });
  const call = async (
    args: Record<string, unknown>,
    token = "kazi_today_reader",
  ) => {
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
        params: {
          name: "get_today_overview",
          arguments: { workspaceId, ...args },
        },
      }),
    });
    return (await response.json()).result;
  };
  const snapshot = await alice.query(api.commands.snapshot, { workspaceId });
  const result = await call({});
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.result).toEqual(
    JSON.parse(
      JSON.stringify(
        buildTodayOverview(snapshot, { actorId: subject, now: Date.now() }),
      ),
    ),
  );
  expect(
    (await call({ teamIds: [workspaceId, teamId] })).structuredContent.result
      .counts.dueToday,
  ).toBe(2);
  expect((await call({}, "kazi_today_writer")).isError).toBe(true);
  const bob = t.withIdentity({
    subject: "today-bob",
    name: "Bob",
    email: "bob@example.test",
    emailVerified: true,
  });
  const foreignId = (await bob.mutation(api.commands.bootstrap, {}))!;
  expect((await call({ teamIds: [workspaceId, foreignId] })).isError).toBe(
    true,
  );
  expect((await call({ person: "unknown-person" })).isError).toBe(true);
  expect((await call({ projectId: "unknown-project" })).isError).toBe(true);
  expect(
    (await alice.query(api.commands.snapshot, { workspaceId })).tasks,
  ).toEqual(snapshot.tasks);
});
