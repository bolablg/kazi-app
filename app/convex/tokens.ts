import { tokenScopes } from "../shared/capabilities";
import { v, ConvexError } from "convex/values";
import {
  query,
  action,
  internalMutation,
  internalAction,
  internalQuery,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { identity } from "./store";
import { randomToken, sha256 } from "./crypto";
async function listAs(
  ctx: import("./_generated/server").QueryCtx,
  subject: string,
) {
  const [recent, active] = await Promise.all([
    ctx.db
      .query("mcpTokens")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .order("desc")
      .take(50),
    ctx.db
      .query("mcpTokens")
      .withIndex("by_active", (q) =>
        q
          .eq("subject", subject)
          .eq("revoked", false)
          .gt("expiresAt", Date.now()),
      )
      .take(10),
  ]);
  // Always expose active credentials, even after many create/revoke cycles.
  const tokens = [
    ...new Map([...active, ...recent].map((t) => [t._id, t])).values(),
  ];
  return tokens.map(
    ({
      _id,
      label,
      scopes,
      expiresAt,
      revoked,
      lastUsedAt,
      clientName,
      clientVersion,
      lastTool,
      toolCalls,
    }) => ({
      id: _id,
      label,
      scopes,
      expiresAt,
      revoked,
      lastUsedAt,
      clientName,
      clientVersion,
      lastTool,
      toolCalls,
    }),
  );
}
export const list = query({
  args: {},
  handler: async (ctx) => listAs(ctx, (await identity(ctx)).subject),
});
export const listFor = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => listAs(ctx, subject),
});

export const mint = action({
  args: { label: v.string(), scopes: v.array(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.tokens.mintFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const mintFor = internalAction({
  args: {
    subject: v.string(),
    label: v.string(),
    scopes: v.array(v.string()),
    parentId: v.optional(v.id("mcpTokens")),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = { subject: args.subject };
    if (
      !args.label.trim() ||
      args.label.length > 80 ||
      !args.scopes.length ||
      args.scopes.some(
        (s) => !tokenScopes.includes(s as (typeof tokenScopes)[number]),
      )
    )
      throw new ConvexError("Choose a label and supported scopes.");
    const token = "kazi_" + randomToken();
    await ctx.runMutation(internal.tokens.save, {
      subject: user.subject,
      hash: await sha256(token),
      label: args.label,
      scopes: args.scopes,
      ...(args.parentId ? { parentId: args.parentId } : {}),
    });
    return token;
  },
});
export const save = internalMutation({
  args: {
    subject: v.string(),
    hash: v.string(),
    parentId: v.optional(v.id("mcpTokens")),
    label: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    let expiresAt = Date.now() + 30 * 86400000;
    if (
      !args.label.trim() ||
      args.label.length > 80 ||
      !args.scopes.length ||
      args.scopes.some(
        (scope) => !tokenScopes.includes(scope as (typeof tokenScopes)[number]),
      )
    )
      throw new ConvexError("Choose a label and supported scopes.");
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (
        !parent ||
        parent.subject !== args.subject ||
        parent.revoked ||
        parent.expiresAt <= Date.now() ||
        !parent.scopes.includes("credentials:manage") ||
        args.scopes.some((scope) => !parent.scopes.includes(scope))
      )
        throw new ConvexError(
          "Delegated scopes cannot exceed the active calling credential.",
        );
      expiresAt = Math.min(expiresAt, parent.expiresAt);
    }
    const active = await ctx.db
      .query("mcpTokens")
      .withIndex("by_active", (q) =>
        q
          .eq("subject", args.subject)
          .eq("revoked", false)
          .gt("expiresAt", Date.now()),
      )
      .take(10);
    if (
      active.filter((t) => !t.revoked && t.expiresAt > Date.now()).length >= 10
    )
      throw new Error("Revoke an existing token before creating another.");
    const { parentId: _, ...fields } = args;
    await ctx.db.insert("mcpTokens", {
      ...fields,
      expiresAt,
      revoked: false,
    });
  },
});
async function revokeAs(
  ctx: import("./_generated/server").MutationCtx,
  id: import("./_generated/dataModel").Id<"mcpTokens">,
  subject: string,
) {
  const token = await ctx.db.get(id);
  if (!token || token.subject !== subject)
    throw new ConvexError("Token unavailable.");
  await ctx.db.patch(id, { revoked: true });
}
export const revoke = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) =>
    revokeAs(ctx, id, (await identity(ctx)).subject),
});
export const revokeFor = internalMutation({
  args: { id: v.id("mcpTokens"), subject: v.string() },
  handler: async (ctx, { id, subject }) => revokeAs(ctx, id, subject),
});

export const authenticate = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const t = await ctx.db
      .query("mcpTokens")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!t || t.revoked || t.expiresAt <= Date.now()) return null;
    return {
      subject: t.subject,
      scopes: t.scopes,
      tokenId: t._id,
      expiresAt: t.expiresAt,
    };
  },
});
export const workspacesFor = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .take(50);
    return Promise.all(
      memberships.map(async (m) => {
        const w = await ctx.db.get(m.workspaceId);
        return {
          id: m.workspaceId,
          name: w?.name,
          kind: w?.kind,
          role: m.data.role,
          ...(m.data.favoriteTeamAt !== undefined
            ? { favoriteAt: m.data.favoriteTeamAt }
            : {}),
        };
      }),
    );
  },
});

async function activityAs(
  ctx: import("./_generated/server").QueryCtx,
  subject: string,
) {
  const rows = await ctx.db
    .query("mcpActivity")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .order("desc")
    .take(50);
  return rows.map(({ _id, label, tool, at, outcome }) => ({
    id: _id,
    label,
    tool,
    at,
    outcome,
  }));
}
export const activity = query({
  args: {},
  handler: async (ctx) => activityAs(ctx, (await identity(ctx)).subject),
});
export const activityFor = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => activityAs(ctx, subject),
});
// Only the authenticated HTTP adapter supplies a token reference. No arguments or returned task text are logged.
export const seen = internalMutation({
  args: {
    id: v.id("mcpTokens"),
    clientName: v.optional(v.string()),
    clientVersion: v.optional(v.string()),
    tool: v.optional(v.string()),
    outcome: v.optional(v.union(v.literal("success"), v.literal("error"))),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.id);
    if (!token || token.revoked || token.expiresAt <= Date.now()) return;
    await ctx.db.patch(args.id, {
      lastUsedAt: Date.now(),
      ...(args.clientName ? { clientName: args.clientName.slice(0, 100) } : {}),
      ...(args.clientVersion
        ? { clientVersion: args.clientVersion.slice(0, 60) }
        : {}),
      ...(args.tool
        ? {
            lastTool: args.tool.slice(0, 100),
            toolCalls: (token.toolCalls ?? 0) + 1,
          }
        : {}),
    });
    if (args.tool && args.outcome) {
      await ctx.db.insert("mcpActivity", {
        subject: token.subject,
        tokenId: args.id,
        label: token.label,
        tool: args.tool.slice(0, 100),
        at: Date.now(),
        outcome: args.outcome,
      });
      const recent = await ctx.db
        .query("mcpActivity")
        .withIndex("by_token", (q) => q.eq("tokenId", args.id))
        .order("desc")
        .take(101);
      for (const old of recent.slice(100)) await ctx.db.delete(old._id);
    }
  },
});
