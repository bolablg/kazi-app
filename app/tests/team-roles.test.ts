// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { loadState, persist } from "../convex/store";
import { sha256 } from "../convex/crypto";
const modules = import.meta.glob("../convex/**/*.ts");
const alice = {
  subject: "role-owner",
  name: "Alice",
  email: "alice@example.test",
  emailVerified: true,
};
const bob = {
  subject: "role-member",
  name: "Bob",
  email: "bob@example.test",
  emailVerified: true,
};
afterEach(() => vi.unstubAllEnvs());

it("the creator owns the team; owner role changes persist, are audited once, and enforce team boundaries", async () => {
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    b = t.withIdentity(bob);
  const personal = (await a.mutation(api.commands.bootstrap, {}))!;
  const workspaceId = await a.mutation(api.commands.createTeam, {
    name: "Design team",
  });
  await t.run(async (ctx) => {
    const before = await loadState(ctx, workspaceId),
      after = structuredClone(before);
    after.members.push({
      ...after.members[0],
      id: bob.subject,
      name: bob.name,
      email: bob.email,
      role: "member",
    });
    await persist(ctx, workspaceId, before, after);
  });
  const initial = await a.query(api.commands.snapshot, { workspaceId });
  expect(initial.workspace.ownerId).toBe(alice.subject);
  expect(initial.members.find((m) => m.id === alice.subject)?.role).toBe(
    "owner",
  );
  const args = {
    workspaceId,
    requestId: "promote-manager",
    command: JSON.stringify({
      type: "set_member_role",
      id: bob.subject,
      role: "admin",
    }),
  };
  await a.mutation(api.commands.execute, args);
  await a.mutation(api.commands.execute, args);
  const promoted = await b.query(api.commands.snapshot, { workspaceId });
  expect(promoted.members.find((m) => m.id === bob.subject)?.role).toBe(
    "admin",
  );
  const changes = promoted.activities.filter((e) =>
    e.message.includes("role from Member to Manager"),
  );
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    actorId: alice.subject,
    at: expect.any(Number),
  });
  await expect(
    b.mutation(api.commands.execute, {
      ...args,
      requestId: "manager-self-change",
      command: JSON.stringify({
        type: "set_member_role",
        id: bob.subject,
        role: "member",
      }),
    }),
  ).rejects.toThrow("Only the team owner");
  await expect(
    a.mutation(api.commands.execute, {
      ...args,
      requestId: "demote-owner",
      command: JSON.stringify({
        type: "set_member_role",
        id: alice.subject,
        role: "member",
      }),
    }),
  ).rejects.toThrow("owner's role");
  // A personal space is never a team role-management surface.
  if (personal !== workspaceId)
    await expect(
      a.mutation(api.commands.execute, {
        ...args,
        workspaceId: personal,
        requestId: "other-space",
      }),
    ).rejects.toThrow("Only the team owner");
  await expect(
    a.mutation(api.commands.execute, {
      ...args,
      requestId: "outsider",
      command: JSON.stringify({
        type: "set_member_role",
        id: "unrelated-account",
        role: "admin",
      }),
    }),
  ).rejects.toThrow();
  vi.stubEnv(
    "INVITATION_SIGNING_KEY",
    "test-signing-key-longer-than-thirty-two-characters",
  );
  vi.stubEnv("APP_ORIGIN", "https://kazi.example.test");
  await expect(
    b.action(api.commands.invite, {
      workspaceId,
      requestId: "manager-grants-manager",
      command: JSON.stringify({
        type: "invite",
        email: "new@example.test",
        role: "admin",
        projectIds: [],
      }),
    }),
  ).rejects.toThrow("Only the team owner");
  await b.action(api.commands.invite, {
    workspaceId,
    requestId: "manager-invites-member",
    command: JSON.stringify({
      type: "invite",
      email: "new@example.test",
      role: "member",
      projectIds: [],
    }),
  });
  await a.mutation(api.commands.execute, {
    ...args,
    requestId: "demote-manager",
    command: JSON.stringify({
      type: "set_member_role",
      id: bob.subject,
      role: "member",
    }),
  });
  await expect(
    b.action(api.commands.invite, {
      workspaceId,
      requestId: "member-cannot-invite",
      command: JSON.stringify({
        type: "invite",
        email: "other@example.test",
        role: "member",
        projectIds: [],
      }),
    }),
  ).rejects.toThrow("invite people");
});

it("MCP uses the same role command with explicit people permission and owner authorization", async () => {
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice);
  const workspaceId = await a.mutation(api.commands.createTeam, {
    name: "MCP team",
  });
  await t.run(async (ctx) => {
    const before = await loadState(ctx, workspaceId),
      after = structuredClone(before);
    after.members.push({
      ...after.members[0],
      id: bob.subject,
      name: bob.name,
      email: bob.email,
      role: "member",
    });
    await persist(ctx, workspaceId, before, after);
  });
  for (const [token, subject, scopes] of [
    ["roles-read", alice.subject, ["read"]],
    ["roles-owner", alice.subject, ["people:manage"]],
    ["roles-member", bob.subject, ["people:manage"]],
  ] as const)
    await t.mutation(internal.tokens.save, {
      subject,
      hash: await sha256(token),
      label: "Role test",
      scopes: [...scopes],
    });
  async function call(token: string) {
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
          name: "set_member_role",
          arguments: {
            workspaceId,
            id: bob.subject,
            role: "admin",
            requestId: token,
          },
        },
      }),
    });
    return (await response.json()).result;
  }
  expect((await call("roles-read")).isError).toBe(true);
  expect((await call("roles-member")).isError).toBe(true);
  expect((await call("roles-owner")).isError).not.toBe(true);
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).members.find(
      (m) => m.id === bob.subject,
    )?.role,
  ).toBe("admin");
});
