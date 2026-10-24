import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
if (env.VITE_KAZI_LOCAL_DEV === "true")
  throw new Error("Local development authentication cannot be deployed.");
if (
  !env.VITE_CONVEX_URL?.startsWith("https://") ||
  !env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error(
    "Production deployment requires an HTTPS Convex URL and a production Clerk publishable key. Review the Free plan and domain setup in docs/DEPLOYMENT.md first.",
  );
console.log(
  "Production frontend environment is configured. Verify account eligibility and free-plan hard caps before deployment.",
);
