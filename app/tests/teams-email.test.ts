// @vitest-environment edge-runtime
import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";
import { mergeTeamStates } from "../shared/teams";
import { loadState, persist } from "../convex/store";
const modules = import.meta.glob("../convex/**/*.ts");
const alice = {
    subject: "team-alice",
    name: "Alice",
    email: "alice@example.test",
    emailVerified: true,
  },
  bob = {
    subject: "team-bob",
    name: "Bob",
    email: "bob@example.test",
    emailVerified: true,
  };
const capture = {
  type: "create_task",
  title: "Team work",
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
  vi.unstubAllGlobals();
});
it("combines authorized teams for one account while keeping membership, facts, and writes isolated", async () => {
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    b = t.withIdentity(bob);
  const personal = (await a.mutation(api.commands.bootstrap, {}))!,
    team = await a.mutation(api.commands.createTeam, { name: "Release team" });
  const privateBob = (await b.mutation(api.commands.bootstrap, {}))!;
  await a.mutation(api.commands.execute, {
    workspaceId: personal,
    requestId: "personal-capture",
    command: JSON.stringify(capture),
  });
  await a.mutation(api.commands.execute, {
    workspaceId: team,
    requestId: "team-capture",
    command: JSON.stringify({ ...capture, title: "Team project work" }),
  });
  const entries = await a.query(api.commands.allSnapshot, {}),
    merged = mergeTeamStates(entries, alice.subject);
  expect(entries).toHaveLength(2);
  expect(merged.tasks).toHaveLength(2);
  expect(
    merged.resourceTeams?.[
      merged.tasks.find((task) => task.title === "Team project work")!.id
    ],
  ).toBe(team);
  expect(merged.teams?.every((team) => team.role === "owner")).toBe(true);
  await expect(
    a.mutation(api.commands.execute, {
      workspaceId: privateBob,
      requestId: "cross-team-write",
      command: JSON.stringify(capture),
    }),
  ).rejects.toThrow("unavailable");
  const facts = await a.query(api.reports.allLifecycle, {
    teamIds: [personal, team],
    paginationOpts: { cursor: null, numItems: 100 },
  });
  expect(facts.page.length).toBeGreaterThan(0);
  await expect(
    a.query(api.reports.allLifecycle, {
      teamIds: [personal, privateBob],
      paginationOpts: { cursor: null, numItems: 100 },
    }),
  ).rejects.toThrow("unavailable");
  const history = await a.query(api.reports.lifecycle, {
    workspaceId: team,
    entityId: merged.tasks.find((task) => task.title === "Team project work")!
      .id,
    paginationOpts: { cursor: null, numItems: 100 },
  });
  expect(history.page).toHaveLength(1);
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", personal).eq("key", alice.subject),
      )
      .unique();
    await ctx.db.delete(member!._id);
  });
  expect(await a.mutation(api.commands.bootstrap, {})).toBe(team);
});
it("checks native reservations across teams before planning and rejects a racing conflicting approval", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    one = (await a.mutation(api.commands.bootstrap, {}))!,
    two = await a.mutation(api.commands.createTeam, { name: "Other team" });
  for (const workspaceId of [one, two])
    await a.mutation(api.commands.execute, {
      workspaceId,
      requestId: "capture",
      command: JSON.stringify({ ...capture, status: "todo" }),
    });
  const proposals = await Promise.all(
    [one, two].map((workspaceId) =>
      a.action(api.commands.plan, {
        workspaceId,
        requestId: "preview",
        command: JSON.stringify({
          type: "propose",
          startDate: "2026-10-26",
          days: 5,
        }),
      }),
    ),
  );
  await a.action(api.commands.plan, {
    workspaceId: one,
    requestId: "approve",
    command: JSON.stringify({ type: "approve", id: proposals[0], revision: 1 }),
  });
  await expect(
    a.action(api.commands.plan, {
      workspaceId: two,
      requestId: "approve",
      command: JSON.stringify({
        type: "approve",
        id: proposals[1],
        revision: 1,
      }),
    }),
  ).rejects.toThrow("conflicts");
  const next = await a.action(api.commands.plan, {
    workspaceId: two,
    requestId: "preview-later",
    command: JSON.stringify({
      type: "propose",
      startDate: "2026-10-26",
      days: 5,
    }),
  });
  const s1 = await a.query(api.commands.snapshot, { workspaceId: one }),
    s2 = await a.query(api.commands.snapshot, { workspaceId: two });
  const first = s1.proposals[0].alternatives[0].sessions[0],
    second = s2.proposals.find((p) => p.id === next)!.alternatives[0]
      .sessions[0];
  expect(second.start).toBeGreaterThanOrEqual(first.end);
});
it("queues optional invitation email once, uses provider idempotency, and never sends after revocation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  vi.stubEnv(
    "INVITATION_SIGNING_KEY",
    "test-signing-key-longer-than-thirty-two-characters",
  );
  vi.stubEnv("RESEND_API_KEY", "test-only-provider-key");
  vi.stubEnv("INVITE_EMAIL_FROM", "Kazi <invites@example.test>");
  vi.stubEnv("APP_ORIGIN", "https://kazi.example.test");
  const t = convexTest(schema, modules),
    a = t.withIdentity(alice),
    workspaceId = await a.mutation(api.commands.createTeam, {
      name: "Email team",
    });
  const args = {
    workspaceId,
    requestId: "email-invitation",
    command: JSON.stringify({
      type: "invite",
      email: bob.email,
      role: "member",
      projectIds: [],
    }),
  };
  const first = await a.action(api.commands.invite, args);
  expect(await a.action(api.commands.invite, args)).toEqual(first);
  const rows = await t.run((ctx) => ctx.db.query("invitationOutbox").collect());
  expect(rows).toHaveLength(1);
  const sending = vi.fn(
    async (_input: string | URL | Request, _options?: RequestInit) =>
      new Response(JSON.stringify({ id: "provider-id" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", sending);
  await t.action(internal.commands.sendInvitationEmail, { id: rows[0]._id });
  await t.action(internal.commands.sendInvitationEmail, { id: rows[0]._id });
  expect(sending).toHaveBeenCalledTimes(1);
  const options = sending.mock.calls[0]?.[1] as RequestInit;
  expect((options.headers as Record<string, string>)["Idempotency-Key"]).toBe(
    "kazi-invite/" + rows[0].invitationId,
  );
  expect(JSON.parse(String(options.body)).text).toContain(
    "Create an account or sign in",
  );
  expect(
    (await a.query(api.commands.snapshot, { workspaceId })).invitations[0]
      .deliveryStatus,
  ).toBe("sent");
  await a.action(api.commands.invite, {
    ...args,
    requestId: "revoked-before-send",
    command: JSON.stringify({
      type: "invite",
      email: "another@example.test",
      role: "member",
      projectIds: [],
    }),
  });
  const second = (
    await t.run((ctx) => ctx.db.query("invitationOutbox").collect())
  )[1];
  await a.mutation(api.commands.execute, {
    workspaceId,
    requestId: "revoke-invite",
    command: JSON.stringify({
      type: "revoke_invitation",
      id: second.invitationId,
    }),
  });
  await t.action(internal.commands.sendInvitationEmail, { id: second._id });
  expect(sending).toHaveBeenCalledTimes(1);
});
