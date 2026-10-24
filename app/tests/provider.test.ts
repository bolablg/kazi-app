// @vitest-environment edge-runtime
import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { loadState, persist } from "../convex/store";
import { fixtureState as seedState, DEMO_USER } from "../shared/fixtures";
import { encrypt } from "../convex/crypto";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("changing the destination cannot redirect an accepted write into another calendar", async () => {
  const { t, workspaceId, outbox } = await fixture();
  expect(outbox.calendarId).toBe("fixture");
  await t.run(async (ctx) => {
    const cal = await ctx.db
      .query("calendarStatuses")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", DEMO_USER),
      )
      .unique();
    await ctx.db.patch(cal!._id, {
      data: { ...cal!.data, destinationId: "another-owned-calendar" },
    });
  });
  await expect(
    t.query(internal.jobs.authorizeWrite, { outboxId: outbox._id }),
  ).rejects.toThrow("Calendar selection changed");
  expect((await t.run((ctx) => ctx.db.get(outbox._id)))?.calendarId).toBe(
    "fixture",
  );
});
async function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", btoa("x".repeat(32)));
  const t = convexTest(schema, modules),
    user = t.withIdentity({
      subject: DEMO_USER,
      name: "Demo",
      email: "demo@example.test",
      emailVerified: true,
    }),
    workspaceId = (await user.mutation(api.commands.bootstrap, {}))!;
  let proposalId = "";
  await t.run(async (ctx) => {
    const before = await loadState(ctx, workspaceId),
      s = seedState();
    s.workspace = before.workspace;
    s.projects[0].id = before.workspace.inboxId;
    s.tasks.forEach((t) => {
      if (t.projectId === "inbox") t.projectId = before.workspace.inboxId;
    });
    s.calendars[0].status = "connected";
    proposalId = s.proposals[0].id;
    await persist(ctx, workspaceId, before, s);
    const encrypted = await encrypt("fixture-refresh-token");
    await ctx.db.insert("calendarSecrets", {
      subject: DEMO_USER,
      ...encrypted,
      updatedAt: Date.now(),
    });
  });
  await t.mutation(internal.commands.verified, {
    workspaceId,
    subject: DEMO_USER,
    command: JSON.stringify({ type: "approve", id: proposalId, revision: 1 }),
    requestId: "fixture-approval",
  });
  const outbox = await t.run((ctx) =>
    ctx.db
      .query("outbox")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first(),
  );
  return { t, user, workspaceId, outbox: outbox!, proposalId };
}
it("A13 uncertain POST outcomes reconcile a stable event ID before retrying", async () => {
  const { t, user, workspaceId, outbox } = await fixture();
  let created = false,
    posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("oauth2.googleapis.com/token"))
        return Response.json({ access_token: "fixture-access" });
      if (String(url).includes("/freeBusy"))
        return Response.json({ calendars: { fixture: { busy: [] } } });
      if (init?.method === "POST") {
        posts++;
        created = true;
        throw new TypeError(
          "Simulated timeout after Google created the event.",
        );
      }
      return created
        ? Response.json({
            id: outbox.eventId,
            extendedProperties: { private: { kaziSession: outbox.sessionId } },
          })
        : new Response("", { status: 404 });
    }),
  );
  await t.action(internal.jobs.write, { outboxId: outbox._id });
  const uncertain = await t.run((ctx) => ctx.db.get(outbox._id));
  expect(uncertain?.status).toBe("pending");
  expect(uncertain?.attempts).toBe(1);
  await t.action(internal.jobs.write, { outboxId: outbox._id });
  const reconciled = await t.run((ctx) => ctx.db.get(outbox._id));
  expect(reconciled?.status).toBe("done");
  expect(posts).toBe(1);
  expect(
    (await user.query(api.commands.snapshot, { workspaceId })).versions,
  ).toHaveLength(2);
});
it("external edits change only the current receipt, preserving accepted snapshots", async () => {
  const { t, user, workspaceId, outbox } = await fixture();
  await t.mutation(internal.jobs.receipt, {
    outboxId: outbox._id,
    success: true,
  });
  const before = await user.query(api.commands.snapshot, { workspaceId }),
    session = before.proposals[0].alternatives[0].sessions.find(
      (s) => s.id === outbox.sessionId,
    )!;
  await t.mutation(internal.calendar.reconcileEvent, {
    workspaceId,
    subject: DEMO_USER,
    eventId: outbox.eventId,
    canceled: false,
    start: session.start + 3600000,
    end: session.end + 3600000,
  });
  const after = await user.query(api.commands.snapshot, { workspaceId });
  expect(after.versions).toEqual(before.versions);
  expect(
    after.proposals[0].alternatives[0].sessions.find((s) => s.id === session.id)
      ?.start,
  ).toBe(session.start + 3600000);
  expect(
    after.notifications.some((n) => n.title.includes("changed in Google")),
  ).toBe(true);
});
it("A16 releasing a future reservation is explicit and keeps historical sessions", async () => {
  const { t, user, workspaceId, outbox } = await fixture();
  await t.mutation(internal.jobs.receipt, {
    outboxId: outbox._id,
    success: true,
  });
  const before = await user.query(api.commands.snapshot, { workspaceId }),
    version = before.versions[1];
  await t.mutation(internal.commands.queueRelease, {
    workspaceId,
    subject: DEMO_USER,
    command: JSON.stringify({
      type: "release_sessions",
      versionId: version.id,
      sessionIds: [outbox.sessionId],
    }),
    requestId: "explicit-release",
  });
  const release = await t.run((ctx) =>
    ctx.db
      .query("outbox")
      .withIndex("by_key", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("key", "release:" + outbox.sessionId),
      )
      .unique(),
  );
  expect(release?.operation).toBe("release");
  await t.mutation(internal.jobs.receipt, {
    outboxId: release!._id,
    success: true,
  });
  const after = await user.query(api.commands.snapshot, { workspaceId });
  expect(after.versions).toEqual(before.versions);
  expect(
    after.proposals[0].alternatives[0].sessions.find(
      (s) => s.id === outbox.sessionId,
    )?.status,
  ).toBe("released");
});
