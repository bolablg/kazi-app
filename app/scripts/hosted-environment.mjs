export function validateHostedEnvironment(env) {
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
