import type { AuthConfig } from "convex/server";

export type IdentityEnvironment = "development" | "preview" | "production";
export type IdentityConfig =
  | { mode: "legacy"; environment?: IdentityEnvironment; legacyIssuer?: string }
  | {
      mode: "shared";
      environment: IdentityEnvironment;
      legacyIssuer: string;
      legacyAuthEnabled: boolean;
      centralIssuer: string;
      origins: string[];
    };

const environments = new Set(["development", "preview", "production"]);
const configurationError = () =>
  new Error("Kazi shared identity configuration is incomplete or invalid.");

function issuerOrigin(value: string | undefined): string {
  if (!value || value.length > 300) throw configurationError();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value.replace(/\/$/, "") !== url.origin
  )
    throw configurationError();
  return url.origin;
}

export function identityConfig(
  env: Record<string, string | undefined> = process.env,
): IdentityConfig {
  const mode = env.KAZI_IDENTITY_MODE ?? "legacy";
  const environment = env.KAZI_IDENTITY_ENVIRONMENT;
  if (mode === "legacy")
    return {
      mode,
      ...(environment && environments.has(environment)
        ? { environment: environment as IdentityEnvironment }
        : {}),
      ...(env.CLERK_JWT_ISSUER_DOMAIN
        ? { legacyIssuer: env.CLERK_JWT_ISSUER_DOMAIN }
        : {}),
    };
  if (mode !== "shared" || !environment || !environments.has(environment))
    throw configurationError();
  const legacyAuth = env.KAZI_LEGACY_AUTH_ENABLED ?? "true";
  if (legacyAuth !== "true" && legacyAuth !== "false")
    throw configurationError();
  const legacyIssuer = issuerOrigin(env.CLERK_JWT_ISSUER_DOMAIN),
    centralIssuer = issuerOrigin(env.IYANJU_CLERK_ISSUER_DOMAIN);
  if (legacyIssuer === centralIssuer) throw configurationError();
  const configured = env.KAZI_AUTH_ORIGINS;
  if (!configured || configured.length > 3000) throw configurationError();
  let values: unknown;
  try {
    values = configured.trim().startsWith("[")
      ? JSON.parse(configured)
      : configured.split(",").map((part) => part.trim());
  } catch {
    throw configurationError();
  }
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > 8 ||
    values.some((value) => typeof value !== "string" || !value)
  )
    throw configurationError();
  const origins = [...new Set(values as string[])].map((value) => {
    const url = new URL(value);
    const local =
      environment === "development" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      !(url.protocol === "https:" || local) ||
      value.includes("*") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value.replace(/\/$/, "") !== url.origin
    )
      throw configurationError();
    return url.origin;
  });
  return {
    mode,
    environment: environment as IdentityEnvironment,
    legacyIssuer,
    legacyAuthEnabled: legacyAuth === "true",
    centralIssuer,
    origins: [...new Set(origins)],
  };
}

export function identityAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig {
  const config = identityConfig(env);
  if (config.mode === "shared")
    return {
      providers: [
        ...(config.legacyAuthEnabled ? [config.legacyIssuer] : []),
        config.centralIssuer,
      ].map((issuer) => ({
        type: "customJwt" as const,
        issuer,
        applicationID: "convex",
        algorithm: "RS256" as const,
        jwks: issuer + "/.well-known/jwks.json",
      })),
    };
  const issuer = config.legacyIssuer ?? "https://unconfigured.invalid";
  const local = issuer === "http://127.0.0.1:5173";
  if (local && !env.CONVEX_SITE_URL?.startsWith("http://127.0.0.1:"))
    throw new Error(
      "Local development authentication is restricted to the loopback Convex backend.",
    );
  return {
    providers: local
      ? [
          {
            type: "customJwt",
            issuer,
            applicationID: "kazi-local",
            algorithm: "RS256",
            jwks: env.KAZI_LOCAL_JWKS!,
          },
        ]
      : [{ domain: issuer, applicationID: "convex" }],
  };
}
