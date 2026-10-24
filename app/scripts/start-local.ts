import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const file = ".env.convex.local";
if (!existsSync(file))
  writeFileSync(file, "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n", {
    mode: 0o600,
    flag: "wx",
  });
if (!/^CONVEX_DEPLOYMENT=anonymous:/m.test(readFileSync(file, "utf8")))
  throw new Error(
    "backend:local only accepts the isolated anonymous development deployment.",
  );
const temporaryDirectory = resolve(".convex/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const child = spawn(
  process.execPath,
  ["node_modules/convex/bin/main.js", "dev", "--env-file", file],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CONVEX_AGENT_MODE: "anonymous",
      CONVEX_TMPDIR: temporaryDirectory,
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
