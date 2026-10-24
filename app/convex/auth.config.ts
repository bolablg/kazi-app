import type { AuthConfig } from "convex/server";
const issuer =
  process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://unconfigured.invalid";
const local = issuer === "http://127.0.0.1:5173";
if (local && !process.env.CONVEX_SITE_URL?.startsWith("http://127.0.0.1:"))
  throw new Error(
    "Local development authentication is restricted to the loopback Convex backend.",
  );
export default {
  providers: local
    ? [
        {
          type: "customJwt",
          issuer,
          applicationID: "kazi-local",
          algorithm: "RS256",
          jwks: process.env.KAZI_LOCAL_JWKS!,
        },
      ]
    : [{ domain: issuer, applicationID: "convex" }],
} satisfies AuthConfig;
