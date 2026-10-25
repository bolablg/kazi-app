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
