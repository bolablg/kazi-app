// @vitest-environment edge-runtime
// Context fixtures test authorization logic, not real provider signatures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const issuer = "https://clerk.iyanju.com",
  legacy = "https://clerk.kazi.iyanju.com";
const now = Date.UTC(2026, 9, 26);
const claims = {
  issuer,
  subject: "user_central",
  azp: "https://iyanju.com",
  aud: "convex",
  sid: "sess_fixture",
  iat: now / 1000,
  exp: now / 1000 + 60,
  sts: "active",
};
const request = (query = "") =>
  [
    "/account/service-activation" + query,
    {
      headers: {
        Authorization: "Bearer synthetic.payload.signature",
        Cookie: "must-not-select-owner=1",
      },
    },
  ] as const;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("KAZI_IDENTITY_MODE", "shared");
  vi.stubEnv("KAZI_IDENTITY_ENVIRONMENT", "production");
  vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "true");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", legacy);
  vi.stubEnv("IYANJU_CLERK_ISSUER_DOMAIN", issuer);
  vi.stubEnv("KAZI_AUTH_ORIGINS", "https://kazi.iyanju.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("identityAliases", {
      environment: "production",
      issuer,
      subject: claims.subject,
      actorId: "preserved_legacy_actor",
      provider: "central",
      registrationKind: "legacy",
      linkedAt: 100,
    });
    await ctx.db.insert("serviceActivations", {
      environment: "production",
      serviceId: "kazi",
      actorId: "preserved_legacy_actor",
      activatedAt: null,
      firstObservedAt: 123456,
      provenance: "legacy-history-unknown",
    });
    await ctx.db.insert("serviceActivations", {
      environment: "production",
      serviceId: "kazi",
      actorId: "other_actor",
      activatedAt: 100,
      firstObservedAt: 200,
      provenance: "new-authorized-entry",
    });
    await ctx.db.insert("serviceActivations", {
      environment: "development",
      serviceId: "kazi",
      actorId: "preserved_legacy_actor",
      activatedAt: 999,
      firstObservedAt: 999,
      provenance: "new-authorized-entry",
    });
  });
  return t;
}
describe("dedicated root owner activation read", () => {
  it("reads only the mapped owner's activation without provisioning or changing dates", async () => {
    const t = await seeded(),
      a = t.withIdentity(claims);
    const before = await t.run(async (ctx) => ({
      aliases: await ctx.db.query("identityAliases").collect(),
      activations: await ctx.db.query("serviceActivations").collect(),
      profiles: await ctx.db.query("profiles").collect(),
      workspaces: await ctx.db.query("workspaces").collect(),
    }));
    for (let i = 0; i < 2; i++) {
      const response = await a.fetch(...request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        version: 1,
        serviceId: "kazi",
        environment: "production",
        activation: { activatedAt: null, firstObservedAt: 123456 },
      });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vary")).toBe("Authorization");
    }
    expect(
      await t.run(async (ctx) => ({
        aliases: await ctx.db.query("identityAliases").collect(),
        activations: await ctx.db.query("serviceActivations").collect(),
        profiles: await ctx.db.query("profiles").collect(),
        workspaces: await ctx.db.query("workspaces").collect(),
      })),
    ).toEqual(before);
    // The dedicated endpoint does not make root JWTs valid for general APIs.
    await expect(a.query(api.identity.status, {})).rejects.toThrow(
      "not authorized",
    );
  });
  it("returns authoritative null for an unmapped account and makes no activation", async () => {
    const t = await seeded(),
      a = t.withIdentity({
        ...claims,
        subject: "unmapped",
        actorId: "preserved_legacy_actor",
        email: "same@example.test",
      });
    const response = await a.fetch(...request());
    expect(response.status).toBe(200);
    expect((await response.json()).activation).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query("identityAliases").collect()),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toHaveLength(3);
  });
  it("preserves central history after legacy retirement and does not create a missing activation", async () => {
    const t = await seeded();
    vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "false");
    expect(
      (await (await t.withIdentity(claims).fetch(...request())).json())
        .activation,
    ).toEqual({ activatedAt: null, firstObservedAt: 123456 });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("serviceActivations")
        .withIndex("by_identity", (q) =>
          q
            .eq("environment", "production")
            .eq("serviceId", "kazi")
            .eq("actorId", "preserved_legacy_actor"),
        )
        .unique();
      await ctx.db.delete(row!._id);
    });
    expect(
      (await (await t.withIdentity(claims).fetch(...request())).json())
        .activation,
    ).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toHaveLength(2);
  });
  it.each([
    { issuer: legacy },
    { issuer: "https://attacker.example" },
    { azp: "https://kazi.iyanju.com" },
    { azp: "https://attacker.example" },
    { azp: undefined },
    { aud: "other" },
    { aud: ["convex", "other"] },
    { sid: undefined },
    { sid: "" },
    { client_id: "oauth_client" },
    { sts: "pending" },
    { exp: now / 1000 },
  ])("denies incorrect session boundary %j", async (change) => {
    const t = await seeded();
    const response = await t
      .withIdentity({ ...claims, ...change })
      .fetch(...request());
    expect([401, 403]).toContain(response.status);
    expect(
      await t.run((ctx) => ctx.db.query("serviceActivations").collect()),
    ).toHaveLength(3);
  });
  it("rejects anonymous reads, selectors and unsupported environments", async () => {
    const t = await seeded();
    expect((await t.fetch(...request())).status).toBe(401);
    expect(
      (await t.withIdentity(claims).fetch(...request("?subject=other_actor")))
        .status,
    ).toBe(400);
    vi.stubEnv("KAZI_IDENTITY_ENVIRONMENT", "preview");
    expect((await t.withIdentity(claims).fetch(...request())).status).toBe(503);
    vi.stubEnv("KAZI_IDENTITY_MODE", "legacy");
    expect((await t.withIdentity(claims).fetch(...request())).status).toBe(503);
  });
  it("uses only the exact reviewed development root origin", async () => {
    vi.stubEnv("KAZI_IDENTITY_ENVIRONMENT", "development");
    const developmentIssuer = "https://funky-monitor-8635.clerk.accounts.dev";
    vi.stubEnv("IYANJU_CLERK_ISSUER_DOMAIN", developmentIssuer);
    const t = convexTest(schema, modules);
    expect(
      (
        await t
          .withIdentity({
            ...claims,
            issuer: developmentIssuer,
            azp: "http://127.0.0.1:49569",
          })
          .fetch(...request())
      ).status,
    ).toBe(200);
    expect(
      (
        await t
          .withIdentity({
            ...claims,
            issuer: developmentIssuer,
            azp: "http://127.0.0.1:3000",
          })
          .fetch(...request())
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .withIdentity({ ...claims, issuer: developmentIssuer })
          .fetch(...request())
      ).status,
    ).toBe(403);
  });
});
