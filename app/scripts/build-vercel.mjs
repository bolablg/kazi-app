import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { loadEnv } from "vite";
import { validateHostedEnvironment } from "./hosted-environment.mjs";

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
// Never reuse another deployment's cached proxy target.
rmSync(new URL("../server/mcp-deployment.js", import.meta.url), {
  force: true,
});
validateHostedEnvironment(env);
// Convex injects the URL of this exact deployment into the frontend build.
// Preview keys create/reuse a backend per Git branch, including staging.
const result = spawnSync(
  "npx",
  [
    "convex",
    "deploy",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
    "--cmd",
    "node scripts/build-hosted-client.mjs",
  ],
  { env, stdio: "inherit", shell: false },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
