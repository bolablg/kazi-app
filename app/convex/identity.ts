import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { randomToken, sha256 } from "./crypto";
import { createWorkspace } from "./store";
import { identityConfig } from "./identityConfig";
import {
  canonicalActor,
  identityFailure,
  legacyActorExists,
  verifiedPrincipal,
  type Principal,
} from "./identityCore";

const LINK_LIFETIME = 5 * 60000;
const secretPattern = /^[0-9a-f]{64}$/;
type DbCtx = QueryCtx | MutationCtx;
export type IdentityStatus = {
  mode: "legacy" | "shared";
  provider: "legacy" | "central";
  state: "ready" | "unlinked";
  actorId: string | null;
  canLinkLegacy: boolean;
  hasCentralIdentity: boolean;
  activation: null | {
    serviceId: "kazi";
    activatedAt: number | null;
    firstObservedAt: number;
    provenance: string;
  };
  accountCreatedAt: number | null;
};

export async function ownerIdentityExport(ctx: DbCtx, actorId: string) {
  const environment = identityConfig().environment;
  const aliases = environment
    ? await ctx.db
        .query("identityAliases")
        .withIndex("by_actor_provider", (q) =>
          q.eq("environment", environment).eq("actorId", actorId),
        )
        .collect()
    : [];
  const activation = environment
    ? await ctx.db
        .query("serviceActivations")
        .withIndex("by_identity", (q) =>
          q
            .eq("environment", environment)
            .eq("serviceId", "kazi")
            .eq("actorId", actorId),
        )
        .unique()
    : null;
  // Account metadata belongs to the requesting actor, independently of team
  // roles. Deliberately allowlist fields; linking challenges are never exported.
  return {
    canonicalActorId: actorId,
    environment: environment ?? null,
    identities: aliases.map((alias) => ({
      issuer: alias.issuer,
      subject: alias.subject,
      provider: alias.provider,
      registrationKind: alias.registrationKind,
      linkedAt: alias.linkedAt,
      accountCreatedAt: alias.accountCreatedAt ?? null,
    })),
    serviceActivations: activation
      ? [
          {
            serviceId: activation.serviceId,
            activatedAt: activation.activatedAt,
            firstObservedAt: activation.firstObservedAt,
            provenance: activation.provenance,
          },
        ]
      : [],
  };
}

export const exportFor = internalQuery({
  args: { actorId: v.string() },
  handler: (ctx, args) => ownerIdentityExport(ctx, args.actorId),
});

async function aliasFor(ctx: DbCtx, principal: Principal) {
  if (!principal.config.environment) return null;
  return ctx.db
    .query("identityAliases")
    .withIndex("by_identity", (q) =>
      q
        .eq("environment", principal.config.environment!)
        .eq("issuer", principal.issuer)
        .eq("subject", principal.subject),
    )
    .unique();
}

async function centralAlias(ctx: DbCtx, environment: string, actorId: string) {
  return ctx.db
    .query("identityAliases")
    .withIndex("by_actor_provider", (q) =>
      q
        .eq("environment", environment)
        .eq("actorId", actorId)
        .eq("provider", "central"),
    )
    .unique();
}

async function legacyDisplay(ctx: DbCtx, actorId: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .unique();
  if (profile) return { name: profile.name, email: profile.email };
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .first();
  return {
    name: membership?.data.name ?? "Kazi account",
    email: membership?.data.email ?? "",
  };
}

async function activeWorkspace(ctx: DbCtx, actorId: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .unique();
  if (profile?.activeWorkspaceId) {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", profile.activeWorkspaceId!).eq("key", actorId),
      )
      .unique();
    if (membership && (await ctx.db.get(profile.activeWorkspaceId)))
      return profile.activeWorkspaceId;
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", actorId))
    .first();
  return membership && (await ctx.db.get(membership.workspaceId))
    ? membership.workspaceId
    : undefined;
}

export const status = query({
  args: {},
  handler: async (ctx): Promise<IdentityStatus> => {
    const principal = await verifiedPrincipal(ctx);
    const actorId = await canonicalActor(ctx, principal);
    const environment = principal.config.environment;
    const alias = await aliasFor(ctx, principal);
    const central =
      actorId && environment
        ? await centralAlias(ctx, environment, actorId)
        : null;
    const activation =
      actorId && environment
        ? await ctx.db
            .query("serviceActivations")
            .withIndex("by_identity", (q) =>
              q
                .eq("environment", environment)
                .eq("serviceId", "kazi")
                .eq("actorId", actorId),
            )
            .unique()
        : null;
    return {
      mode: principal.config.mode,
      provider: principal.provider,
      state: actorId ? "ready" : "unlinked",
      actorId,
      canLinkLegacy:
        principal.config.mode === "shared" &&
        principal.provider === "legacy" &&
        !!actorId &&
        !central,
      hasCentralIdentity: !!central,
      activation: activation
        ? {
            serviceId: activation.serviceId,
            activatedAt: activation.activatedAt,
            firstObservedAt: activation.firstObservedAt,
            provenance: activation.provenance,
          }
        : null,
      // No creation date is inferred from iat, profile creation or browser data.
      accountCreatedAt: alias?.accountCreatedAt ?? null,
    };
  },
});

export const resolveFor = internalQuery({
  args: { issuer: v.string(), subject: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const config = identityConfig();
    if (config.mode === "legacy") return args.subject;
    const provider =
      config.legacyAuthEnabled && args.issuer === config.legacyIssuer
        ? "legacy"
        : args.issuer === config.centralIssuer
          ? "central"
          : undefined;
    if (!provider)
      identityFailure("AUTH_ISSUER", "This account issuer is not trusted.");
    return canonicalActor(ctx, {
      config,
      provider,
      issuer: args.issuer,
      subject: args.subject,
      identity: {
        issuer: args.issuer,
        subject: args.subject,
        tokenIdentifier: args.issuer + "|" + args.subject,
      },
    });
  },
});

export const beginLink = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    id: Id<"identityLinkChallenges">;
    secret: string;
    expiresAt: number;
    legacyDisplay: { name: string; email: string };
  }> => {
    const principal = await verifiedPrincipal(ctx, { fresh: true });
    if (principal.provider !== "legacy")
      identityFailure(
        "IDENTITY_PROVIDER",
        "Verify your existing Kazi account first.",
      );
    const secret = randomToken();
    const saved: {
      id: Id<"identityLinkChallenges">;
      expiresAt: number;
      legacyDisplay: { name: string; email: string };
    } = await ctx.runMutation(internal.identity.saveLink, {
      secretHash: await sha256(secret),
    });
    return { ...saved, secret };
  },
});

export const saveLink = internalMutation({
  args: { secretHash: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    id: Id<"identityLinkChallenges">;
    expiresAt: number;
    legacyDisplay: { name: string; email: string };
  }> => {
    const principal = await verifiedPrincipal(ctx, { fresh: true });
    if (
      principal.config.mode !== "shared" ||
      principal.provider !== "legacy" ||
      !secretPattern.test(args.secretHash) ||
      !(await legacyActorExists(ctx, principal.subject))
    )
      identityFailure("IDENTITY_LINK", "An existing Kazi account is required.");
    const environment = principal.config.environment;
    if (await centralAlias(ctx, environment, principal.subject))
      identityFailure(
        "IDENTITY_LINKED",
        "This Kazi account is already linked.",
      );
    const pending = await ctx.db
      .query("identityLinkChallenges")
      .withIndex("by_actor", (q) =>
        q
          .eq("environment", environment)
          .eq("actorId", principal.subject)
          .gt("expiresAt", Date.now()),
      )
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .take(3);
    if (pending.length >= 3)
      identityFailure(
        "IDENTITY_LINK_LIMIT",
        "Finish an existing link attempt or wait five minutes.",
      );
    const createdAt = Date.now(),
      expiresAt = createdAt + LINK_LIFETIME;
    const id = await ctx.db.insert("identityLinkChallenges", {
      environment,
      legacyIssuer: principal.issuer,
      legacySubject: principal.subject,
      actorId: principal.subject,
      secretHash: args.secretHash,
      createdAt,
      expiresAt,
    });
    return {
      id,
      expiresAt,
      legacyDisplay: await legacyDisplay(ctx, principal.subject),
    };
  },
});

function sameHash(expected: string, actual: string) {
  let difference = expected.length ^ actual.length;
  for (let i = 0; i < 64; i++)
    difference |= (expected.charCodeAt(i) || 0) ^ (actual.charCodeAt(i) || 0);
  return difference === 0;
}

async function linkChallenge(
  ctx: DbCtx,
  principal: Principal,
  id: Id<"identityLinkChallenges">,
  secret: string,
  allowCompleted = false,
) {
  if (principal.config.mode !== "shared" || principal.provider !== "central")
    identityFailure(
      "IDENTITY_PROVIDER",
      "Sign in with your iYANJU account to continue.",
    );
  if (!principal.config.legacyAuthEnabled)
    identityFailure("IDENTITY_DISABLED", "Legacy account linking has ended.");
  if (!secretPattern.test(secret))
    identityFailure(
      "IDENTITY_LINK",
      "This link attempt is unavailable or expired.",
    );
  const challenge = await ctx.db.get(id);
  if (
    !challenge ||
    challenge.environment !== principal.config.environment ||
    challenge.legacyIssuer !== principal.config.legacyIssuer ||
    challenge.legacySubject !== challenge.actorId ||
    challenge.expiresAt <= Date.now() ||
    !sameHash(challenge.secretHash, await sha256(secret))
  )
    identityFailure(
      "IDENTITY_LINK",
      "This link attempt is unavailable or expired.",
    );
  if (challenge.usedAt !== undefined) {
    const alias = await aliasFor(ctx, principal);
    if (!(allowCompleted && alias?.actorId === challenge.actorId))
      identityFailure(
        "IDENTITY_LINK_USED",
        "This link attempt was already used. Start again.",
      );
  }
  return challenge;
}

export const linkPreview = query({
  args: { id: v.id("identityLinkChallenges"), secret: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    expiresAt: number;
    legacyDisplay: { name: string; email: string };
    completed: boolean;
  }> => {
    const principal = await verifiedPrincipal(ctx);
    const challenge = await linkChallenge(
      ctx,
      principal,
      args.id,
      args.secret,
      true,
    );
    const alias = await aliasFor(ctx, principal);
    if (alias && alias.actorId !== challenge.actorId)
      identityFailure(
        "IDENTITY_CONFLICT",
        "This iYANJU account already has a different Kazi identity.",
      );
    return {
      expiresAt: challenge.expiresAt,
      legacyDisplay: await legacyDisplay(ctx, challenge.actorId),
      completed: challenge.usedAt !== undefined,
    };
  },
});

export const completeLink = mutation({
  args: { id: v.id("identityLinkChallenges"), secret: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ actorId: string; workspaceId?: Id<"workspaces"> }> => {
    const principal = await verifiedPrincipal(ctx, { fresh: true });
    const challenge = await linkChallenge(ctx, principal, args.id, args.secret);
    if (principal.config.mode !== "shared")
      identityFailure("IDENTITY_DISABLED", "Account linking is not enabled.");
    const environment = principal.config.environment;
    if (
      (await aliasFor(ctx, principal)) ||
      (await centralAlias(ctx, environment, challenge.actorId))
    )
      identityFailure(
        "IDENTITY_CONFLICT",
        "One of these accounts is already linked. Existing work has not been merged.",
      );
    if (!(await legacyActorExists(ctx, challenge.actorId)))
      identityFailure(
        "IDENTITY_LINK",
        "The existing Kazi account is unavailable.",
      );
    const legacyAlias = await ctx.db
      .query("identityAliases")
      .withIndex("by_identity", (q) =>
        q
          .eq("environment", environment)
          .eq("issuer", challenge.legacyIssuer)
          .eq("subject", challenge.legacySubject),
      )
      .unique();
    if (
      legacyAlias &&
      (legacyAlias.actorId !== challenge.actorId ||
        legacyAlias.provider !== "legacy")
    )
      identityFailure(
        "IDENTITY_CONFLICT",
        "The existing account mapping is inconsistent.",
      );
    const linkedAt = Date.now();
    if (!legacyAlias)
      await ctx.db.insert("identityAliases", {
        environment,
        issuer: challenge.legacyIssuer,
        subject: challenge.legacySubject,
        actorId: challenge.actorId,
        provider: "legacy",
        registrationKind: "legacy",
        linkedAt,
      });
    await ctx.db.insert("identityAliases", {
      environment,
      issuer: principal.issuer,
      subject: principal.subject,
      actorId: challenge.actorId,
      provider: "central",
      registrationKind: "legacy",
      linkedAt,
    });
    await ctx.db.patch(challenge._id, { usedAt: linkedAt });
    const workspaceId = await activeWorkspace(ctx, challenge.actorId);
    return {
      actorId: challenge.actorId,
      ...(workspaceId ? { workspaceId } : {}),
    };
  },
});

export const startNewAccount = mutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ actorId: string; workspaceId: Id<"workspaces"> }> => {
    const principal = await verifiedPrincipal(ctx);
    if (principal.config.mode !== "shared" || principal.provider !== "central")
      identityFailure(
        "IDENTITY_PROVIDER",
        "Create new accounts through iYANJU.",
      );
    const alias = await aliasFor(ctx, principal);
    if (alias) {
      const workspaceId = await activeWorkspace(ctx, alias.actorId);
      if (!workspaceId)
        identityFailure(
          "IDENTITY_REGISTERED",
          "This account already has a Kazi identity. Open your existing account.",
        );
      return { actorId: alias.actorId, workspaceId };
    }
    const environment = principal.config.environment;
    const actorId =
      "iy_" +
      (await sha256(
        JSON.stringify([environment, principal.issuer, principal.subject]),
      ));
    if (
      (await ctx.db
        .query("profiles")
        .withIndex("by_subject", (q) => q.eq("subject", actorId))
        .unique()) ||
      (await centralAlias(ctx, environment, actorId))
    )
      identityFailure(
        "IDENTITY_CONFLICT",
        "This account identity is already reserved.",
      );
    const workspaceId = await createWorkspace(
      ctx,
      actorId,
      principal.identity.name ?? "You",
      principal.identity.email ?? "",
      "personal",
    );
    await ctx.db.insert("profiles", {
      subject: actorId,
      name: principal.identity.name ?? "You",
      email: principal.identity.email ?? "",
      activeWorkspaceId: workspaceId,
    });
    await ctx.db.insert("identityAliases", {
      environment,
      issuer: principal.issuer,
      subject: principal.subject,
      actorId,
      provider: "central",
      registrationKind: "new",
      linkedAt: Date.now(),
    });
    return { actorId, workspaceId };
  },
});

export const pruneLinkChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("identityLinkChallenges")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const challenge of expired) await ctx.db.delete(challenge._id);
    return expired.length;
  },
});
