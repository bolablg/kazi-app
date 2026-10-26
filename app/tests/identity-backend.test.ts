// @vitest-environment edge-runtime
// These authenticated-context fixtures do not verify provider signatures or
// actual Convex claim propagation. Real signed-provider readback gates cutover.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";
import { createWorkspace } from "../convex/store";

const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
const legacyIssuer = "https://legacy.clerk.example.test";
const centralIssuer = "https://central.clerk.example.test";
const origin = "https://kazi.example.test";
const actor = "user_existing_kazi";
const now = Date.UTC(2026, 9, 26, 12);
const claims = (issuer = centralIssuer, subject = "user_central") => ({
  issuer,
  subject,
  azp: origin,
  aud: "convex",
  sts: "active",
  iat: now / 1000,
  exp: now / 1000 + 3600,
  fva: [0, -1],
  name: "Verified person",
  email: "person@example.test",
  email_verified: true,
  preferred_username: "verified.person",
});
function shared(environment = "development") {
  vi.stubEnv("KAZI_IDENTITY_MODE", "shared");
  vi.stubEnv("KAZI_IDENTITY_ENVIRONMENT", environment);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", legacyIssuer);
  vi.stubEnv("IYANJU_CLERK_ISSUER_DOMAIN", centralIssuer);
  vi.stubEnv("KAZI_AUTH_ORIGINS", origin);
  vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "true");
}
async function existing(t: ReturnType<typeof make>, subject = actor) {
  return t.run(async (ctx) => {
    const workspaceId = await createWorkspace(
      ctx,
      subject,
      "Existing Kazi person",
      "person@example.test",
      "personal",
    );
    await ctx.db.insert("profiles", {
      subject,
      name: "Existing Kazi person",
      email: "person@example.test",
      activeWorkspaceId: workspaceId,
    });
    return workspaceId;
  });
}
async function link(
  t: ReturnType<typeof make>,
  subject = actor,
  central = "user_central",
) {
  const proof = await t
    .withIdentity(claims(legacyIssuer, subject))
    .action(api.identity.beginLink, {});
  const account = t.withIdentity(claims(centralIssuer, central));
  const result = await account.mutation(api.identity.completeLink, {
    id: proof.id,
    secret: proof.secret,
  });
  return { proof, account, result };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  shared();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("canonical Kazi identity and account choice", () => {
  it("keeps legacy mode as the default and preserves the original bootstrap", async () => {
    vi.stubEnv("KAZI_IDENTITY_MODE", "legacy");
    const t = make(),
      a = t.withIdentity({ subject: actor });
    const workspaceId = await a.mutation(api.commands.bootstrap, {});
    expect(workspaceId).toBeTruthy();
    expect(await a.query(api.identity.status, {})).toMatchObject({
      mode: "legacy",
      state: "ready",
      actorId: actor,
    });
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toEqual([]);
  });

  it("does not autolink by email, actor arguments, or the same raw subject across issuers", async () => {
    const t = make(),
      workspaceId = await existing(t);
    const central = t.withIdentity({
      ...claims(centralIssuer, actor),
      actorId: actor,
    });
    expect(await central.query(api.identity.status, {})).toMatchObject({
      state: "unlinked",
      actorId: null,
      accountCreatedAt: null,
    });
    await expect(central.mutation(api.commands.bootstrap, {})).rejects.toThrow(
      "Link your existing",
    );
    await expect(
      central.query(api.commands.snapshot, { workspaceId }),
    ).rejects.toThrow("Link your existing");
    const started = await central.mutation(api.identity.startNewAccount, {});
    expect(started.actorId).toMatch(/^iy_[0-9a-f]{64}$/);
    expect(started.actorId).not.toBe(actor);
    expect(started.workspaceId).not.toBe(workspaceId);
    const identities = await t.run((ctx) => ctx.db.query("profiles").collect());
    expect(identities.map((p) => p.subject).sort()).toEqual(
      [actor, started.actorId].sort(),
    );
    await expect(
      central.query(api.commands.snapshot, { workspaceId }),
    ).rejects.toThrow("unavailable");
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toEqual([]);
  });

  it("disables alternate legacy signup while keeping existing raw actors usable", async () => {
    const t = make();
    const newcomer = t.withIdentity(claims(legacyIssuer, "legacy_new"));
    await expect(newcomer.mutation(api.commands.bootstrap, {})).rejects.toThrow(
      "Create new accounts through iYANJU",
    );
    await expect(newcomer.action(api.identity.beginLink, {})).rejects.toThrow(
      "existing Kazi account",
    );
    const workspaceId = await existing(t);
    const old = t.withIdentity(claims(legacyIssuer, actor));
    expect(await old.mutation(api.commands.bootstrap, {})).toBe(workspaceId);
    expect(await old.query(api.identity.status, {})).toMatchObject({
      provider: "legacy",
      actorId: actor,
      canLinkLegacy: true,
    });
  });

  it("reuses a member's existing workspace when the old profile is absent", async () => {
    const t = make();
    const workspaceId = await t.run((ctx) =>
      createWorkspace(ctx, actor, "Existing", "", "personal"),
    );
    const old = t.withIdentity(claims(legacyIssuer, actor));
    expect(await old.mutation(api.commands.bootstrap, {})).toBe(workspaceId);
    expect(
      (await t.run((ctx) => ctx.db.query("workspaces").collect())).length,
    ).toBe(1);
  });

  it("keeps shared identity aliases separated by environment", async () => {
    const t = make(),
      a = t.withIdentity(claims());
    const dev = await a.mutation(api.identity.startNewAccount, {});
    shared("preview");
    expect(await a.query(api.identity.status, {})).toMatchObject({
      state: "unlinked",
    });
    const preview = await a.mutation(api.identity.startNewAccount, {});
    expect(preview.actorId).not.toBe(dev.actorId);
    shared();
    expect(await a.query(api.identity.status, {})).toMatchObject({
      actorId: dev.actorId,
    });
  });
});

describe("verified two-account linking", () => {
  it("invalidates outstanding legacy proofs when temporary trust is retired", async () => {
    const t = make();
    await existing(t);
    const proof = await t
      .withIdentity(claims(legacyIssuer, actor))
      .action(api.identity.beginLink, {});
    vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "false");
    const central = t.withIdentity(claims());
    await expect(
      central.query(api.identity.linkPreview, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("linking has ended");
    await expect(
      central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("linking has ended");
    expect(
      await t.run((ctx) => ctx.db.query("identityAliases").collect()),
    ).toEqual([]);
    expect(
      (await t.run((ctx) => ctx.db.get(proof.id)))?.usedAt,
    ).toBeUndefined();
  });
  it("stores only a hashed single-use proof and preserves all existing product and credential records", async () => {
    const t = make(),
      workspaceId = await existing(t);
    const old = t.withIdentity(claims(legacyIssuer, actor));
    const taskId = await old.mutation(api.commands.execute, {
      workspaceId,
      requestId: "old-task",
      command: JSON.stringify({
        type: "create_task",
        title: "Preserved",
        description: "",
        priority: "medium",
        estimatedMinutes: 30,
        dependencies: [],
        labels: [],
      }),
    });
    const token = "kazi_existing_preserved_token";
    await t.mutation(internal.tokens.save, {
      subject: actor,
      hash: await sha256(token),
      label: "Keep MCP",
      scopes: ["read"],
    });
    const feedToken = "preserved_calendar_feed_token";
    await t.mutation(internal.calendar.saveFeed, {
      subject: actor,
      workspaceId,
      label: "Keep calendar",
      hash: await sha256(feedToken),
      includeDeadlines: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("calendarSecrets", {
        subject: actor,
        ciphertext: "unchanged-ciphertext",
        iv: "unchanged-iv",
        updatedAt: 1234,
      }),
    );
    const preserved = () =>
      t.run(async (ctx) => ({
        profiles: await ctx.db.query("profiles").collect(),
        workspaces: await ctx.db.query("workspaces").collect(),
        memberships: await ctx.db.query("memberships").collect(),
        projects: await ctx.db.query("projects").collect(),
        tasks: await ctx.db.query("tasks").collect(),
        activities: await ctx.db.query("activities").collect(),
        lifecycle: await ctx.db.query("lifecycleEvents").collect(),
        reports: await ctx.db.query("reportEvents").collect(),
        sessions: await ctx.db.query("calendarSessions").collect(),
        statuses: await ctx.db.query("calendarStatuses").collect(),
        secrets: await ctx.db.query("calendarSecrets").collect(),
        tokens: await ctx.db.query("mcpTokens").collect(),
        feeds: await ctx.db.query("calendarFeeds").collect(),
      }));
    const before = await preserved();
    const proof = await old.action(api.identity.beginLink, {});
    const row = await t.run((ctx) => ctx.db.get(proof.id));
    expect(row?.secretHash).toBe(await sha256(proof.secret));
    expect(JSON.stringify(row)).not.toContain(proof.secret);
    const central = t.withIdentity(claims());
    expect(
      await central.query(api.identity.linkPreview, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).toMatchObject({
      legacyDisplay: {
        name: "Existing Kazi person",
        email: "person@example.test",
      },
      completed: false,
    });
    expect(
      await central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).toEqual({ actorId: actor, workspaceId });
    expect(await preserved()).toEqual(before);
    expect(await central.query(api.identity.status, {})).toMatchObject({
      actorId: actor,
      provider: "central",
      state: "ready",
      hasCentralIdentity: true,
      activation: null,
      accountCreatedAt: null,
    });
    expect(await old.query(api.identity.status, {})).toMatchObject({
      actorId: actor,
      canLinkLegacy: false,
      hasCentralIdentity: true,
    });
    expect(
      (await central.query(api.commands.snapshot, { workspaceId })).tasks.find(
        (task) => task.id === taskId,
      )?.ownerId,
    ).toBe(actor);
    expect(
      await central.query(api.identity.linkPreview, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).toMatchObject({ completed: true });
    await expect(
      central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("already used");
    const mcp = await t.fetch("/mcp", {
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
        params: { name: "list_workspaces", arguments: {} },
      }),
    });
    expect(mcp.status).toBe(200);
    expect(JSON.stringify(await mcp.json())).toContain(workspaceId);
    expect(
      await t.query(internal.calendar.feedContent, {
        hash: await sha256(feedToken),
      }),
    ).toContain("VCALENDAR");
  }, 30000);

  it("rejects bad or expired proof without creating any mapping", async () => {
    const t = make();
    await existing(t);
    const old = t.withIdentity(claims(legacyIssuer, actor)),
      central = t.withIdentity(claims());
    const proof = await old.action(api.identity.beginLink, {});
    await expect(
      central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: "0".repeat(64),
      }),
    ).rejects.toThrow("unavailable or expired");
    await expect(
      central.query(api.identity.linkPreview, {
        id: proof.id,
        secret: proof.secret.slice(1),
      }),
    ).rejects.toThrow("unavailable or expired");
    vi.setSystemTime(now + 5 * 60000 + 1000);
    await expect(
      central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("unavailable or expired");
    expect(
      await t.run((ctx) => ctx.db.query("identityAliases").collect()),
    ).toEqual([]);
  });

  it("requires current proof from both authenticated accounts", async () => {
    const t = make();
    await existing(t);
    const stale = t.withIdentity({
      ...claims(legacyIssuer, actor),
      fva: [10, -1],
    });
    await expect(stale.action(api.identity.beginLink, {})).rejects.toThrow(
      "Verify your account again",
    );
    const proof = await t
      .withIdentity(claims(legacyIssuer, actor))
      .action(api.identity.beginLink, {});
    for (const fva of [[0, 10], [-1, -1], [0], [0, "0"]]) {
      const central = t.withIdentity({ ...claims(), fva });
      await expect(
        central.mutation(api.identity.completeLink, {
          id: proof.id,
          secret: proof.secret,
        }),
      ).rejects.toThrow("Verify your account again");
    }
    const { fva: _ignored, ...withoutFactor } = claims();
    await expect(
      t.withIdentity(withoutFactor).mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("Verify your account again");
    expect(
      await t.run((ctx) => ctx.db.query("identityAliases").collect()),
    ).toEqual([]);
  });

  it("binds proof to environment and never allows an already registered account to merge", async () => {
    const t = make();
    await existing(t);
    const proof = await t
      .withIdentity(claims(legacyIssuer, actor))
      .action(api.identity.beginLink, {});
    const central = t.withIdentity(claims());
    shared("preview");
    await expect(
      central.query(api.identity.linkPreview, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("unavailable or expired");
    shared();
    await central.mutation(api.identity.startNewAccount, {});
    await expect(
      central.mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("already linked");
    expect(
      (await t.run((ctx) => ctx.db.query("identityAliases").collect())).length,
    ).toBe(1);
  });

  it("rejects proof if the legacy Kazi account was removed before completion", async () => {
    const t = make();
    await existing(t);
    const proof = await t
      .withIdentity(claims(legacyIssuer, actor))
      .action(api.identity.beginLink, {});
    await t.run(async (ctx) => {
      for (const profile of await ctx.db.query("profiles").collect())
        await ctx.db.delete(profile._id);
      for (const membership of await ctx.db.query("memberships").collect())
        await ctx.db.delete(membership._id);
    });
    await expect(
      t.withIdentity(claims()).mutation(api.identity.completeLink, {
        id: proof.id,
        secret: proof.secret,
      }),
    ).rejects.toThrow("account is unavailable");
    expect(
      await t.run((ctx) => ctx.db.query("identityAliases").collect()),
    ).toEqual([]);
    expect(
      (await t.run((ctx) => ctx.db.get(proof.id)))?.usedAt,
    ).toBeUndefined();
  });

  it("allows only one concurrent winner for the same legacy account", async () => {
    const t = make();
    await existing(t);
    const old = t.withIdentity(claims(legacyIssuer, actor));
    const proof = await old.action(api.identity.beginLink, {});
    const results = await Promise.allSettled(
      ["central_a", "central_b"].map((subject) =>
        t
          .withIdentity(claims(centralIssuer, subject))
          .mutation(api.identity.completeLink, {
            id: proof.id,
            secret: proof.secret,
          }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.query("identityAliases").collect())).filter(
        (a) => a.provider === "central",
      ),
    ).toHaveLength(1);
  });

  it("allows only one concurrent winner when one central account targets different legacy accounts", async () => {
    const t = make();
    await existing(t);
    await existing(t, "user_second_legacy");
    const proofs = await Promise.all(
      [actor, "user_second_legacy"].map((subject) =>
        t
          .withIdentity(claims(legacyIssuer, subject))
          .action(api.identity.beginLink, {}),
      ),
    );
    const central = t.withIdentity(claims());
    const results = await Promise.allSettled(
      proofs.map((proof) =>
        central.mutation(api.identity.completeLink, {
          id: proof.id,
          secret: proof.secret,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.query("identityAliases").collect())).filter(
        (a) => a.provider === "central",
      ),
    ).toHaveLength(1);
  });

  it("bounds pending proof creation and deletes expired proof in bounded batches", async () => {
    const t = make();
    await existing(t);
    const old = t.withIdentity(claims(legacyIssuer, actor));
    for (let i = 0; i < 3; i++) await old.action(api.identity.beginLink, {});
    await expect(old.action(api.identity.beginLink, {})).rejects.toThrow(
      "Finish an existing link attempt",
    );
    vi.setSystemTime(now + 5 * 60000 + 1000);
    expect(await t.mutation(internal.identity.pruneLinkChallenges, {})).toBe(3);
    expect(
      await t.run((ctx) => ctx.db.query("identityLinkChallenges").collect()),
    ).toEqual([]);
  });
});

describe("shared authentication boundary and canonical action entry", () => {
  it("retires the legacy issuer while preserving linked central access, stable actors and existing records", async () => {
    const t = make(),
      workspaceId = await existing(t);
    const { account } = await link(t);
    await account.mutation(api.commands.bootstrap, {});
    const before = await t.run(async (ctx) => ({
      aliases: await ctx.db.query("identityAliases").collect(),
      profiles: await ctx.db.query("profiles").collect(),
      memberships: await ctx.db.query("memberships").collect(),
      activations: await ctx.db.query("serviceActivations").collect(),
    }));
    vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "false");
    const old = t.withIdentity(claims(legacyIssuer, actor));
    await expect(old.query(api.identity.status, {})).rejects.toThrow(
      "not trusted",
    );
    await expect(old.mutation(api.commands.bootstrap, {})).rejects.toThrow(
      "not trusted",
    );
    await expect(old.action(api.identity.beginLink, {})).rejects.toThrow(
      "not trusted",
    );
    await expect(
      old.action(api.tokens.mint, { label: "Retired", scopes: ["read"] }),
    ).rejects.toThrow("not trusted");
    await expect(
      t.query(internal.identity.resolveFor, {
        issuer: legacyIssuer,
        subject: actor,
      }),
    ).rejects.toThrow("not trusted");
    expect(
      await t.query(internal.identity.resolveFor, {
        issuer: centralIssuer,
        subject: "user_central",
      }),
    ).toBe(actor);
    expect(await account.query(api.identity.status, {})).toMatchObject({
      state: "ready",
      actorId: actor,
      hasCentralIdentity: true,
    });
    expect(await account.mutation(api.commands.bootstrap, {})).toBe(
      workspaceId,
    );
    expect(
      (await account.query(api.commands.snapshot, { workspaceId })).members[0]
        .id,
    ).toBe(actor);
    const token = await account.action(api.tokens.mint, {
      label: "Central after retirement",
      scopes: ["read"],
    });
    expect(
      (await t.run((ctx) => ctx.db.query("mcpTokens").collect()))[0],
    ).toMatchObject({ subject: actor, hash: await sha256(token) });
    expect(
      await t.run(async (ctx) => ({
        aliases: await ctx.db.query("identityAliases").collect(),
        profiles: await ctx.db.query("profiles").collect(),
        memberships: await ctx.db.query("memberships").collect(),
        activations: await ctx.db.query("serviceActivations").collect(),
      })),
    ).toEqual(before);
  });
  it.each([
    ["issuer", { issuer: "https://untrusted.example.test" }, "not trusted"],
    ["origin", { azp: "https://hostile.example.test" }, "not authorized"],
    ["missing origin", { azp: undefined }, "not authorized"],
    ["pending session", { sts: "pending" }, "Finish signing in"],
    ["invalid session", { sts: false }, "Finish signing in"],
  ])(
    "rejects %s before account lookup and without side effects",
    async (_label, override, message) => {
      const t = make(),
        a = t.withIdentity({ ...claims(), ...override });
      await expect(a.query(api.identity.status, {})).rejects.toThrow(message);
      await expect(
        a.mutation(api.identity.startNewAccount, {}),
      ).rejects.toThrow(message);
      expect(await t.run((ctx) => ctx.db.query("profiles").collect())).toEqual(
        [],
      );
      expect(
        await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
      ).toEqual([]);
    },
  );

  it.each([
    { aud: "other-service" },
    { aud: ["convex", "other-service"] },
    { exp: now / 1000 },
    { iat: now / 1000 + 61 },
    { nbf: now / 1000 + 61 },
  ])("rejects incorrect bound raw claims %j", async (override) => {
    const t = make(),
      a = t.withIdentity({ ...claims(), ...override });
    await expect(a.mutation(api.identity.startNewAccount, {})).rejects.toThrow(
      "authenticated session is invalid",
    );
  });

  it("keeps anonymous calls from allocating actors or first entry records", async () => {
    const t = make();
    await expect(t.query(api.identity.status, {})).rejects.toThrow(
      "Sign in to continue",
    );
    await expect(t.mutation(api.identity.startNewAccount, {})).rejects.toThrow(
      "Sign in to continue",
    );
    await expect(t.mutation(api.commands.bootstrap, {})).rejects.toThrow(
      "Sign in to continue",
    );
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toEqual([]);
  });

  it("normalizes verified profile fields and uses the preserved actor in public JWT actions", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://kazi-backend.example.test");
    const t = make(),
      workspaceId = await existing(t);
    const { account } = await link(t);
    await account.mutation(api.commands.bootstrap, {});
    const profile = await t.run((ctx) =>
      ctx.db
        .query("profiles")
        .withIndex("by_subject", (q) => q.eq("subject", actor))
        .unique(),
    );
    expect(profile).toMatchObject({
      subject: actor,
      name: "Verified person",
      username: "verified.person",
    });
    const token = await account.action(api.tokens.mint, {
      label: "Canonical JWT action",
      scopes: ["read"],
    });
    const feed = await account.action(api.calendar.createFeed, {
      workspaceId,
      label: "Canonical feed",
      includeDeadlines: false,
    });
    const savedToken = (
      await t.run((ctx) => ctx.db.query("mcpTokens").collect())
    ).find((row) => row.label === "Canonical JWT action");
    expect(savedToken?.subject).toBe(actor);
    expect(savedToken?.hash).toBe(await sha256(token));
    expect(
      (await t.run((ctx) => ctx.db.query("calendarFeeds").collect())).find(
        (row) => String(row._id) === feed.id,
      )?.subject,
    ).toBe(actor);
    expect(await account.query(api.tokens.list, {})).toHaveLength(1);
  });
});

describe("transactional service activation", () => {
  it("records new users only after authorized bootstrap and preserves a single timestamp on retries", async () => {
    const t = make(),
      a = t.withIdentity({ ...claims(), accountCreatedAt: 1, iat: now / 1000 });
    const registered = await a.mutation(api.identity.startNewAccount, {});
    expect(await a.query(api.identity.status, {})).toMatchObject({
      activation: null,
      accountCreatedAt: null,
    });
    await Promise.all([
      a.mutation(api.commands.bootstrap, {}),
      a.mutation(api.commands.bootstrap, {}),
    ]);
    const rows = await t.run((ctx) =>
      ctx.db.query("serviceActivations").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: registered.actorId,
      environment: "development",
      serviceId: "kazi",
      activatedAt: now,
      firstObservedAt: now,
      provenance: "new-authorized-entry",
    });
    vi.setSystemTime(now + 60000);
    await a.mutation(api.commands.bootstrap, {});
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toEqual(rows);
  });

  it("keeps old activation unknown and records server observation separately without backdating", async () => {
    const t = make(),
      workspaceId = await existing(t);
    const { account } = await link(t);
    expect(await account.query(api.identity.status, {})).toMatchObject({
      activation: null,
      accountCreatedAt: null,
    });
    await account.mutation(api.commands.bootstrap, {});
    const status = await account.query(api.identity.status, {});
    expect(status.activation).toMatchObject({
      activatedAt: null,
      provenance: "legacy-history-unknown",
    });
    expect(status.activation!.firstObservedAt).toBeGreaterThanOrEqual(now);
    expect(status.activation!.firstObservedAt).toBeLessThan(now + 100);
    const outsider = t.withIdentity(claims(centralIssuer, "outsider"));
    await outsider.mutation(api.identity.startNewAccount, {});
    await expect(
      outsider.query(api.commands.snapshot, { workspaceId }),
    ).rejects.toThrow("unavailable");
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toHaveLength(1);
  });

  it("retains a proven historical activation and its provenance unchanged", async () => {
    const t = make();
    await existing(t);
    const { account } = await link(t);
    await t.run((ctx) =>
      ctx.db.insert("serviceActivations", {
        actorId: actor,
        environment: "development",
        serviceId: "kazi",
        activatedAt: 123456,
        firstObservedAt: 234567,
        provenance: "legacy-preserved",
      }),
    );
    const before = await t.run((ctx) =>
      ctx.db.query("serviceActivations").collect(),
    );
    await account.mutation(api.commands.bootstrap, {});
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toEqual(before);
  });
});

describe("owner identity metadata in app and MCP exports", () => {
  it("adds only the canonical owner's safe identity metadata even for another team's admin", async () => {
    const t = make(),
      workspaceId = await existing(t);
    await existing(t, "user_other_kazi");
    const first = await link(t);
    const second = await link(t, "user_other_kazi", "user_other_central");
    await first.account.mutation(api.commands.bootstrap, {});
    await second.account.mutation(api.commands.bootstrap, {});
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("memberships")
        .withIndex("by_subject", (q) => q.eq("subject", "user_other_kazi"))
        .first();
      await ctx.db.insert("memberships", {
        workspaceId,
        key: "user_other_kazi",
        subject: "user_other_kazi",
        data: { ...member!.data, role: "admin" },
      });
      await ctx.db.insert("identityAliases", {
        environment: "preview",
        actorId: actor,
        issuer: centralIssuer,
        subject: "preview_identity_must_not_leak",
        provider: "central",
        registrationKind: "legacy",
        linkedAt: 1,
      });
    });
    const exported = await first.account.query(api.commands.exportData, {
      workspaceId,
    });
    expect(exported.format).toBe("kazi-export/1");
    expect(exported.data.workspace).toBeTruthy();
    expect(exported.accountIdentity).toMatchObject({
      canonicalActorId: actor,
      environment: "development",
      serviceActivations: [
        {
          serviceId: "kazi",
          activatedAt: null,
          provenance: "legacy-history-unknown",
        },
      ],
    });
    expect(
      exported.accountIdentity.identities.map((i) => i.subject).sort(),
    ).toEqual([actor, "user_central"].sort());
    for (const identity of exported.accountIdentity.identities)
      expect(Object.keys(identity).sort()).toEqual(
        [
          "issuer",
          "subject",
          "provider",
          "registrationKind",
          "linkedAt",
          "accountCreatedAt",
        ].sort(),
      );
    expect(JSON.stringify(exported.accountIdentity)).not.toContain(
      first.proof.secret,
    );
    expect(JSON.stringify(exported.accountIdentity)).not.toContain(
      String(first.proof.id),
    );
    expect(JSON.stringify(exported.accountIdentity)).not.toContain(
      "preview_identity",
    );
    const adminExport = await second.account.query(api.commands.exportData, {
      workspaceId,
    });
    expect(adminExport.accountIdentity.canonicalActorId).toBe(
      "user_other_kazi",
    );
    expect(
      adminExport.accountIdentity.identities.map((i) => i.subject).sort(),
    ).toEqual(["user_other_kazi", "user_other_central"].sort());
    const token = "kazi_safe_owner_export";
    await t.mutation(internal.tokens.save, {
      subject: "user_other_kazi",
      hash: await sha256(token),
      label: "Owner export",
      scopes: ["read"],
    });
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
        params: { name: "export_data", arguments: { workspaceId } },
      }),
    });
    const body = await response.json();
    expect(body.result.isError).not.toBe(true);
    const mcpExport = JSON.parse(body.result.content[0].text).result;
    expect(mcpExport.accountIdentity).toEqual(adminExport.accountIdentity);
    expect(JSON.stringify(mcpExport.accountIdentity)).not.toContain(actor);
  }, 30000);

  it("exports safe owner metadata during legacy rollback and with no identity records", async () => {
    const t = make(),
      workspaceId = await existing(t);
    const linked = await link(t);
    await linked.account.mutation(api.commands.bootstrap, {});
    const sharedExport = await linked.account.query(api.commands.exportData, {
      workspaceId,
    });
    vi.stubEnv("KAZI_IDENTITY_MODE", "legacy");
    const old = t.withIdentity({ subject: actor });
    const legacyExport = await old.query(api.commands.exportData, {
      workspaceId,
    });
    expect(legacyExport.accountIdentity).toEqual(sharedExport.accountIdentity);
    const newcomer = t.withIdentity({ subject: "legacy_person_without_alias" });
    const freshWorkspace = (await newcomer.mutation(
      api.commands.bootstrap,
      {},
    ))!;
    expect(
      (
        await newcomer.query(api.commands.exportData, {
          workspaceId: freshWorkspace,
        })
      ).accountIdentity,
    ).toEqual({
      canonicalActorId: "legacy_person_without_alias",
      environment: "development",
      identities: [],
      serviceActivations: [],
    });
  });
});
