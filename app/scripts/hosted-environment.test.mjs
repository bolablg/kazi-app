import test from "node:test";
import assert from "node:assert/strict";
import {
  hostedMcpConfiguration,
  validateHostedEnvironment,
} from "./hosted-environment.mjs";

const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "dev-bola",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CONVEX_DEPLOY_KEY: "preview:fixture:fixture|not-a-real-key",
};
const production = {
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
  CONVEX_DEPLOY_KEY: "prod:fixture|not-a-real-key",
};
const key = (environment, host) =>
  `pk_${environment}_${Buffer.from(host + "$", "utf8")
    .toString("base64")
    .replace(/=+$/, "")}`;
const sharedProduction = {
  ...production,
  VITE_CLERK_PUBLISHABLE_KEY: key("live", "clerk.kazi.iyanju.com"),
  VITE_IYANJU_CLERK_PUBLISHABLE_KEY: key("live", "clerk.iyanju.com"),
  VITE_IYANJU_ACCOUNT_ORIGIN: "https://iyanju.com",
  VITE_KAZI_IDENTITY_MODE: "shared",
};

test("production supports additive account linking before changing the default provider", () => {
  assert.doesNotThrow(() => validateHostedEnvironment(sharedProduction));
  assert.doesNotThrow(() =>
    validateHostedEnvironment({
      ...sharedProduction,
      VITE_KAZI_IDENTITY_MODE: "legacy",
    }),
  );
});

test("partial, spoofed, and cross-environment shared identity configuration fails closed", () => {
  for (const change of [
    { VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "" },
    { VITE_IYANJU_ACCOUNT_ORIGIN: "" },
    { VITE_KAZI_IDENTITY_MODE: "unknown" },
    {
      VITE_IYANJU_CLERK_PUBLISHABLE_KEY: key(
        "test",
        "central-fixture.clerk.accounts.dev",
      ),
    },
    {
      VITE_IYANJU_CLERK_PUBLISHABLE_KEY: key(
        "live",
        "central-fixture.clerk.accounts.dev",
      ),
    },
    {
      VITE_IYANJU_CLERK_PUBLISHABLE_KEY:
        sharedProduction.VITE_CLERK_PUBLISHABLE_KEY,
    },
    { VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_live_not_a_valid_host" },
    { VITE_CLERK_PUBLISHABLE_KEY: key("live", "other.example") },
  ])
    assert.throws(() =>
      validateHostedEnvironment({ ...sharedProduction, ...change }),
    );
  assert.throws(() =>
    validateHostedEnvironment({
      ...production,
      VITE_IYANJU_CLERK_PUBLISHABLE_KEY:
        sharedProduction.VITE_IYANJU_CLERK_PUBLISHABLE_KEY,
    }),
  );
});

test("account redirects reject alternate hosts, embedded credentials and private payloads", () => {
  for (const VITE_IYANJU_ACCOUNT_ORIGIN of [
    "http://iyanju.com",
    "https://accounts.iyanju.com",
    "https://attacker.example",
    "https://user@iyanju.com",
    "https://iyanju.com:8443",
    "https://iyanju.com/account",
    "https://iyanju.com?redirect_url=https://attacker.example",
    "https://iyanju.com#private-token",
    "https://*.iyanju.com",
  ])
    assert.throws(() =>
      validateHostedEnvironment({
        ...sharedProduction,
        VITE_IYANJU_ACCOUNT_ORIGIN,
      }),
    );
});

test("unreviewed hosted preview sign-in cannot enable central trust through frontend settings", () => {
  assert.throws(
    () =>
      validateHostedEnvironment({
        ...preview,
        VITE_CLERK_PUBLISHABLE_KEY: key(
          "test",
          "legacy-fixture.clerk.accounts.dev",
        ),
        VITE_IYANJU_CLERK_PUBLISHABLE_KEY: key(
          "test",
          "central-fixture.clerk.accounts.dev",
        ),
        VITE_IYANJU_ACCOUNT_ORIGIN:
          "https://identity-preview-fixture.vercel.app",
        VITE_KAZI_IDENTITY_MODE: "shared",
      }),
    /separately verified exact return-origin/,
  );
});
test("development and staging use isolated preview backends", () => {
  assert.doesNotThrow(() => validateHostedEnvironment(preview));
  assert.doesNotThrow(() =>
    validateHostedEnvironment({ ...preview, VERCEL_GIT_COMMIT_REF: "staging" }),
  );
});
test("production requires main and live credentials", () => {
  assert.doesNotThrow(() => validateHostedEnvironment(production));
  assert.throws(() =>
    validateHostedEnvironment({
      ...production,
      VERCEL_GIT_COMMIT_REF: "dev-bola",
    }),
  );
});
test("cross-environment credentials and missing credentials fail closed", () => {
  for (const env of [preview, production]) {
    assert.throws(() =>
      validateHostedEnvironment({ ...env, CONVEX_DEPLOY_KEY: "" }),
    );
    assert.throws(() =>
      validateHostedEnvironment({ ...env, VITE_CLERK_PUBLISHABLE_KEY: "" }),
    );
    assert.throws(() =>
      validateHostedEnvironment({ ...env, VITE_KAZI_LOCAL_DEV: "true" }),
    );
  }
  assert.throws(() =>
    validateHostedEnvironment({
      ...preview,
      CONVEX_DEPLOY_KEY: production.CONVEX_DEPLOY_KEY,
    }),
  );
  assert.throws(() =>
    validateHostedEnvironment({
      ...production,
      CONVEX_DEPLOY_KEY: preview.CONVEX_DEPLOY_KEY,
    }),
  );
  assert.throws(() =>
    validateHostedEnvironment({
      ...preview,
      VITE_CLERK_PUBLISHABLE_KEY: production.VITE_CLERK_PUBLISHABLE_KEY,
    }),
  );
  assert.throws(() =>
    validateHostedEnvironment({ ...preview, VERCEL_GIT_COMMIT_REF: "main" }),
  );
});

test("MCP uses the exact Convex deployment selected for each hosted build", () => {
  assert.deepEqual(
    hostedMcpConfiguration({
      ...production,
      VITE_CONVEX_URL: "https://production-fixture.convex.cloud",
      VITE_KAZI_MCP_URL: "https://stale.example/mcp",
    }),
    {
      environment: "production",
      upstream: "https://production-fixture.convex.site/mcp",
      applicationUrl: "https://kazi.iyanju.com",
      publicEndpoint: "https://kazi.iyanju.com/mcp",
    },
  );
  const configuration = hostedMcpConfiguration({
    ...preview,
    VITE_CONVEX_URL: "https://branch-fixture.convex.cloud",
    VERCEL_BRANCH_URL: "kazi-git-dev-bola-fixture.vercel.app",
  });
  assert.equal(
    configuration.upstream,
    "https://branch-fixture.convex.site/mcp",
  );
  assert.equal(
    configuration.publicEndpoint,
    "https://kazi-git-dev-bola-fixture.vercel.app/mcp",
  );
});

test("MCP hosted builds reject missing, malformed, and cross-environment routing", () => {
  for (const VERCEL_ENV of [undefined, "development", "other"])
    assert.throws(() => validateHostedEnvironment({ ...preview, VERCEL_ENV }));
  for (const VITE_CONVEX_URL of [
    undefined,
    "http://127.0.0.1:3210",
    "https://attacker.example/",
    "https://user@branch-fixture.convex.cloud",
    "https://branch-fixture.convex.cloud/other",
    "https://branch-fixture.convex.cloud?target=production",
  ])
    assert.throws(() =>
      hostedMcpConfiguration({
        ...preview,
        VITE_CONVEX_URL,
        VERCEL_BRANCH_URL: "kazi-git-fixture.vercel.app",
      }),
    );
  for (const VERCEL_BRANCH_URL of [
    undefined,
    "kazi.iyanju.com",
    "x.vercel.app/other",
  ])
    assert.throws(() =>
      hostedMcpConfiguration({
        ...preview,
        VITE_CONVEX_URL: "https://branch-fixture.convex.cloud",
        VERCEL_BRANCH_URL,
      }),
    );
});
