import test from "node:test";
import assert from "node:assert/strict";
import { validateHostedEnvironment } from "./hosted-environment.mjs";

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
