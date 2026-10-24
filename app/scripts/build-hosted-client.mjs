import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "preview") {
  const backend = new URL(process.env.VITE_CONVEX_URL);
  const branchHost = process.env.VERCEL_BRANCH_URL;
  if (
    backend.protocol !== "https:" ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.cloud$/.test(backend.hostname) ||
    !branchHost ||
    !/^[a-z0-9-]+\.vercel\.app$/.test(branchHost)
  )
    throw new Error(
      "A Git preview requires its Convex backend and stable Vercel branch URL.",
    );
  // Invitations and callbacks must return to this branch's frontend and data.
  run("npx", [
    "convex",
    "env",
    "set",
    "APP_ORIGIN",
    `https://${branchHost}`,
    "--deployment",
    backend.hostname.split(".")[0],
  ]);
}
run("npm", ["run", "build"]);
