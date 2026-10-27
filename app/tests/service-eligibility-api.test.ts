// @vitest-environment edge-runtime
// Authenticated-context fixtures do not establish provider signature or claim propagation.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { createWorkspace } from "../convex/store";

const modules = import.meta.glob("../convex/**/*.ts");
const make = () => convexTest(schema, modules);
const central = "https://clerk.iyanju.com";
const legacy = "https://clerk.kazi.iyanju.com";
const reviewer = "user_synthetic_wlan_reviewer";
const actor = "user_original_kazi";
const origin = "https://kazi.iyanju.com";
const now = Date.UTC(2026, 9, 27, 12);
const policy = (subject: string, restriction: unknown = null) => ({
  version: 1,
  subject,
  restriction,
});
const claims = (
  subject = reviewer,
  issuer = central,
  restriction: unknown = { version: 1, services: ["wlan"] },
) => ({
  issuer,
  subject,
  azp: origin,
  aud: "convex",
  sts: "active",
  sid: "sess_synthetic",
  iat: now / 1000,
  exp: now / 1000 + 60,
  fva: [0, -1],
  email: "same@example.test",
  email_verified: true,
  name: "Synthetic person",
  ...(issuer === central
    ? { iyanju_access: policy(subject, restriction) }
    : {}),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("KAZI_IDENTITY_MODE", "shared");
  vi.stubEnv("KAZI_IDENTITY_ENVIRONMENT", "production");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", legacy);
  vi.stubEnv("IYANJU_CLERK_ISSUER_DOMAIN", central);
  vi.stubEnv("KAZI_AUTH_ORIGINS", origin);
  vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "true");
  vi.stubEnv("KAZI_SERVICE_ACCESS_MODE", "strict");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function seeded() {
  const t = make();
  const workspaceId = await t.run(async (ctx) => {
    const id = await createWorkspace(
      ctx,
      actor,
      "Existing member",
      "same@example.test",
      "personal",
    );
    await ctx.db.insert("profiles", {
      subject: actor,
      name: "Existing member",
      email: "same@example.test",
      activeWorkspaceId: id,
    });
    return id;
  });
  return { t, workspaceId };
}
const tables = [
  "identityAliases",
  "identityLinkChallenges",
  "profiles",
  "workspaces",
  "memberships",
  "serviceActivations",
  "projects",
  "tasks",
  "mcpTokens",
  "mcpActivity",
  "fileTickets",
  "calendarFeeds",
  "oauthStates",
  "calendarSecrets",
] as const;
async function database(t: ReturnType<typeof make>) {
  return t.run(async (ctx) =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          await ctx.db.query(table).collect(),
        ]),
      ),
    ),
  );
}

it("denies direct reads, mutations, provisioning and key/integration actions before any business write", async () => {
  const { t, workspaceId } = await seeded();
  const a = t.withIdentity(claims());
  const before = await database(t);
  await expect(a.query(api.identity.status, {})).rejects.toThrow(
    "not authorized to use Kazi",
  );
  await expect(a.query(api.commands.snapshot, { workspaceId })).rejects.toThrow(
    "not authorized to use Kazi",
  );
  await expect(a.query(api.commands.workspaces, {})).rejects.toThrow(
    "not authorized to use Kazi",
  );
  await expect(a.mutation(api.commands.bootstrap, {})).rejects.toThrow(
    "not authorized to use Kazi",
  );
  await expect(a.mutation(api.identity.startNewAccount, {})).rejects.toThrow(
    "not authorized to use Kazi",
  );
  await expect(
    a.mutation(api.commands.createTeam, { name: "Must not exist" }),
  ).rejects.toThrow("not authorized to use Kazi");
  await expect(
    a.mutation(api.commands.execute, {
      workspaceId,
      command: "{}",
      requestId: "synthetic-denied",
    }),
  ).rejects.toThrow("not authorized to use Kazi");
  await expect(
    a.action(api.tokens.mint, { label: "Must not exist", scopes: ["read"] }),
  ).rejects.toThrow("not authorized to use Kazi");
  await expect(a.action(api.calendar.connect, { workspaceId })).rejects.toThrow(
    "not authorized to use Kazi",
  );
  expect(await database(t)).toEqual(before);
});

it("denies restricted central linking even with valid legacy proof and matching email", async () => {
  const { t } = await seeded();
  const existing = t.withIdentity(claims(actor, legacy));
  const proof = await existing.action(api.identity.beginLink, {});
  const before = await database(t);
  const a = t.withIdentity({
    ...claims(),
    unsafe_metadata: { iyanju_service_restriction: null },
    actorId: actor,
  });
  await expect(
    a.query(api.identity.linkPreview, { id: proof.id, secret: proof.secret }),
  ).rejects.toThrow("not authorized to use Kazi");
  await expect(
    a.mutation(api.identity.completeLink, {
      id: proof.id,
      secret: proof.secret,
    }),
  ).rejects.toThrow("not authorized to use Kazi");
  expect(await database(t)).toEqual(before);
  expect((await database(t)).identityAliases).toEqual([]);
});

it("treats the raw subject on other issuers as a different identity and never creates a Kazi lineage", async () => {
  const { t } = await seeded();
  const before = await database(t);
  const untrusted = t.withIdentity(
    claims(reviewer, "https://wlan-legacy.example.test"),
  );
  await expect(untrusted.mutation(api.commands.bootstrap, {})).rejects.toThrow(
    "issuer is not trusted",
  );
  const unknownLegacy = t.withIdentity(claims(reviewer, legacy));
  await expect(
    unknownLegacy.mutation(api.commands.bootstrap, {}),
  ).rejects.toThrow("Create new accounts through iYANJU");
  await expect(
    unknownLegacy.action(api.tokens.mint, {
      label: "No lineage",
      scopes: ["read"],
    }),
  ).rejects.toThrow("Link your existing");
  await expect(
    unknownLegacy.action(api.identity.beginLink, {}),
  ).rejects.toThrow("existing Kazi account is required");
  expect(await database(t)).toEqual(before);
});

it.each([
  undefined,
  null,
  { version: 1, subject: reviewer },
  policy("someone_else"),
  policy(reviewer, { version: 1, services: [] }),
])(
  "strict mode denies missing/malformed policy %# before provisioning",
  async (value) => {
    const { t } = await seeded();
    const before = await database(t);
    const a = t.withIdentity({ ...claims(), iyanju_access: value });
    await expect(a.mutation(api.identity.startNewAccount, {})).rejects.toThrow(
      "not authorized to use Kazi",
    );
    expect(await database(t)).toEqual(before);
  },
);

it("accepts the strict dotted query representation only for the verified subject", async () => {
  const { t } = await seeded();
  const { iyanju_access: _unused, ...identity } = claims();
  const a = t.withIdentity({
    ...identity,
    "iyanju_access.version": 1,
    "iyanju_access.subject": reviewer,
    "iyanju_access.restriction.version": 1,
    "iyanju_access.restriction.services": ["wlan"],
  });
  await expect(a.query(api.identity.status, {})).rejects.toThrow(
    "not authorized to use Kazi",
  );
  const ordinary = t.withIdentity({
    ...identity,
    "iyanju_access.version": 1,
    "iyanju_access.subject": reviewer,
    "iyanju_access.restriction": null,
  });
  expect(await ordinary.query(api.identity.status, {})).toMatchObject({
    state: "unlinked",
    actorId: null,
  });
});

it("denies the dedicated root summary and cannot exchange a central JWT for MCP access", async () => {
  const { t } = await seeded();
  const before = await database(t);
  const root = t.withIdentity({ ...claims(), azp: "https://iyanju.com" });
  const response = await root.fetch("/account/service-activation", {
    headers: { Authorization: "Bearer synthetic.payload.signature" },
  });
  expect(response.status).toBe(403);
  for (const accept of [
    "application/json, text/event-stream",
    "text/event-stream, application/json",
  ]) {
    const mcp = await t.withIdentity(claims()).fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic.payload.signature",
        Accept: accept,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "synthetic-denied", version: "1" },
        },
      }),
    });
    expect(mcp.status).toBe(401);
  }
  expect(await database(t)).toEqual(before);
});

it("preserves ordinary new-account and legacy behavior without inferring service roles", async () => {
  const { t, workspaceId } = await seeded();
  const old = t.withIdentity(claims(actor, legacy));
  expect(await old.mutation(api.commands.bootstrap, {})).toBe(workspaceId);
  const a = t.withIdentity(claims("user_synthetic_ordinary", central, null));
  const created = await a.mutation(api.identity.startNewAccount, {});
  expect(created.actorId).not.toBe(actor);
  expect(await a.mutation(api.commands.bootstrap, {})).toBe(
    created.workspaceId,
  );
  expect(
    (await a.query(api.commands.snapshot, { workspaceId: created.workspaceId }))
      .members[0].role,
  ).toBe("owner");
  await expect(a.query(api.commands.snapshot, { workspaceId })).rejects.toThrow(
    "unavailable",
  );
});

it("keeps compatibility explicit and denies present restrictions even before strict rollout", async () => {
  vi.stubEnv("KAZI_SERVICE_ACCESS_MODE", "compat");
  const { t } = await seeded();
  await expect(
    t.withIdentity(claims()).query(api.identity.status, {}),
  ).rejects.toThrow("not authorized to use Kazi");
  const { iyanju_access: _unused, ...ordinary } = claims(
    "user_pre_rollout",
    central,
    null,
  );
  expect(
    await t.withIdentity(ordinary).query(api.identity.status, {}),
  ).toMatchObject({ state: "unlinked" });
  vi.stubEnv("KAZI_SERVICE_ACCESS_MODE", undefined);
  await expect(
    t.withIdentity(ordinary).query(api.identity.status, {}),
  ).rejects.toThrow("configuration needs attention");
  vi.stubEnv("KAZI_SERVICE_ACCESS_MODE", "typo");
  await expect(
    t.withIdentity(ordinary).query(api.identity.status, {}),
  ).rejects.toThrow("configuration needs attention");
});

it("strict mode cannot be reopened by reverting the backend to legacy identity mode", async () => {
  vi.stubEnv("KAZI_IDENTITY_MODE", "legacy");
  const { t } = await seeded();
  const before = await database(t);
  await expect(
    t.withIdentity(claims(actor, legacy)).mutation(api.commands.bootstrap, {}),
  ).rejects.toThrow("Strict service eligibility requires shared identity mode");
  expect(await database(t)).toEqual(before);
});

it("strict ordinary root summaries remain read-only and do not infer an alias from email", async () => {
  const { t } = await seeded();
  const before = await database(t);
  const ordinary = t.withIdentity({
    ...claims("user_synthetic_ordinary", central, null),
    azp: "https://iyanju.com",
  });
  const response = await ordinary.fetch("/account/service-activation", {
    headers: { Authorization: "Bearer synthetic.payload.signature" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    serviceId: "kazi",
    activation: null,
  });
  expect(await database(t)).toEqual(before);
});
