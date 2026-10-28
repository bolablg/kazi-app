// @vitest-environment edge-runtime
import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";
import { commandSchema } from "../shared/model";
import { commandScopes } from "../shared/capabilities";
const modules = import.meta.glob("../convex/**/*.ts");
const alice = {
  subject: "agenda-alice",
  name: "Alice",
  email: "alice@example.test",
  emailVerified: true,
};
const bob = {
  subject: "agenda-bob",
  name: "Bob",
  email: "bob@example.test",
  emailVerified: true,
};
const capture = {
  type: "create_task",
  title: "Agenda task",
  description: "",
  priority: "medium",
  estimatedMinutes: 60,
  deadline: "2026-10-30",
  dependencies: [],
  labels: [],
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("publishes links on the production frontend domain and keeps the same private feed path", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://production-fixture.convex.site");
  vi.stubEnv("APP_ORIGIN", "https://kazi.iyanju.com/");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice);
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  const link = await a.action(api.calendar.createFeed, {
    workspaceId,
    label: "Branded calendar",
    includeDeadlines: false,
  });
  expect(link.url).toMatch(
    /^https:\/\/kazi\.iyanju\.com\/agenda\/[a-f0-9]{64}\.ics$/,
  );
  expect((await t.fetch(new URL(link.url).pathname)).status).toBe(200);
});

it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"])(
  "rejects missing %s before creating Google consent state with a readable error",
  async (missing) => {
    vi.stubEnv("APP_ORIGIN", "https://kazi.iyanju.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", btoa("k".repeat(32)));
    vi.stubEnv(missing, "");
    const t = convexTest(schema, modules),
      a = t.withIdentity(alice);
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await expect(
      a.action(api.calendar.connect, { workspaceId }),
    ).rejects.toThrow("Google Calendar setup is incomplete");
    expect(
      await t.run((ctx) => ctx.db.query("oauthStates").collect()),
    ).toHaveLength(0);
  },
);

it("uses the same branded Google callback for consent and token exchange, then returns to availability settings", async () => {
  vi.stubEnv("APP_ORIGIN", "https://kazi.iyanju.com");
  vi.stubEnv("CONVEX_SITE_URL", "https://production-fixture.convex.site");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", btoa("k".repeat(32)));
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice);
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  const url = new URL(await a.action(api.calendar.connect, { workspaceId }));
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://kazi.iyanju.com/google/callback",
  );
  expect(url.searchParams.get("scope")).not.toContain("/auth/calendar.events ");
  const google = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ refresh_token: "fixture-refresh" }));
  try {
    const response = await t.fetch(
      `/google/callback?code=fixture-code&state=${url.searchParams.get("state")}`,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://kazi.iyanju.com/connections?tab=calendar&calendar=connected",
    );
    expect(
      new URLSearchParams(google.mock.calls[0][1]!.body as URLSearchParams).get(
        "redirect_uri",
      ),
    ).toBe(url.searchParams.get("redirect_uri"));
    expect(
      await t.run((ctx) => ctx.db.query("calendarSecrets").collect()),
    ).toHaveLength(1);
    const replay = await t.fetch(
      `/google/callback?code=fixture-code&state=${url.searchParams.get("state")}`,
    );
    expect(replay.headers.get("Location")).toContain("calendar=error");
    expect(google).toHaveBeenCalledTimes(1);
  } finally {
    google.mockRestore();
  }
});
it("calendar subscriptions require a secret, honor revocation and current membership, and expose no hashes", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://kazi.example.test");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    b = t.withIdentity(bob);
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).calendars[0].status,
  ).toBe("native");
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "feed-task",
    command: JSON.stringify(capture),
  });
  const link = await a.action(api.calendar.createFeed, {
    workspaceId,
    label: "My agenda",
    includeDeadlines: true,
  });
  const path = new URL(link.url).pathname;
  const response = await t.fetch(path);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/calendar");
  expect(await response.text()).toContain("Due: Agenda task");
  const feeds = await a.query(api.calendar.feeds, { workspaceId });
  expect(feeds[0]).not.toHaveProperty("hash");
  expect(feeds[0]).not.toHaveProperty("url");
  await expect(
    b.mutation(api.calendar.revokeFeed, { id: link.id as any }),
  ).rejects.toThrow("unavailable");
  expect((await t.fetch("/agenda/" + "a".repeat(64) + ".ics")).status).toBe(
    404,
  );
  await a.mutation(api.calendar.revokeFeed, { id: link.id as any });
  expect((await t.fetch(path)).status).toBe(404);
  const fresh = await a.action(api.calendar.createFeed, {
    workspaceId,
    label: "Second",
    includeDeadlines: true,
  });
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", alice.subject),
      )
      .unique();
    await ctx.db.delete(member!._id);
  });
  expect((await t.fetch(new URL(fresh.url).pathname)).status).toBe(404);
});
it("an all-team subscription includes current authorized teams and drops removed membership", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://kazi.example.test");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    workspaceId = (await a.mutation(api.commands.bootstrap, {}))!,
    teamId = await a.mutation(api.commands.createTeam, { name: "Agenda team" });
  for (const [id, title] of [
    [workspaceId, "Personal agenda"],
    [teamId, "Team agenda"],
  ] as const)
    await a.mutation(api.commands.execute, {
      workspaceId: id,
      requestId: "agenda-task",
      command: JSON.stringify({ ...capture, title }),
    });
  const link = await a.action(api.calendar.createFeed, {
    workspaceId,
    label: "All teams",
    includeDeadlines: true,
    allTeams: true,
  });
  const path = new URL(link.url).pathname;
  const before = await (await t.fetch(path)).text();
  expect(before).toContain("Personal agenda");
  expect(before).toContain("Team agenda");
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", teamId).eq("key", alice.subject),
      )
      .unique();
    await ctx.db.delete(member!._id);
  });
  const after = await (await t.fetch(path)).text();
  expect(after).toContain("Personal agenda");
  expect(after).not.toContain("Team agenda");
});
it("native plan approval uses the real verified action and creates no provider outbox", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "native-task",
    command: JSON.stringify({ ...capture, status: "todo" }),
  });
  const id = await a.action(api.commands.plan, {
    workspaceId,
    requestId: "native-preview",
    command: JSON.stringify({
      type: "propose",
      startDate: "2026-10-26",
      days: 5,
    }),
  });
  const args = {
    workspaceId,
    requestId: "native-approve",
    command: JSON.stringify({ type: "approve", id, revision: 1 }),
  };
  const version = await a.action(api.commands.plan, args);
  expect(await a.action(api.commands.plan, args)).toBe(version);
  const state = await a.query(api.commands.snapshot, { workspaceId });
  expect(state.proposals[0].status).toBe("applied");
  expect(await t.run((ctx) => ctx.db.query("outbox").collect())).toHaveLength(
    0,
  );
  const sessionIds = state.versions[0].sessions.map((s) => s.id);
  await a.action(api.commands.release, {
    workspaceId,
    requestId: "native-release",
    command: JSON.stringify({
      type: "release_sessions",
      versionId: version,
      sessionIds,
    }),
  });
  const after = await a.query(api.commands.snapshot, { workspaceId });
  expect(after.proposals[0].alternatives[0].sessions[0].status).toBe(
    "released",
  );
  expect(after.versions).toEqual(state.versions);
});
it("MCP covers every command and enforces granular scopes, same-state edits, and constrained delegation", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://kazi.example.test");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  expect(Object.keys(commandScopes).sort()).toEqual(
    commandSchema.options.map((o) => o.shape.type.value).sort(),
  );
  const token = "kazi_api_test";
  await t.mutation(internal.tokens.save, {
    subject: alice.subject,
    hash: await sha256(token),
    label: "Tasks only",
    scopes: ["read", "tasks:write"],
  });
  async function call(
    name: string,
    args: Record<string, unknown>,
    credential = token,
  ) {
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer " + credential,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: { workspaceId, ...args } },
      }),
    });
    return (await response.json()).result;
  }
  const created = await call("create_task", {
    ...capture,
    requestId: "mcp-capture",
  });
  expect(created.isError).not.toBe(true);
  const id = created.structuredContent.result;
  expect(
    (await call("get_task", { id })).structuredContent.result.task.status,
  ).toBe("backlog");
  await call("add_comment", {
    id,
    body: "Same activity service",
    requestId: "mcp-comment",
  });
  await call("update_task", {
    id,
    patch: { status: "rejected" },
    requestId: "mcp-reject",
  });
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).tasks[0].status,
  ).toBe("archived");
  expect(
    (await call("list_tasks", {})).structuredContent.result.items,
  ).toHaveLength(0);
  expect(
    (await call("list_tasks", { archived: true })).structuredContent.result
      .items,
  ).toHaveLength(1);
  for (const [name, args] of [
    ["enable_collaboration", {}],
    ["create_calendar_link", { label: "Forbidden" }],
    ["approve_plan", { id: "x", revision: 1, requestId: "no-approve" }],
    [
      "set_preferences",
      {
        preferences: (await a.query(api.commands.snapshot, { workspaceId }))
          .members[0].preferences,
        requestId: "no-settings",
      },
    ],
  ] as const)
    expect((await call(name, args)).isError).toBe(true);
  expect(
    (await call("get_task", { id })).structuredContent.result.activity.some(
      (a: any) => a.message === "Same activity service",
    ),
  ).toBe(true);
  const parent = "kazi_parent";
  await t.mutation(internal.tokens.save, {
    subject: alice.subject,
    hash: await sha256(parent),
    label: "Delegator",
    scopes: ["read", "credentials:manage"],
  });
  expect(
    (
      await call(
        "create_credential",
        { label: "Escalation", scopes: ["people:manage"] },
        parent,
      )
    ).isError,
  ).toBe(true);
  const child = await call(
    "create_credential",
    { label: "Reader", scopes: ["read"] },
    parent,
  );
  expect(child.isError).not.toBe(true);
  const credentials = await a.query(api.tokens.list, {});
  expect(
    credentials.find((t) => t.label === "Reader")!.expiresAt,
  ).toBeLessThanOrEqual(
    credentials.find((t) => t.label === "Delegator")!.expiresAt,
  );
  expect(
    (
      await call("list_credentials", {}, child.structuredContent.result.token)
    ).structuredContent.result.every((t: any) => !t.hash),
  ).toBe(true);
});
