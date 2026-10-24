import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { localKeys, localIssuer, localSubject } from "./local-auth";
const envFile = ".env.convex.local";
if (
  !existsSync(envFile) ||
  !/^CONVEX_DEPLOYMENT=anonymous:/m.test(readFileSync(envFile, "utf8"))
)
  throw new Error(
    "Start npm run backend:local first. This setup only targets the isolated anonymous local deployment.",
  );
const cli = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/convex/bin/main.js", ...args, "--env-file", envFile],
      {
        env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(error)),
    );
  });
const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify(localKeys().jwks)).toString("base64")}`;
await cli(["env", "set", "KAZI_LOCAL_JWKS", jwks]);
await cli(["env", "set", "CLERK_JWT_ISSUER_DOMAIN", localIssuer]);
await cli(["env", "set", "APP_ORIGIN", localIssuer]);
const identity = JSON.stringify({
  subject: localSubject,
  name: "Local Developer",
  email: "developer@localhost.test",
  emailVerified: true,
});
let ready = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const scopes = JSON.parse(
      await cli(["run", "commands:workspaces", "{}", "--identity", identity]),
    );
    if (scopes.length === 0) {
      await cli(["env", "set", "ALLOW_SYNTHETIC_SEED", "true"]);
      try {
        await cli(["run", "seed:demo", "{}", "--identity", identity]);
      } finally {
        await cli(["env", "remove", "ALLOW_SYNTHETIC_SEED"]);
      }
    }
    ready = true;
    break;
  } catch (error) {
    if (attempt === 19) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
if (!ready) throw new Error("The local backend did not become ready.");
const localEnv = existsSync(".env.local")
  ? readFileSync(".env.local", "utf8")
  : "";
// Keep Convex's CLI selection, while frontend loopback settings apply only to dev.
writeFileSync(
  ".env.local",
  localEnv.replace(/^VITE_CONVEX_(?:URL|SITE_URL)=.*\n?/gm, ""),
  { mode: 0o600 },
);
let frontendEnv = existsSync(".env.development.local")
  ? readFileSync(".env.development.local", "utf8")
  : "";
frontendEnv = frontendEnv.replace(
  /^VITE_(?:KAZI_LOCAL_DEV|CONVEX_URL)=.*\n?/gm,
  "",
);
writeFileSync(
  ".env.development.local",
  frontendEnv +
    "\nVITE_KAZI_LOCAL_DEV=true\nVITE_CONVEX_URL=http://127.0.0.1:3210\n",
  { mode: 0o600 },
);
console.log(
  "Local Convex and the development session are ready. Run npm run dev and open http://127.0.0.1:5173. Keep npm run backend:local running.",
);
