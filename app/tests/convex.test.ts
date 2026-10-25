// @vitest-environment edge-runtime
import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { fixtureState as seedState, DEMO_USER } from "../shared/fixtures";
import { loadState, persist } from "../convex/store";
import type { ReportEvent } from "../shared/model";
import type { Id } from "../convex/_generated/dataModel";
import { sha256 } from "../convex/crypto";
const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
const alice = {
  subject: "user_alice",
  name: "Alice Example",
  email: "alice@example.test",
  emailVerified: true,
};
const bob = {
  subject: "user_bob",
  name: "Bob Example",
  email: "bob@example.test",
  emailVerified: true,
};
const command = {
  type: "create_task",
  title: "Persisted task",
  description: "",
  priority: "medium",
  estimatedMinutes: 60,
  dependencies: [],
  labels: [],
};
afterEach(() => vi.useRealTimers());
describe("Convex transactional services", () => {
  it("refreshes searchable identity only from issuer claims across team memberships", async () => {
    const t = make(),
      a = t.withIdentity(alice);
    const personal = (await a.mutation(api.commands.bootstrap, {}))!;
    const team = await a.mutation(api.commands.createTeam, { name: "Design" });
    const renamed = t.withIdentity({
      ...alice,
      name: "Alice Updated",
      preferredUsername: "alice.design",
      email: "new@example.test",
    });
    await renamed.mutation(api.commands.bootstrap, {});
    for (const workspaceId of [personal, team]) {
      const member = (
        await renamed.query(api.commands.snapshot, { workspaceId })
      ).members.find((m) => m.id === alice.subject)!;
      expect([member.name, member.username, member.email]).toEqual([
        "Alice Updated",
        "alice.design",
        "new@example.test",
      ]);
    }
    // Missing optional claims must not erase the known identity.
    await t
      .withIdentity({ subject: alice.subject })
      .mutation(api.commands.bootstrap, {});
    expect(
      (await a.query(api.commands.snapshot, { workspaceId: personal }))
        .members[0].username,
    ).toBe("alice.design");
  });
  it("persists mentions and notifications once across retried commands", async () => {
    const t = make(),
      a = t.withIdentity({ ...alice, subject: DEMO_USER });
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await t.run(async (ctx) => {
      const before = await loadState(ctx, workspaceId),
        after = seedState(Date.now());
      after.workspace = before.workspace;
      after.projects[0].id = before.workspace.inboxId;
      after.tasks.forEach((task) => {
        if (task.projectId === "inbox")
          task.projectId = before.workspace.inboxId;
      });
      await persist(ctx, workspaceId, before, after);
    });
    const args = {
      workspaceId,
      requestId: "comment-mention-retry",
      command: JSON.stringify({
        type: "comment",
        id: "t1",
        body: "Ask @amira.chen",
        mentions: [{ memberId: "demo-amira", start: 4, end: 15 }],
      }),
    };
    const activity = await a.mutation(api.commands.execute, args);
    expect(await a.mutation(api.commands.execute, args)).toBe(activity);
    const snapshot = await a.query(api.commands.snapshot, { workspaceId });
    expect(
      snapshot.activities.find((event) => event.id === activity)?.mentions?.[0]
        .memberId,
    ).toBe("demo-amira");
    const recipient = t.withIdentity({ subject: "demo-amira" });
    const notices = (
      await recipient.query(api.commands.snapshot, { workspaceId })
    ).notifications.filter((n) => n.key === "comment:" + activity);
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toContain("mentioned you");
    const token = "kazi_people_test_token";
    await t.mutation(internal.tokens.save, {
      subject: DEMO_USER,
      hash: await sha256(token),
      label: "People tests",
      scopes: ["read", "tasks:write"],
    });
    const call = async (name: string, args: Record<string, unknown>) => {
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
    };
    const people = await call("list_members", {
      search: "amira@example",
      projectId: "website",
    });
    expect(people.items.map((m: { id: string }) => m.id)).toEqual([
      "demo-amira",
    ]);
    expect(people.items[0].username).toBe("amira.chen");
    expect(
      (await call("list_members", { search: "amira", projectId: "learning" }))
        .items,
    ).toEqual([]);
    const mcpArgs = {
      id: "t1",
      body: "Ask @daniel",
      mentions: [{ memberId: "demo-daniel", start: 4, end: 11 }],
      requestId: "mcp-mention-retry",
    };
    const mcpActivity = await call("add_comment", mcpArgs);
    expect(await call("add_comment", mcpArgs)).toBe(mcpActivity);
    const mcpSnapshot = await a.query(api.commands.snapshot, { workspaceId });
    expect(
      mcpSnapshot.activities.find((event) => event.id === mcpActivity)
        ?.mentions?.[0].memberId,
    ).toBe("demo-daniel");
    const personal = (await t
      .withIdentity(bob)
      .mutation(api.commands.bootstrap, {}))!;
    await expect(
      t.withIdentity(bob).mutation(api.commands.execute, {
        ...args,
        workspaceId: personal,
        requestId: "foreign-mention",
      }),
    ).rejects.toThrow("unavailable");
  });
  it("persists personal favorites across subscriptions and retries and rejects foreign projects", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      b = t.withIdentity(bob);
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    const projectId = await a.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify({
        type: "create_project",
        title: "Favorite project",
        description: "",
        color: "blue",
        private: false,
      }),
      requestId: "favorite-project-create",
    });
    const args = {
      workspaceId,
      command: JSON.stringify({
        type: "favorite_project",
        projectId,
        favorite: true,
      }),
      requestId: "favorite-save",
    };
    await a.mutation(api.commands.execute, args);
    await a.mutation(api.commands.execute, args);
    const snapshot = await a.query(api.commands.snapshot, { workspaceId });
    expect(snapshot.members[0].favoriteProjectIds).toEqual([projectId]);
    expect(snapshot.activities).toHaveLength(1);
    const foreignWorkspace = (await b.mutation(api.commands.bootstrap, {}))!;
    await expect(
      b.mutation(api.commands.execute, {
        ...args,
        workspaceId: foreignWorkspace,
        requestId: "foreign-favorite",
      }),
    ).rejects.toThrow("unavailable");
    await a.mutation(api.commands.execute, {
      ...args,
      command: JSON.stringify({
        type: "favorite_project",
        projectId,
        favorite: false,
      }),
      requestId: "unfavorite-save",
    });
    expect(
      (await a.query(api.commands.snapshot, { workspaceId })).members[0]
        .favoriteProjectIds,
    ).toEqual([]);
  });
  it("bootstrap persists one personal Inbox and isolates accounts", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      b = t.withIdentity(bob);
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    const second = await a.mutation(api.commands.bootstrap, {});
    expect(second).toBe(workspaceId);
    const snapshot = await a.query(api.commands.snapshot, { workspaceId });
    expect(snapshot.workspace.kind).toBe("personal");
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.members[0].id).toBe(alice.subject);
    await expect(
      b.query(api.commands.snapshot, { workspaceId }),
    ).rejects.toThrow("unavailable");
  });
  it("persists capture and deduplicates client retries", async () => {
    const t = make(),
      a = t.withIdentity(alice);
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    const args = {
      workspaceId,
      command: JSON.stringify(command),
      requestId: "capture-retry",
    };
    const first = await a.mutation(api.commands.execute, args),
      second = await a.mutation(api.commands.execute, args);
    expect(second).toBe(first);
    const s = await a.query(api.commands.snapshot, { workspaceId });
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0].projectId).toBe(s.workspace.inboxId);
    expect(s.activities).toHaveLength(1);
  });
  it("rejects a cross-workspace project reference", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      b = t.withIdentity(bob);
    const wa = (await a.mutation(api.commands.bootstrap, {}))!,
      wb = (await b.mutation(api.commands.bootstrap, {}))!,
      sb = await b.query(api.commands.snapshot, { workspaceId: wb });
    await expect(
      a.mutation(api.commands.execute, {
        workspaceId: wa,
        command: JSON.stringify({
          ...command,
          projectId: sb.workspace.inboxId,
        }),
        requestId: "cross-project",
      }),
    ).rejects.toThrow("unavailable");
  });
  it("public mutation cannot inject verified approval or planning", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await expect(
      a.mutation(api.commands.execute, {
        workspaceId,
        requestId: "fake-confirmed",
        command: JSON.stringify({
          type: "approve",
          id: "guessed",
          revision: 1,
          confirmed: true,
        }),
      }),
    ).rejects.toThrow("dedicated");
  });
  it("rechecks current membership in internal jobs", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await expect(
      t.query(internal.commands.stateForActor, {
        workspaceId,
        subject: bob.subject,
      }),
    ).rejects.toThrow("unavailable");
  });
  it("concurrent approvals persist one version and one intent per session", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    let proposalId = "";
    await t.run(async (ctx) => {
      const before = await loadState(ctx, workspaceId),
        fixture = seedState(Date.now());
      const replace = (x: unknown): unknown =>
        x === DEMO_USER
          ? alice.subject
          : Array.isArray(x)
            ? x.map(replace)
            : x && typeof x === "object"
              ? Object.fromEntries(
                  Object.entries(x).map(([k, v]) => [k, replace(v)]),
                )
              : x;
      const after = replace(fixture) as typeof fixture;
      after.workspace = before.workspace;
      after.projects[0].id = before.workspace.inboxId;
      after.tasks.forEach((t) => {
        if (t.projectId === "inbox") t.projectId = before.workspace.inboxId;
      });
      proposalId = after.proposals[0].id;
      await persist(ctx, workspaceId, before, after);
    });
    const args = {
      workspaceId,
      subject: alice.subject,
      command: JSON.stringify({ type: "approve", id: proposalId, revision: 1 }),
    };
    const results = await Promise.all([
      t.mutation(internal.commands.verified, {
        ...args,
        requestId: "approval-one",
      }),
      t.mutation(internal.commands.verified, {
        ...args,
        requestId: "approval-two",
      }),
    ]);
    expect(results[0]).toBe(results[1]);
    const s = await a.query(api.commands.snapshot, { workspaceId });
    expect(s.versions).toHaveLength(2);
    const writes = await t.run((ctx) =>
      ctx.db
        .query("outbox")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    );
    expect(writes.length).toBe(s.versions[1].sessions.length);
    expect(new Set(writes.map((w) => w.eventId)).size).toBe(writes.length);
  });
  it("reminder jobs persist deduplicated notifications with the browser absent", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "overdue-task",
      command: JSON.stringify({ ...command, deadline: "2026-01-01" }),
    });
    await t.run((ctx) => ctx.db.patch(workspaceId, { nextEvaluationAt: 0 }));
    await t.mutation(internal.jobs.tick, {});
    const first = await a.query(api.commands.snapshot, { workspaceId });
    await t.run((ctx) => ctx.db.patch(workspaceId, { nextEvaluationAt: 0 }));
    await t.mutation(internal.jobs.tick, {});
    const second = await a.query(api.commands.snapshot, { workspaceId });
    expect(first.notifications.some((n) => n.kind === "overdue")).toBe(true);
    expect(first.notifications.length).toBe(second.notifications.length);
  });
  it("invitations accept only the intended verified email and revoke on removal", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      b = t.withIdentity(bob),
      workspaceId = await a.mutation(api.commands.createTeam, {
        name: "Test team",
      });
    const token = "a".repeat(64);
    const { sha256 } = await import("../convex/crypto");
    await t.mutation(internal.commands.verified, {
      workspaceId,
      subject: alice.subject,
      requestId: "invite-bob",
      command: JSON.stringify({
        type: "invite",
        email: bob.email,
        role: "member",
        projectIds: [],
      }),
      invitationHash: await sha256(token),
    });
    await expect(
      a.mutation(api.commands.acceptInvite, { token }),
    ).rejects.toThrow("intended");
    expect(await b.mutation(api.commands.acceptInvite, { token })).toBe(
      workspaceId,
    );
    await expect(
      b.mutation(api.commands.acceptInvite, { token }),
    ).rejects.toThrow("already");
    await a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "remove-bob",
      command: JSON.stringify({ type: "remove_member", id: bob.subject }),
    });
    await expect(
      b.query(api.commands.snapshot, { workspaceId }),
    ).rejects.toThrow("unavailable");
  });
});

describe("MCP connection visibility", () => {
  it("lists only the caller's credentials and usage, without hashes", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      b = t.withIdentity(bob);
    await t.mutation(internal.tokens.save, {
      subject: alice.subject,
      hash: "hash-a",
      label: "Codex laptop",
      scopes: ["read"],
    });
    await t.mutation(internal.tokens.save, {
      subject: bob.subject,
      hash: "hash-b",
      label: "Private Bob client",
      scopes: ["read"],
    });
    const principal = (await t.query(internal.tokens.authenticate, {
      hash: "hash-a",
    }))!;
    await t.mutation(internal.tokens.seen, {
      id: principal.tokenId,
      clientName: "codex",
      clientVersion: "1.2",
      tool: "list_tasks",
      outcome: "success",
    });
    const tokens = await a.query(api.tokens.list, {});
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      label: "Codex laptop",
      clientName: "codex",
      clientVersion: "1.2",
      lastTool: "list_tasks",
      toolCalls: 1,
    });
    expect(tokens[0]).not.toHaveProperty("hash");
    expect(await b.query(api.tokens.activity, {})).toEqual([]);
    expect((await a.query(api.tokens.activity, {}))[0]).toMatchObject({
      label: "Codex laptop",
      tool: "list_tasks",
      outcome: "success",
    });
    await expect(
      b.mutation(api.tokens.revoke, { id: principal.tokenId }),
    ).rejects.toThrow("unavailable");
    await expect(t.query(api.tokens.list, {})).rejects.toThrow();
  });
  it("does not invent agent usage on mint, or record use after expiry/revocation", async () => {
    const t = make(),
      a = t.withIdentity(alice);
    await t.mutation(internal.tokens.save, {
      subject: alice.subject,
      hash: "unused",
      label: "Unused",
      scopes: ["read"],
    });
    let tokens = await a.query(api.tokens.list, {});
    expect(tokens[0].lastUsedAt).toBeUndefined();
    expect(await a.query(api.tokens.activity, {})).toEqual([]);
    const id = tokens[0].id;
    await a.mutation(api.tokens.revoke, { id });
    await t.mutation(internal.tokens.seen, {
      id,
      tool: "get_task",
      outcome: "error",
    });
    expect(
      await t.query(internal.tokens.authenticate, { hash: "unused" }),
    ).toBeNull();
    expect(await a.query(api.tokens.activity, {})).toEqual([]);
    await t.run((ctx) =>
      ctx.db.patch(id, { revoked: false, expiresAt: Date.now() - 1 }),
    );
    await t.mutation(internal.tokens.seen, { id, clientName: "too late" });
    tokens = await a.query(api.tokens.list, {});
    expect(tokens[0].lastUsedAt).toBeUndefined();
    expect(
      await t.query(internal.tokens.authenticate, { hash: "unused" }),
    ).toBeNull();
  });
});

it("authenticated HTTP MCP requests populate the real client list and tool history", async () => {
  const t = make(),
    a = t.withIdentity(alice);
  const { sha256 } = await import("../convex/crypto");
  await a.mutation(api.commands.bootstrap, {});
  await t.mutation(internal.tokens.save, {
    subject: alice.subject,
    hash: await sha256("kazi_http_test"),
    label: "HTTP client",
    scopes: ["read"],
  });
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: "Bearer kazi_http_test",
  };
  const initialized = await t.fetch("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "verified-protocol-client", version: "3" },
      },
    }),
  });
  expect(initialized.status).toBe(200);
  expect((await initialized.json()).result.serverInfo.name).toBe("kazi");
  let tokens = await a.query(api.tokens.list, {});
  expect(tokens[0]).toMatchObject({
    clientName: "verified-protocol-client",
    clientVersion: "3",
  });
  expect(tokens[0].lastUsedAt).toBeGreaterThan(0);
  const called = await t.fetch("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_workspaces", arguments: {} },
    }),
  });
  expect((await called.json()).result.isError).not.toBe(true);
  tokens = await a.query(api.tokens.list, {});
  expect(tokens[0].lastTool).toBe("list_workspaces");
  expect((await a.query(api.tokens.activity, {}))[0].outcome).toBe("success");
  await a.mutation(api.tokens.revoke, { id: tokens[0].id });
  expect(
    (await t.fetch("/mcp", { method: "POST", headers, body: "{}" })).status,
  ).toBe(401);
});

it("keeps active credentials visible after a long revoked-credential history", async () => {
  const t = make(),
    a = t.withIdentity(alice);
  const activeId = await t.run(async (ctx) => {
    const base = {
      subject: alice.subject,
      scopes: ["read"],
      expiresAt: Date.now() + 86400000,
    };
    const id = await ctx.db.insert("mcpTokens", {
      ...base,
      hash: "active-old",
      label: "Still active",
      revoked: false,
    });
    for (let n = 0; n < 55; n++)
      await ctx.db.insert("mcpTokens", {
        ...base,
        hash: "revoked-" + n,
        label: "Old client " + n,
        revoked: true,
      });
    return id;
  });
  const tokens = await a.query(api.tokens.list, {});
  expect(tokens.some((t) => t.id === activeId)).toBe(true);
  await a.mutation(api.tokens.revoke, { id: activeId });
  expect(
    await t.query(internal.tokens.authenticate, { hash: "active-old" }),
  ).toBeNull();
});

it("enables collaboration in place, preserves projects, and checks owner authority", async () => {
  const t = make(),
    a = t.withIdentity(alice),
    b = t.withIdentity(bob);
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  await a.mutation(api.commands.execute, {
    workspaceId,
    command: JSON.stringify(command),
    requestId: "before-collaboration",
  });
  const before = await a.query(api.commands.snapshot, { workspaceId });
  await expect(
    b.mutation(api.commands.enableCollaboration, { workspaceId }),
  ).rejects.toThrow();
  await a.mutation(api.commands.enableCollaboration, { workspaceId });
  const after = await a.query(api.commands.snapshot, { workspaceId });
  expect(after.workspace.id).toBe(before.workspace.id);
  expect(after.workspace.kind).toBe("team");
  expect(after.projects).toEqual(before.projects);
  expect(after.tasks).toEqual(before.tasks);
  expect((await a.query(api.commands.workspaces, {})).length).toBe(1);
  expect(
    after.activities.some((a) => a.message === "Enabled collaboration in Kazi"),
  ).toBe(true);
});

describe("reporting history", () => {
  it("persists immutable facts, deduplicates command retries, and paginates beyond the activity limit", async () => {
    const t = make(),
      a = t.withIdentity(alice);
    const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    const taskId = await a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "report-task",
      command: JSON.stringify(command),
    });
    const progress = {
      workspaceId,
      requestId: "report-progress",
      command: JSON.stringify({
        type: "progress",
        id: taskId,
        remainingMinutes: 30,
        loggedMinutes: 15,
        note: "Progress",
      }),
    };
    await a.mutation(api.commands.execute, progress);
    await a.mutation(api.commands.execute, progress);
    await t.run(async (ctx) => {
      const existing = await ctx.db.query("reportEvents").collect();
      expect(existing).toHaveLength(1);
      const event = existing[0].data;
      for (let i = 0; i < 205; i++)
        await ctx.db.insert("reportEvents", {
          workspaceId,
          key: `history-${i}`,
          at: event.at,
          data: { ...event, id: `history-${i}` },
        });
      const before = await loadState(ctx, workspaceId),
        after = structuredClone(before);
      after.reportEvents = [{ ...event, minutes: 999 }];
      await expect(persist(ctx, workspaceId, before, after)).rejects.toThrow(
        "cannot be rewritten",
      );
    });
    let cursor: string | null = null,
      total = 0,
      done = false;
    while (!done) {
      const page: {
        page: ReportEvent[];
        continueCursor: string;
        isDone: boolean;
      } = await a.query(api.reports.events, {
        workspaceId,
        from: Date.now() - 86400000,
        to: Date.now() + 86400000,
        paginationOpts: { cursor, numItems: 100 },
      });
      total += page.page.length;
      cursor = page.continueCursor;
      done = page.isDone;
    }
    expect(total).toBe(206);
    await expect(
      t.withIdentity(bob).query(api.reports.events, {
        workspaceId,
        from: 0,
        to: 86400000,
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).rejects.toThrow("unavailable");
  });
  it("checks both historical project and present task visibility on every page", async () => {
    const t = make(),
      a = t.withIdentity(alice),
      workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
    await t.run(async (ctx) => {
      const before = await loadState(ctx, workspaceId),
        after = seedState(Date.now());
      after.workspace = before.workspace;
      after.projects[0].id = before.workspace.inboxId;
      after.tasks.forEach((task) => {
        if (task.projectId === "inbox")
          task.projectId = before.workspace.inboxId;
      });
      await persist(ctx, workspaceId, before, after);
    });
    const result = await t
      .withIdentity({ subject: "demo-amira" })
      .query(api.reports.events, {
        workspaceId,
        from: Date.now() - 30 * 86400000,
        to: Date.now() + 86400000,
        paginationOpts: { cursor: null, numItems: 100 },
      });
    expect(result.page).toHaveLength(7);
    expect(result.page.some((e) => e.projectId === "learning")).toBe(false);
    await t.run(async (ctx) => {
      const task = await ctx.db
        .query("tasks")
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", workspaceId).eq("key", "t9"),
        )
        .unique();
      await ctx.db.patch(task!._id, {
        data: { ...task!.data, projectId: "learning" },
      });
    });
    const second = await t
      .withIdentity({ subject: "demo-amira" })
      .query(api.reports.events, {
        workspaceId,
        from: Date.now() - 30 * 86400000,
        to: Date.now() + 86400000,
        paginationOpts: { cursor: null, numItems: 100 },
      });
    expect(second.page.some((e) => e.taskId === "t9")).toBe(false);
  });
});
