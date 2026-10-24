// @vitest-environment edge-runtime
import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { defaults, type Activity } from "../shared/model";
import { sha256 } from "../convex/crypto";
const modules = import.meta.glob("../convex/**/*.ts");
const alice = {
  subject: "files-alice",
  name: "Alice",
  email: "alice@example.test",
  emailVerified: true,
};
const bob = {
  subject: "files-bob",
  name: "Bob",
  email: "bob@example.test",
  emailVerified: true,
};
const capture = {
  type: "create_task",
  title: "Review artifact",
  description: "",
  priority: "medium",
  dependencies: [],
  labels: [],
};
async function setup() {
  vi.stubEnv("CONVEX_SITE_URL", "https://files.example.test");
  vi.stubEnv("APP_ORIGIN", "https://kazi.example.test");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    b = t.withIdentity(bob);
  const workspaceId = (await a.mutation(api.commands.bootstrap, {}))!;
  const taskId = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "create-file-task",
    command: JSON.stringify(capture),
  });
  return { t, a, b, workspaceId, taskId };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("stores private task files, posts attachment-only comments, and downloads through one-use access checks", async () => {
  const { t, a, workspaceId, taskId } = await setup();
  const transfer = await a.action(api.files.prepare, {
    workspaceId,
    taskId,
    kind: "upload",
    name: "brief.txt",
    size: 5,
    contentType: "text/plain",
    placement: "description",
  });
  const response = await t.fetch("/task-files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + transfer.token,
      "Content-Type": "text/plain",
      Origin: "https://kazi.example.test",
    },
    body: "hello",
  });
  expect(response.status).toBe(200);
  const { artifactId } = await response.json();
  const snapshot = await a.query(api.commands.snapshot, { workspaceId });
  expect(snapshot.artifacts?.[0]).toMatchObject({
    id: artifactId,
    name: "brief.txt",
    placement: "description",
    createdBy: alice.subject,
    size: 5,
  });
  expect(snapshot.artifacts?.[0]).not.toHaveProperty("storageId");
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "file-comment",
    command: JSON.stringify({
      type: "comment",
      id: taskId,
      body: "",
      attachmentIds: [artifactId],
    }),
  });
  const history = await a.query(api.files.activity, {
    workspaceId,
    taskId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(history.page.find((e) => e.kind === "comment")).toMatchObject({
    message: "",
    actorId: alice.subject,
    attachmentIds: [artifactId],
  });
  expect(history.page.every((e) => e.at > 0)).toBe(true);
  expect((await t.fetch("/task-files")).status).toBe(401);
  expect(
    (
      await t.fetch("/task-files", {
        method: "POST",
        headers: { Authorization: "Bearer " + transfer.token },
        body: "hello",
      })
    ).status,
  ).toBe(400);
  const download = await a.action(api.files.prepare, {
    workspaceId,
    taskId,
    kind: "download",
    artifactId,
  });
  const file = await t.fetch("/task-files", {
    headers: { Authorization: "Bearer " + download.token },
  });
  expect(file.status).toBe(200);
  expect(await file.text()).toBe("hello");
  expect(file.headers.get("content-disposition")).toContain("brief.txt");
  expect(file.headers.get("cache-control")).toContain("no-store");
  expect(
    (
      await t.fetch("/task-files", {
        headers: { Authorization: "Bearer " + download.token },
      })
    ).status,
  ).toBe(400);
  const detached = await a.action(api.files.prepare, {
    workspaceId,
    taskId,
    kind: "download",
    artifactId,
  });
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "remove-upload",
    command: JSON.stringify({
      type: "remove_artifact",
      id: taskId,
      artifactId,
    }),
  });
  expect(
    (
      await t.fetch("/task-files", {
        headers: { Authorization: "Bearer " + detached.token },
      })
    ).status,
  ).toBe(400);
});

it("allows accessible cross-project dependencies in one team, rejects cycles, and protects private projects", async () => {
  const { t, a, b, workspaceId, taskId } = await setup();
  const projectId = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "dependency-project",
    command: JSON.stringify({
      type: "create_project",
      title: "Release",
      description: "",
      color: "blue",
      private: false,
    }),
  });
  const prerequisite = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "cross-project-prerequisite",
    command: JSON.stringify({
      ...capture,
      projectId,
      title: "Release prerequisite",
    }),
  });
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "cross-project-dependency",
    command: JSON.stringify({
      type: "update_task",
      id: taskId,
      patch: { dependencies: [prerequisite] },
    }),
  });
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).tasks.find(
      (t) => t.id === taskId,
    )?.dependencies,
  ).toEqual([prerequisite]);
  await expect(
    a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "dependency-cycle",
      command: JSON.stringify({
        type: "update_task",
        id: prerequisite,
        patch: { dependencies: [taskId] },
      }),
    }),
  ).rejects.toThrow("circular");
  await t.run(async (ctx) =>
    ctx.db.insert("memberships", {
      workspaceId,
      key: bob.subject,
      subject: bob.subject,
      data: {
        id: bob.subject,
        name: "Bob",
        email: bob.email,
        role: "member",
        color: "blue",
        preferences: defaults,
      },
    }),
  );
  const privateProject = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "private-files-project",
    command: JSON.stringify({
      type: "create_project",
      title: "Private brief",
      description: "",
      color: "blue",
      private: true,
    }),
  });
  const privateTask = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "private-files-task",
    command: JSON.stringify({ ...capture, projectId: privateProject }),
  });
  await expect(
    b.action(api.files.prepare, {
      workspaceId,
      taskId: privateTask,
      kind: "upload",
      name: "private.txt",
      size: 5,
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    b.mutation(api.commands.execute, {
      workspaceId,
      requestId: "private-dependency",
      command: JSON.stringify({ ...capture, dependencies: [privateTask] }),
    }),
  ).rejects.toThrow("unavailable");
});
it("rejects cross-task attachments and cross-team access, and notifies the owner of a teammate's comment", async () => {
  const { t, a, b, workspaceId, taskId } = await setup();
  const linkId = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "add-link",
    command: JSON.stringify({
      type: "attach_link",
      id: taskId,
      name: "Design",
      url: "https://example.com/design",
    }),
  });
  const second = await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "second-task",
    command: JSON.stringify({ ...capture, title: "Another task" }),
  });
  await expect(
    a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "cross-task-file",
      command: JSON.stringify({
        type: "comment",
        id: second,
        body: "",
        attachmentIds: [linkId],
      }),
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    b.action(api.files.prepare, {
      workspaceId,
      taskId,
      kind: "upload",
      name: "test.txt",
      size: 1,
    }),
  ).rejects.toThrow("unavailable");
  await t.run(async (ctx) => {
    await ctx.db.insert("memberships", {
      workspaceId,
      key: bob.subject,
      subject: bob.subject,
      data: {
        id: bob.subject,
        name: "Bob",
        email: bob.email,
        role: "member",
        color: "blue",
        preferences: defaults,
      },
    });
  });
  await b.mutation(api.commands.execute, {
    workspaceId,
    requestId: "team-comment",
    command: JSON.stringify({
      type: "comment",
      id: taskId,
      body: "Ready for your review",
      attachmentIds: [linkId],
    }),
  });
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).notifications.some(
      (n) => n.recipientId === alice.subject && n.title.includes("New comment"),
    ),
  ).toBe(true);
  await expect(
    b.mutation(api.commands.execute, {
      workspaceId,
      requestId: "unauthorized-remove",
      command: JSON.stringify({
        type: "remove_artifact",
        id: taskId,
        artifactId: linkId,
      }),
    }),
  ).rejects.toThrow("Only");
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "remove-link",
    command: JSON.stringify({
      type: "remove_artifact",
      id: taskId,
      artifactId: linkId,
    }),
  });
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).artifacts?.find(
      (a) => a.id === linkId,
    )?.removedAt,
  ).toBeGreaterThan(0);
});
it("validates filenames, file sizes, HTTPS links, and exact uploaded byte counts", async () => {
  const { t, a, workspaceId, taskId } = await setup();
  for (const file of [
    { name: "../secret", size: 1 },
    { name: "huge.zip", size: 20 * 1024 * 1024 + 1 },
    { name: "empty.txt", size: 0 },
  ])
    await expect(
      a.action(api.files.prepare, {
        workspaceId,
        taskId,
        kind: "upload",
        ...file,
      }),
    ).rejects.toThrow();
  await expect(
    a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "unsafe-link",
      command: JSON.stringify({
        type: "attach_link",
        id: taskId,
        name: "Unsafe",
        url: "javascript:alert(1)",
      }),
    }),
  ).rejects.toThrow();
  const ticket = await a.action(api.files.prepare, {
    workspaceId,
    taskId,
    kind: "upload",
    name: "small.txt",
    size: 3,
  });
  expect(
    (
      await t.fetch("/task-files", {
        method: "POST",
        headers: { Authorization: "Bearer " + ticket.token },
        body: "larger",
      })
    ).status,
  ).toBe(400);
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).artifacts,
  ).toEqual([]);
  expect(
    (
      await t.fetch("/task-files", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
  ).toBe(403);
});
it("rechecks project access and expiration when an upload is used", async () => {
  const { t, a, workspaceId, taskId } = await setup();
  const ticket = await a.action(api.files.prepare, {
    workspaceId,
    taskId,
    kind: "upload",
    name: "private.txt",
    size: 5,
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
  expect(
    (
      await t.fetch("/task-files", {
        method: "POST",
        headers: { Authorization: "Bearer " + ticket.token },
        body: "hello",
      })
    ).status,
  ).toBe(400);
  const fresh = await setup();
  const expiring = await fresh.a.action(api.files.prepare, {
    workspaceId: fresh.workspaceId,
    taskId: fresh.taskId,
    kind: "upload",
    name: "expired.txt",
    size: 5,
  });
  vi.useFakeTimers();
  vi.setSystemTime(expiring.expiresAt + 1);
  expect(
    (
      await fresh.t.fetch("/task-files", {
        method: "POST",
        headers: { Authorization: "Bearer " + expiring.token },
        body: "hello",
      })
    ).status,
  ).toBe(400);
});
it("paginates every task activity beyond the workspace's short projection", async () => {
  const { t, a, workspaceId, taskId } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 205; i++)
      await ctx.db.insert("activities", {
        workspaceId,
        key: "comment-" + i,
        data: {
          id: "comment-" + i,
          actorId: alice.subject,
          taskId,
          message: "Comment " + i,
          at: Date.now() + i,
          kind: "comment",
        },
      });
  });
  let cursor: string | null = null,
    count = 0,
    done = false;
  while (!done) {
    const page: { page: Activity[]; continueCursor: string; isDone: boolean } =
      await a.query(api.files.activity, {
        workspaceId,
        taskId,
        paginationOpts: { cursor, numItems: 50 },
      });
    count += page.page.length;
    cursor = page.continueCursor;
    done = page.isDone;
  }
  expect(count).toBe(206);
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).activities,
  ).toHaveLength(200);
});
it("exposes MCP file transfers with task-write scope and rejects a revoked credential at transfer time", async () => {
  const { t, workspaceId, taskId } = await setup();
  const secret = "files-mcp-test",
    hash = await sha256(secret);
  const tokenId = await t.run(async (ctx) =>
    ctx.db.insert("mcpTokens", {
      subject: alice.subject,
      hash,
      label: "File test",
      scopes: ["read"],
      expiresAt: Date.now() + 3600000,
      revoked: false,
    }),
  );
  const call = async () => {
    const res = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "prepare_task_upload",
          arguments: {
            workspaceId,
            taskId,
            name: "mcp.txt",
            size: 5,
            contentType: "text/plain",
          },
        },
      }),
    });
    return res.json();
  };
  expect(JSON.stringify(await call())).toContain("tasks:write");
  await t.run(async (ctx) =>
    ctx.db.patch(tokenId, { scopes: ["read", "tasks:write"] }),
  );
  const result = await call(),
    transfer = result.result.structuredContent.result;
  expect(transfer.url).toContain("/task-files");
  await t.run(async (ctx) => ctx.db.patch(tokenId, { revoked: true }));
  expect(
    (
      await t.fetch("/task-files", {
        method: "POST",
        headers: { Authorization: "Bearer " + transfer.token },
        body: "hello",
      })
    ).status,
  ).toBe(400);
});
