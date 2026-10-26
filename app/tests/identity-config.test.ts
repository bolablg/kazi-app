// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  centralAccountUrl,
  clearPendingLink,
  consumeReturn,
  identityPaths,
  readPendingLink,
  readReturn,
  rememberReturn,
  resolveIdentityConfig,
  safeReturnPath,
  savePendingLink,
  readProviderPreference,
  saveProviderPreference,
  prepareIdentitySignOut,
} from "../src/identityConfig";

const central = {
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_legacy",
  VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_test_central",
  VITE_IYANJU_ACCOUNT_ORIGIN: "http://127.0.0.1:49569",
};
beforeEach(() => sessionStorage.clear());
it("preserves feature-off legacy and selects a provider only on known migration routes", () => {
  const off = resolveIdentityConfig(
    { VITE_CLERK_PUBLISHABLE_KEY: "legacy" },
    "/tasks",
  );
  expect(off).toMatchObject({
    mode: "legacy",
    provider: "legacy",
    publishableKey: "legacy",
  });
  expect(off.central).toBeUndefined();
  expect(resolveIdentityConfig(central, "/tasks").provider).toBe("legacy");
  expect(
    resolveIdentityConfig(central, identityPaths.centralLink).provider,
  ).toBe("central");
  expect(resolveIdentityConfig(central, identityPaths.returned).provider).toBe(
    "central",
  );
  expect(
    resolveIdentityConfig(
      { ...central, VITE_KAZI_IDENTITY_MODE: "shared" },
      "/tasks",
    ).provider,
  ).toBe("central");
  expect(
    resolveIdentityConfig(
      { ...central, VITE_KAZI_IDENTITY_MODE: "shared" },
      identityPaths.legacyLink,
    ).provider,
  ).toBe("legacy");
  expect(
    resolveIdentityConfig(central, "/account/link/central/other").provider,
  ).toBe("legacy");
});
it("keeps an intentional per-tab directory choice through sign-out and refresh", () => {
  saveProviderPreference(sessionStorage, "central");
  savePendingLink(sessionStorage, {
    id: "synthetic-id",
    secret: "synthetic-proof",
    expiresAt: Date.now() + 60000,
  });
  prepareIdentitySignOut(sessionStorage);
  expect(readPendingLink(sessionStorage)).toBeNull();
  expect(readProviderPreference(sessionStorage)).toBe("central");
  expect(
    resolveIdentityConfig(
      central,
      "/tasks",
      readProviderPreference(sessionStorage),
    ).provider,
  ).toBe("central");
  expect(
    resolveIdentityConfig(central, identityPaths.legacyLink, "central")
      .provider,
  ).toBe("legacy");
  expect(
    resolveIdentityConfig(
      { VITE_CLERK_PUBLISHABLE_KEY: "legacy" },
      "/tasks",
      "central",
    ).provider,
  ).toBe("legacy");
  expect(
    resolveIdentityConfig(
      { ...central, VITE_KAZI_IDENTITY_MODE: "shared" },
      "/tasks",
      "legacy",
    ).provider,
  ).toBe("central");
});
it("fails closed for partial, incorrect, or absent shared identity configuration", () => {
  for (const env of [
    { VITE_KAZI_IDENTITY_MODE: "shared" },
    { ...central, VITE_IYANJU_ACCOUNT_ORIGIN: "https://untrusted.example" },
    { ...central, VITE_IYANJU_ACCOUNT_ORIGIN: "http://localhost:49569" },
    {
      ...central,
      VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_live_wrong_environment",
    },
    { ...central, VITE_KAZI_IDENTITY_MODE: "other" },
  ])
    expect(resolveIdentityConfig(env, "/").error).toBeTruthy();
  expect(
    resolveIdentityConfig({}, identityPaths.legacyLink).error,
  ).toBeTruthy();
});
it("does not prevent sign-out when browser storage is blocked", () => {
  expect(() =>
    prepareIdentitySignOut({
      removeItem: () => {
        throw new Error("Synthetic blocked storage");
      },
    } as unknown as Storage),
  ).not.toThrow();
});
it("keeps task and invitation destinations in per-tab storage, with a fixed public callback", () => {
  const config = resolveIdentityConfig(central, "/tasks");
  const path = "/join?invitation=synthetic-private-invite";
  rememberReturn(
    sessionStorage,
    "/join",
    "?invitation=synthetic-private-invite",
  );
  rememberReturn(sessionStorage, identityPaths.legacyLink);
  expect(readReturn(sessionStorage)).toBe(path);
  const url = new URL(centralAccountUrl(config, "http://127.0.0.1:5192"));
  expect(url.origin).toBe(central.VITE_IYANJU_ACCOUNT_ORIGIN);
  expect(url.searchParams.get("redirect_url")).toBe(
    "http://127.0.0.1:5192/account/return",
  );
  expect(url.href).not.toContain("invitation");
  expect(consumeReturn(sessionStorage)).toBe(path);
  expect(readReturn(sessionStorage)).toBe("/");
  expect(
    new URL(centralAccountUrl(config, "http://127.0.0.1:5192", true)).pathname,
  ).toBe("/account/sign-up");
  expect(() => centralAccountUrl(config, "https://attacker.example")).toThrow();
  expect(() => centralAccountUrl(config, "http://127.0.0.1:5193")).toThrow();
});
it("rejects external, malformed, and looping return destinations", () => {
  for (const path of [
    "//attacker.example",
    "https://attacker.example",
    "/\\attacker.example",
    "/tasks\n",
    "/%0Atasks",
    "/account",
    "/account/return",
    null,
  ])
    expect(safeReturnPath(path)).toBe("/");
  expect(safeReturnPath("/project/opaque/task/opaque?view=board")).toBe(
    "/project/opaque/task/opaque?view=board",
  );
});
it("stores only one-use link proof, expires it, and rejects malformed storage", () => {
  const proof = {
    id: "synthetic-id",
    secret: "synthetic-proof",
    expiresAt: 2000,
    legacyDisplay: { name: "Private name", email: "private@example.test" },
  };
  savePendingLink(sessionStorage, proof);
  expect(readPendingLink(sessionStorage, 1000)).toEqual({
    id: proof.id,
    secret: proof.secret,
    expiresAt: 2000,
  });
  expect(JSON.stringify(sessionStorage)).not.toContain("Private name");
  expect(readPendingLink(sessionStorage, 2000)).toBeNull();
  expect(readPendingLink(sessionStorage, 1000)).toBeNull();
  savePendingLink(sessionStorage, proof);
  clearPendingLink(sessionStorage);
  expect(readPendingLink(sessionStorage, 1000)).toBeNull();
});
