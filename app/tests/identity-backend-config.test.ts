import { afterEach, describe, expect, it, vi } from "vitest";
import { identityAuthConfig, identityConfig } from "../convex/identityConfig";
import {
  boundAuthenticatedClaims,
  hasFreshVerification,
  normalizeIdentity,
  reverificationReason,
  verifiedPrincipal,
} from "../convex/identityCore";

const issuer = "https://legacy.clerk.example.test";
const central = "https://central.clerk.example.test";
const origin = "https://kazi.example.test";
const shared = {
  KAZI_IDENTITY_MODE: "shared",
  KAZI_IDENTITY_ENVIRONMENT: "production",
  CLERK_JWT_ISSUER_DOMAIN: issuer,
  IYANJU_CLERK_ISSUER_DOMAIN: central,
  KAZI_AUTH_ORIGINS: origin,
};
const now = Date.UTC(2026, 9, 26);
const identity = {
  issuer,
  subject: "user_a",
  tokenIdentifier: issuer + "|user_a",
};
const payload = {
  iss: issuer,
  sub: "user_a",
  aud: "convex",
  iat: now / 1000,
  exp: now / 1000 + 60,
};
// Deliberately not a signature fixture: this helper must bind only the exact
// already-authenticated token supplied by Convex, never a token in arguments.
const token = (claims: unknown) =>
  "header." +
  btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "") +
  ".signature";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("gated identity provider configuration", () => {
  it("keeps a single legacy provider unless explicitly enabled", () => {
    expect(identityAuthConfig({ CLERK_JWT_ISSUER_DOMAIN: issuer })).toEqual({
      providers: [{ domain: issuer, applicationID: "convex" }],
    });
    expect(identityConfig({})).toEqual({ mode: "legacy" });
  });
  it("pins both trusted issuers, fixed JWKS, audience and signature algorithm", () => {
    expect(identityAuthConfig(shared).providers).toEqual(
      [issuer, central].map((domain) => ({
        type: "customJwt",
        issuer: domain,
        jwks: domain + "/.well-known/jwks.json",
        algorithm: "RS256",
        applicationID: "convex",
      })),
    );
  });
  it("ends temporary legacy trust explicitly without changing the central provider", () => {
    expect(identityConfig(shared)).toMatchObject({ legacyAuthEnabled: true });
    expect(
      identityConfig({ ...shared, KAZI_LEGACY_AUTH_ENABLED: "true" }),
    ).toMatchObject({ legacyAuthEnabled: true });
    expect(
      identityAuthConfig({ ...shared, KAZI_LEGACY_AUTH_ENABLED: "false" })
        .providers,
    ).toEqual([
      {
        type: "customJwt",
        issuer: central,
        jwks: central + "/.well-known/jwks.json",
        algorithm: "RS256",
        applicationID: "convex",
      },
    ]);
    expect(
      identityAuthConfig({
        CLERK_JWT_ISSUER_DOMAIN: issuer,
        KAZI_LEGACY_AUTH_ENABLED: "false",
      }),
    ).toEqual({ providers: [{ domain: issuer, applicationID: "convex" }] });
  });
  it.each(["", "TRUE", "FALSE", "0", "1", " true ", "no"])(
    "rejects invalid legacy retirement switch %j only in shared mode",
    (value) => {
      expect(() =>
        identityConfig({ ...shared, KAZI_LEGACY_AUTH_ENABLED: value }),
      ).toThrow();
      expect(identityConfig({ KAZI_LEGACY_AUTH_ENABLED: value })).toEqual({
        mode: "legacy",
      });
    },
  );
  it.each([
    { KAZI_IDENTITY_ENVIRONMENT: "" },
    { IYANJU_CLERK_ISSUER_DOMAIN: issuer },
    { IYANJU_CLERK_ISSUER_DOMAIN: "http://central.example.test" },
    { IYANJU_CLERK_ISSUER_DOMAIN: central + "/path" },
    {
      IYANJU_CLERK_ISSUER_DOMAIN: "https://user:password@central.example.test",
    },
    { KAZI_AUTH_ORIGINS: "https://*.example.test" },
    { KAZI_AUTH_ORIGINS: origin + "/account" },
    { KAZI_AUTH_ORIGINS: origin + "?origin=evil" },
    { KAZI_AUTH_ORIGINS: "http://127.0.0.1:5173" },
    { KAZI_AUTH_ORIGINS: "[]" },
    {
      KAZI_AUTH_ORIGINS: JSON.stringify(
        Array.from({ length: 9 }, (_, i) => `https://kazi${i}.example.test`),
      ),
    },
  ])("fails closed for invalid shared config %j", (override) => {
    expect(() => identityAuthConfig({ ...shared, ...override })).toThrow();
  });
  it("permits only exact loopback origins in explicitly development environments", () => {
    expect(
      identityConfig({
        ...shared,
        KAZI_IDENTITY_ENVIRONMENT: "development",
        KAZI_AUTH_ORIGINS: JSON.stringify([origin, "http://127.0.0.1:5173"]),
      }),
    ).toMatchObject({ origins: [origin, "http://127.0.0.1:5173"] });
    expect(() =>
      identityConfig({
        ...shared,
        KAZI_IDENTITY_ENVIRONMENT: "development",
        KAZI_AUTH_ORIGINS: "http://remote.example.test",
      }),
    ).toThrow();
  });
  it("retains the legacy local backend boundary", () => {
    expect(() =>
      identityAuthConfig({
        CLERK_JWT_ISSUER_DOMAIN: "http://127.0.0.1:5173",
        CONVEX_SITE_URL: "https://hosted.convex.site",
      }),
    ).toThrow("loopback");
  });
});

describe("claims bound to the authenticated Convex token", () => {
  it("classifies fresh-verification failures without returning token or claim details", () => {
    expect(reverificationReason(false, { ...payload, fva: [0, -1] }, now)).toBe(
      "auth_metadata_unavailable",
    );
    expect(reverificationReason(true, payload, now)).toBe("factor_age_missing");
    for (const fva of [null, [10, -1], [0, 10], [0], [0, "0"]])
      expect(reverificationReason(true, { ...payload, fva }, now)).toBe(
        "factor_age_stale_or_invalid",
      );
    expect(
      reverificationReason(true, { ...payload, fva: [0, -1] }, now),
    ).toBeNull();
  });
  it.each([
    [null, "auth_metadata_unavailable"],
    [{}, "factor_age_missing"],
    [{ fva: [10, -1] }, "factor_age_stale_or_invalid"],
    [{ fva: [0, "0"] }, "factor_age_stale_or_invalid"],
  ] as const)(
    "includes only a nonsecret reason in reverification errors",
    async (extra, reason) => {
      for (const [key, value] of Object.entries(shared)) vi.stubEnv(key, value);
      vi.stubEnv("KAZI_LEGACY_AUTH_ENABLED", "true");
      vi.spyOn(Date, "now").mockReturnValue(now);
      const ctx = {
        auth: {
          getUserIdentity: async () => ({
            ...identity,
            azp: origin,
            fva: [0, -1],
          }),
        },
        meta: {
          getRequestMetadata: async () => ({
            authToken:
              extra === null
                ? null
                : token({ ...payload, azp: origin, ...extra }),
          }),
        },
      } as unknown as Parameters<typeof verifiedPrincipal>[0];
      await expect(
        verifiedPrincipal(ctx, { fresh: true }),
      ).rejects.toMatchObject({
        data: {
          code: "REVERIFICATION_REQUIRED",
          message: "Verify your account again before linking identities.",
          reason,
        },
      });
    },
  );
  it("accepts only the verified issuer and subject in metadata", () => {
    expect(boundAuthenticatedClaims(token(payload), identity, now)).toEqual(
      payload,
    );
    for (const override of [
      { sub: "user_b" },
      { iss: central },
      { aud: "other" },
      { aud: ["convex", "other"] },
      { exp: now / 1000 },
      { iat: now / 1000 + 61 },
      { nbf: now / 1000 + 61 },
      { sts: "pending" },
    ])
      expect(() =>
        boundAuthenticatedClaims(
          token({ ...payload, ...override }),
          identity,
          now,
        ),
      ).toThrow();
  });
  it.each([
    "",
    "a.b",
    "header.not-json.signature",
    "a".repeat(16385),
    token(null),
    token([]),
  ])("rejects malformed authenticated metadata", (raw) => {
    expect(() => boundAuthenticatedClaims(raw, identity, now)).toThrow();
  });
  it("uses signed factor ages plus elapsed time with strict Clerk multi-factor semantics", () => {
    expect(hasFreshVerification({ ...payload, fva: [0, -1] }, now)).toBe(true);
    expect(hasFreshVerification({ ...payload, fva: [0, 0] }, now)).toBe(true);
    expect(
      hasFreshVerification({ ...payload, fva: [9, -1] }, now + 60000),
    ).toBe(false);
    for (const fva of [
      undefined,
      [-1, -1],
      [10, -1],
      [0, 10],
      [0],
      [0, "0"],
      [0, -2],
      [Number.NaN, -1],
    ])
      expect(hasFreshVerification({ ...payload, fva }, now)).toBe(false);
  });
  it("does not treat raw strings, missing verification, or client dates as verified email", () => {
    for (const email_verified of [false, "true", "false", undefined]) {
      const normalized = normalizeIdentity(identity, {
        email: "a@example.test",
        ...(email_verified !== undefined ? { email_verified } : {}),
        accountCreatedAt: 1,
      });
      expect(normalized.emailVerified).not.toBe(true);
    }
    expect(
      normalizeIdentity(identity, {
        email_verified: true,
        preferred_username: "verified.name",
      }),
    ).toMatchObject({
      emailVerified: true,
      preferredUsername: "verified.name",
    });
    expect(
      normalizeIdentity(
        { ...identity, emailVerified: true },
        { email_verified: "true" },
      ).emailVerified,
    ).toBe(false);
  });
});
