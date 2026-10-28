import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { identityConfig, type IdentityConfig } from "./identityConfig";
import {
  assertCentralServiceEligibility,
  serviceAccessMode,
} from "./serviceEligibility";

type AuthCtx = Pick<QueryCtx, "auth"> & {
  meta: QueryCtx["meta"] | MutationCtx["meta"] | ActionCtx["meta"];
};
type DbCtx = QueryCtx | MutationCtx;
export type Provider = "legacy" | "central";
export type Principal = {
  config: IdentityConfig;
  provider: Provider;
  issuer: string;
  subject: string;
  identity: UserIdentity;
};
export type CanonicalIdentity = UserIdentity & {
  authenticatedIssuer: string;
  authenticatedSubject: string;
};

export function identityFailure(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export function assertActiveSession(claims: Record<string, unknown>) {
  if (claims.sts !== undefined && claims.sts !== "active")
    identityFailure("SESSION_PENDING", "Finish signing in before using Kazi.");
}

/** Read only the token already authenticated by Convex. This is deliberately
 * not a verifier for tokens supplied through arguments. Provider configuration
 * pins signature, issuer, algorithm and audience before this context exists. */
export function boundAuthenticatedClaims(
  token: string,
  identity: Pick<UserIdentity, "issuer" | "subject">,
  now = Date.now(),
): Record<string, unknown> {
  if (token.length > 16384)
    identityFailure("AUTH_CLAIMS", "The authenticated session is invalid.");
  const parts = token.split(".");
  if (parts.length !== 3)
    identityFailure("AUTH_CLAIMS", "The authenticated session is invalid.");
  let claims: Record<string, unknown>;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      ),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid payload");
    claims = parsed as Record<string, unknown>;
  } catch {
    identityFailure("AUTH_CLAIMS", "The authenticated session is invalid.");
  }
  const audience = claims.aud;
  if (
    claims.iss !== identity.issuer ||
    claims.sub !== identity.subject ||
    !(
      audience === "convex" ||
      (Array.isArray(audience) &&
        audience.length === 1 &&
        audience[0] === "convex")
    ) ||
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now / 1000 ||
    typeof claims.iat !== "number" ||
    !Number.isFinite(claims.iat) ||
    claims.iat < 0 ||
    claims.iat > now / 1000 + 60 ||
    claims.exp <= claims.iat ||
    (claims.nbf !== undefined &&
      (typeof claims.nbf !== "number" ||
        !Number.isFinite(claims.nbf) ||
        claims.nbf > now / 1000 + 60))
  )
    identityFailure("AUTH_CLAIMS", "The authenticated session is invalid.");
  assertActiveSession(claims);
  return claims;
}

export function hasFreshVerification(
  claims: Record<string, unknown>,
  now = Date.now(),
) {
  const ages = claims.fva;
  if (
    !Array.isArray(ages) ||
    ages.length !== 2 ||
    ages.some(
      (age) =>
        typeof age !== "number" ||
        !Number.isFinite(age) ||
        !(age === -1 || age >= 0),
    ) ||
    typeof claims.iat !== "number" ||
    !Number.isFinite(claims.iat)
  )
    return false;
  const elapsed = Math.max(0, (now / 1000 - claims.iat) / 60);
  // Match Clerk's multi_factor / afterMinutes:10 semantics. A negative second
  // factor age does not prove whether MFA is configured; it uses Clerk's fallback.
  return (
    ages[0] >= 0 &&
    ages[0] + elapsed < 10 &&
    (ages[1] === -1 || ages[1] + elapsed < 10)
  );
}

export type ReverificationReason =
  | "auth_metadata_unavailable"
  | "factor_age_missing"
  | "factor_age_stale_or_invalid";

export function reverificationReason(
  authenticatedToken: boolean,
  claims: Record<string, unknown>,
  now = Date.now(),
): ReverificationReason | null {
  if (!authenticatedToken) return "auth_metadata_unavailable";
  if (claims.fva === undefined) return "factor_age_missing";
  return hasFreshVerification(claims, now)
    ? null
    : "factor_age_stale_or_invalid";
}

export function normalizeIdentity(
  identity: UserIdentity,
  claims: Record<string, unknown> = identity,
): UserIdentity {
  const text = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    ...identity,
    name: text(claims.name) ?? text(identity.name),
    email: text(claims.email) ?? text(identity.email),
    preferredUsername:
      text(claims.preferred_username) ?? text(identity.preferredUsername),
    emailVerified: Object.hasOwn(claims, "email_verified")
      ? claims.email_verified === true
      : typeof identity.emailVerified === "boolean"
        ? identity.emailVerified
        : undefined,
  };
}

export async function verifiedPrincipal(
  ctx: AuthCtx,
  options: { fresh?: boolean } = {},
): Promise<Principal> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) identityFailure("UNAUTHENTICATED", "Sign in to continue.");
  if (!identity.subject || identity.subject.length > 180)
    identityFailure("AUTH_CLAIMS", "The authenticated session is invalid.");
  assertActiveSession(identity);
  const config = identityConfig();
  const accessMode = serviceAccessMode();
  if (config.mode === "legacy") {
    if (accessMode === "strict")
      identityFailure(
        "SERVICE_ACCESS_CONFIG",
        "Strict service eligibility requires shared identity mode.",
      );
    if (options.fresh)
      identityFailure("IDENTITY_DISABLED", "Account linking is not enabled.");
    return {
      config,
      provider: "legacy",
      issuer: identity.issuer,
      subject: identity.subject,
      identity: normalizeIdentity(identity),
    };
  }
  const provider =
    config.legacyAuthEnabled && identity.issuer === config.legacyIssuer
      ? "legacy"
      : identity.issuer === config.centralIssuer
        ? "central"
        : undefined;
  if (!provider)
    identityFailure("AUTH_ISSUER", "This account issuer is not trusted.");
  let claims: Record<string, unknown> = identity;
  let authenticatedToken = false;
  if ("getRequestMetadata" in ctx.meta) {
    const metadata = await ctx.meta.getRequestMetadata();
    if (metadata.authToken) {
      claims = boundAuthenticatedClaims(metadata.authToken, identity);
      authenticatedToken = true;
    }
  }
  // Queries do not expose the original token. Custom-JWT azp propagation must
  // be verified on the real provider before enabling shared mode. Missing azp
  // fails closed instead of trusting a caller's origin argument or HTTP header.
  if (typeof claims.azp !== "string" || !config.origins.includes(claims.azp))
    identityFailure("AUTH_ORIGIN", "This session is not authorized for Kazi.");
  assertActiveSession(claims);
  if (provider === "central")
    assertCentralServiceEligibility(
      claims,
      identity.subject,
      authenticatedToken ? "jwt" : "convex",
    );
  if (options.fresh) {
    const reason = reverificationReason(authenticatedToken, claims);
    if (reason)
      throw new ConvexError({
        code: "REVERIFICATION_REQUIRED",
        message: "Verify your account again before linking identities.",
        reason,
      });
  }
  return {
    config,
    provider,
    issuer: identity.issuer,
    subject: identity.subject,
    identity: normalizeIdentity(identity, claims),
  };
}

export async function legacyActorExists(ctx: DbCtx, actorId: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .unique();
  if (profile) return true;
  return !!(await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .first());
}

export async function canonicalActor(
  ctx: DbCtx,
  principal: Principal,
): Promise<string | null> {
  if (principal.config.mode === "legacy") return principal.subject;
  const alias = await ctx.db
    .query("identityAliases")
    .withIndex("by_identity", (q) =>
      q
        .eq("environment", principal.config.environment!)
        .eq("issuer", principal.issuer)
        .eq("subject", principal.subject),
    )
    .unique();
  if (alias) {
    if (
      alias.provider !== principal.provider ||
      (principal.provider === "legacy" && alias.actorId !== principal.subject)
    )
      identityFailure("IDENTITY_MAPPING", "This account mapping is invalid.");
    return alias.actorId;
  }
  if (
    principal.provider === "legacy" &&
    (await legacyActorExists(ctx, principal.subject))
  )
    return principal.subject;
  return null;
}

export async function canonicalIdentity(
  ctx: DbCtx,
  verified?: Principal,
): Promise<CanonicalIdentity> {
  const principal = verified ?? (await verifiedPrincipal(ctx));
  const actorId = await canonicalActor(ctx, principal);
  if (!actorId)
    identityFailure(
      "IDENTITY_UNLINKED",
      principal.provider === "legacy"
        ? "Create new accounts through iYANJU. Existing Kazi accounts can be linked."
        : "Link your existing Kazi account or explicitly start a new personal workspace.",
    );
  return {
    ...principal.identity,
    subject: actorId,
    authenticatedIssuer: principal.issuer,
    authenticatedSubject: principal.subject,
  };
}

export async function actionIdentity(
  ctx: ActionCtx,
): Promise<CanonicalIdentity> {
  const principal = await verifiedPrincipal(ctx);
  const actorId: string | null = await ctx.runQuery(
    internal.identity.resolveFor,
    { issuer: principal.issuer, subject: principal.subject },
  );
  if (!actorId)
    identityFailure(
      "IDENTITY_UNLINKED",
      "Link your existing Kazi account or explicitly start a new personal workspace.",
    );
  return {
    ...principal.identity,
    subject: actorId,
    authenticatedIssuer: principal.issuer,
    authenticatedSubject: principal.subject,
  };
}

export async function recordServiceEntry(
  ctx: MutationCtx,
  principal: Principal,
  actorId: string,
) {
  if (principal.config.mode !== "shared") return;
  const environment = principal.config.environment;
  const prior = await ctx.db
    .query("serviceActivations")
    .withIndex("by_identity", (q) =>
      q
        .eq("environment", environment)
        .eq("serviceId", "kazi")
        .eq("actorId", actorId),
    )
    .unique();
  if (prior) return;
  const alias = await ctx.db
    .query("identityAliases")
    .withIndex("by_identity", (q) =>
      q
        .eq("environment", environment)
        .eq("issuer", principal.issuer)
        .eq("subject", principal.subject),
    )
    .unique();
  const now = Date.now();
  const newlyRegistered = alias?.registrationKind === "new";
  await ctx.db.insert("serviceActivations", {
    environment,
    actorId,
    serviceId: "kazi",
    activatedAt: newlyRegistered ? now : null,
    firstObservedAt: now,
    provenance: newlyRegistered
      ? "new-authorized-entry"
      : "legacy-history-unknown",
  });
}
