import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
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

/** Emit only the actual production entrypoint and its local runtime modules.
 * No bundler, tsx loader, node_modules tree, inherited credentials or network. */
async function activationRuntimeFixture(
  manifestEnvironment,
  brokenImport = false,
) {
  const directory = await mkdtemp(join(tmpdir(), "kazi-activation-runtime-"));
  try {
    await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
    for (const relative of [
      "api/account/service-activation.ts",
      "server/service-activation-proxy.ts",
      "shared/serviceActivation.ts",
    ]) {
      const source = await readFile(
        new URL("../" + relative, import.meta.url),
        "utf8",
      );
      let emitted = stripTypeScriptTypes(source, {
        mode: "strip",
        sourceUrl: relative,
      });
      if (brokenImport && relative === "server/service-activation-proxy.ts") {
        assert.ok(emitted.includes('"../shared/serviceActivation.js"'));
        emitted = emitted.replace(
          '"../shared/serviceActivation.js"',
          '"../shared/serviceActivation"',
        );
      }
      const output = join(directory, relative.replace(/\.ts$/, ".js"));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, emitted);
    }
    await writeFile(
      join(directory, "server/mcp-deployment.js"),
      `export default ${JSON.stringify({ environment: manifestEnvironment, upstream: "https://runtime-fixture.convex.site/mcp" })};\n`,
    );
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function runActivationEntrypoint(
  directory,
  environment,
  authenticated = false,
) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from "node:assert/strict";
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://runtime-fixture.convex.site/account/service-activation");
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      assert.equal(init.credentials, "omit");
      assert.deepEqual(Object.fromEntries(new Headers(init.headers)), {
        accept: "application/json", authorization: "Bearer synthetic.payload.signature"
      });
      return Response.json({ version: 1, serviceId: "kazi", environment: "production",
        activation: { activatedAt: null, firstObservedAt: 12345 } });
    };
    const entrypoint = await import("./api/account/service-activation.js");
    const response = await entrypoint.default.fetch(new Request(
      "https://kazi.iyanju.com/api/account/service-activation",
      ${authenticated ? '{ headers: { Authorization: "Bearer synthetic.payload.signature", Cookie: "must-not-forward=1" } }' : "{}"}
    ));
    process.stdout.write(JSON.stringify({ status: response.status, body: await response.json(),
      cache: response.headers.get("Cache-Control"), calls }));
  `,
    ],
    {
      cwd: directory,
      // Keep native Node resolution free of inherited loaders and credentials.
      env: { VERCEL_ENV: environment, NODE_NO_WARNINGS: "1" },
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
}

for (const fixture of [
  {
    label: "preview stays unavailable",
    manifest: "preview",
    environment: "preview",
    status: 503,
  },
  {
    label: "production rejects missing authentication",
    manifest: "production",
    environment: "production",
    status: 401,
  },
  {
    label: "environment mismatch stays unavailable",
    manifest: "production",
    environment: "preview",
    status: 503,
  },
  {
    label: "production forwards the authorized summary",
    manifest: "production",
    environment: "production",
    authenticated: true,
    status: 200,
  },
]) {
  test(`native Node ESM activation entrypoint: ${fixture.label}`, async () => {
    const directory = await activationRuntimeFixture(fixture.manifest);
    try {
      const result = runActivationEntrypoint(
        directory,
        fixture.environment,
        fixture.authenticated,
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      const response = JSON.parse(result.stdout);
      assert.equal(response.status, fixture.status);
      assert.equal(response.cache, "private, no-store");
      assert.equal(response.calls, fixture.authenticated ? 1 : 0);
      if (fixture.authenticated)
        assert.deepEqual(response.body, {
          version: 1,
          serviceId: "kazi",
          environment: "production",
          activation: { activatedAt: null, firstObservedAt: 12345 },
        });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("native Node regression rejects the original extensionless runtime import", async () => {
  const directory = await activationRuntimeFixture("production", true);
  try {
    const result = runActivationEntrypoint(directory, "production");
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.match(result.stderr, /shared\/serviceActivation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
