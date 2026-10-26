function publishableKeyHost(key) {
  const encoded = key.replace(/^pk_(?:live|test)_/, "");
  if (!/^[A-Za-z0-9+/_=-]+$/.test(encoded))
    throw new Error("Configure a valid Clerk publishable key.");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const match = /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)\$$/.exec(decoded);
  if (!match || match[1].includes(".."))
    throw new Error("Configure a valid Clerk Frontend API host.");
  return match[1];
}

function validateHostedIdentity(env, production) {
  const mode = env.VITE_KAZI_IDENTITY_MODE ?? "legacy";
  if (!["legacy", "shared"].includes(mode))
    throw new Error("Choose legacy or shared identity mode.");
  const centralKey = env.VITE_IYANJU_CLERK_PUBLISHABLE_KEY;
  const accountOrigin = env.VITE_IYANJU_ACCOUNT_ORIGIN;
  if (mode === "legacy" && !centralKey && !accountOrigin) return;
  if (!centralKey || !accountOrigin)
    throw new Error(
      "Configure both the central Clerk publishable key and iYANJU account origin before enabling account linking.",
    );
  if (!centralKey.startsWith(production ? "pk_live_" : "pk_test_"))
    throw new Error(
      "Central and legacy Clerk keys must use the same environment.",
    );
  const legacyHost = publishableKeyHost(env.VITE_CLERK_PUBLISHABLE_KEY);
  const centralHost = publishableKeyHost(centralKey);
  if (legacyHost === centralHost)
    throw new Error("The central directory must be distinct from legacy Kazi.");
  let origin;
  try {
    origin = new URL(accountOrigin);
  } catch {
    throw new Error("Configure one exact HTTPS iYANJU account origin.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.hostname.includes("*")
  )
    throw new Error("Hosted account sign-in requires one exact HTTPS origin.");
  if (!production)
    throw new Error(
      "Shared identity on hosted previews requires a separately verified exact return-origin and session configuration. Keep previews in legacy mode until that rollout is reviewed.",
    );
  if (
    origin.origin !== "https://iyanju.com" ||
    centralHost !== "clerk.iyanju.com" ||
    legacyHost !== "clerk.kazi.iyanju.com"
  )
    throw new Error(
      "Production account linking requires the approved iYANJU and legacy Kazi directories and canonical account origin.",
    );
}

export function validateHostedEnvironment(env) {
  if (!["production", "preview"].includes(env.VERCEL_ENV))
    throw new Error(
      "A hosted build requires a Vercel production or preview environment.",
    );
  const production = env.VERCEL_ENV === "production";
  const branch = env.VERCEL_GIT_COMMIT_REF;
  if (env.VITE_KAZI_LOCAL_DEV === "true")
    throw new Error("Local authentication cannot be hosted.");
  if (production && branch && branch !== "main")
    throw new Error("Only main can deploy to production.");
  if (!production && branch === "main")
    throw new Error("main must use the production environment.");
  const prefix = production ? "pk_live_" : "pk_test_";
  if (!env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith(prefix))
    throw new Error(
      `Configure the ${production ? "production" : "development"} Clerk publishable key.`,
    );
  const deployKey = env.CONVEX_DEPLOY_KEY;
  if (!deployKey)
    throw new Error(
      "Configure a scoped CONVEX_DEPLOY_KEY for backend and frontend deployment.",
    );
  if (
    production
      ? !deployKey.startsWith("prod:")
      : !deployKey.startsWith("preview:")
  )
    throw new Error(
      "Production requires a production Convex key; previews require an isolated preview key.",
    );
  validateHostedIdentity(env, production);
}

/** Called only inside convex deploy --cmd, after it injects the exact backend. */
export function hostedMcpConfiguration(env) {
  validateHostedEnvironment(env);
  const backend = new URL(env.VITE_CONVEX_URL);
  if (
    backend.protocol !== "https:" ||
    backend.port ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.cloud$/.test(backend.hostname)
  )
    throw new Error(
      "The hosted MCP target must match the injected Convex backend.",
    );
  let applicationUrl = "https://kazi.iyanju.com";
  if (env.VERCEL_ENV === "preview") {
    const branchHost = env.VERCEL_BRANCH_URL;
    if (!branchHost || !/^[a-z0-9-]+\.vercel\.app$/.test(branchHost))
      throw new Error("A Git preview requires its stable Vercel branch URL.");
    applicationUrl = `https://${branchHost}`;
  }
  backend.hostname = backend.hostname.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  );
  return {
    environment: env.VERCEL_ENV,
    upstream: new URL("/mcp", backend).href,
    applicationUrl,
    publicEndpoint: `${applicationUrl}/mcp`,
  };
}
