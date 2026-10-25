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
