import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { hostedMcpConfiguration } from "./hosted-environment.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const configuration = hostedMcpConfiguration(process.env);
writeFileSync(
  new URL("../server/mcp-deployment.js", import.meta.url),
  `// Generated for this deployment; do not reuse across environments.\nexport default ${JSON.stringify({ environment: configuration.environment, upstream: configuration.upstream })};\n`,
);
// Vite and the server manifest are generated from the same Convex injection.
// Ignore any stale public MCP endpoint copied into platform environment values.
process.env.VITE_KAZI_MCP_URL = configuration.publicEndpoint;

if (configuration.environment === "preview") {
  const backend = new URL(process.env.VITE_CONVEX_URL);
  // Invitations and callbacks must return to this branch's frontend and data.
  run("npx", [
    "convex",
    "env",
    "set",
    "APP_ORIGIN",
    configuration.applicationUrl,
    "--deployment",
    backend.hostname.split(".")[0],
  ]);
}
run("npm", ["run", "build"]);
