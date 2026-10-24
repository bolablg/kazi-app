import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authorized, identity, loadState, newId, persist } from "./store";
import { addTaskArtifact, taskFor } from "../shared/domain";
import { sha256, randomToken } from "./crypto";
import { checkFile } from "../shared/artifacts";

const placement = v.union(v.literal("description"), v.literal("task"));
const transferArgs = {
  workspaceId: v.id("workspaces"),
  taskId: v.string(),
  kind: v.union(v.literal("upload"), v.literal("download")),
  artifactId: v.optional(v.string()),
  name: v.optional(v.string()),
  size: v.optional(v.number()),
  contentType: v.optional(v.string()),
  placement: v.optional(placement),
};
type Transfer = {
  workspaceId: Id<"workspaces">;
  taskId: string;
  kind: "upload" | "download";
  artifactId?: string;
  name?: string;
  size?: number;
  contentType?: string;
  placement?: "description" | "task";
};
async function prepareTransfer(
  ctx: MutationCtx,
  args: Transfer,
  subject: string,
  hash: string,
  mcpTokenId?: Id<"mcpTokens">,
): Promise<{ url: string; expiresAt: number; maxBytes: number }> {
  await authorized(ctx, args.workspaceId, subject);
  const state = await loadState(ctx, args.workspaceId);
  taskFor(state, args.taskId, subject);
  const artifact =
    args.kind === "download"
      ? state.artifacts?.find(
          (a) =>
            a.id === args.artifactId &&
            a.taskId === args.taskId &&
            !a.removedAt &&
            a.kind === "file",
        )
      : undefined;
  if (args.kind === "download" && !artifact)
    throw new ConvexError("This file is unavailable.");
  const name = artifact?.name ?? args.name ?? "",
    size = artifact?.size ?? args.size ?? 0,
    contentType =
      artifact?.contentType ?? args.contentType ?? "application/octet-stream";
  checkFile(name, size, contentType);
  if (
    args.kind === "upload" &&
    (state.artifacts ?? []).filter(
      (a) => a.taskId === args.taskId && !a.removedAt,
    ).length >= 100
  )
    throw new ConvexError("A task can have up to 100 artifacts.");
  const outstanding = await ctx.db
    .query("fileTickets")
    .withIndex("by_subject", (q) =>
      q.eq("subject", subject).gt("expiresAt", Date.now()),
    )
    .take(31);
  if (outstanding.filter((t) => !t.usedAt).length >= 30)
    throw new ConvexError(
      "Finish your current transfers before starting more.",
    );
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const ticketId = await ctx.db.insert("fileTickets", {
    workspaceId: args.workspaceId,
    subject,
    taskId: args.taskId,
    kind: args.kind,
    artifactId: artifact?.id ?? newId(),
    name,
    size,
    contentType,
    placement: artifact?.placement ?? args.placement ?? "task",
    hash,
    expiresAt,
    ...(mcpTokenId ? { mcpTokenId } : {}),
  });
  await ctx.scheduler.runAfter(11 * 60 * 1000, internal.files.expire, {
    ticketId,
  });
  return {
    url: process.env.CONVEX_SITE_URL + "/task-files",
    expiresAt,
    maxBytes: 20 * 1024 * 1024,
  };
}
type PreparedTransfer = {
  url: string;
  expiresAt: number;
  maxBytes: number;
  token: string;
};
export const prepare = action({
  args: transferArgs,
  handler: async (ctx, args): Promise<PreparedTransfer> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.files.prepareFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const prepareFor = internalAction({
  args: {
    ...transferArgs,
    subject: v.string(),
    mcpTokenId: v.optional(v.id("mcpTokens")),
  },
  handler: async (ctx, args): Promise<PreparedTransfer> => {
    const token = randomToken();
    const result = await ctx.runMutation(internal.files.createTransfer, {
      ...args,
      hash: await sha256(token),
    });
    return { ...result, token };
  },
});
export const createTransfer = internalMutation({
  args: {
    ...transferArgs,
    subject: v.string(),
    hash: v.string(),
    mcpTokenId: v.optional(v.id("mcpTokens")),
  },
  handler: (ctx, args) =>
    prepareTransfer(ctx, args, args.subject, args.hash, args.mcpTokenId),
});
export const expire = internalMutation({
  args: { ticketId: v.id("fileTickets") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.ticketId);
    if (t && t.expiresAt <= Date.now()) await ctx.db.delete(t._id);
  },
});
export const claim = internalMutation({
  args: {
    hash: v.string(),
    kind: v.union(v.literal("upload"), v.literal("download")),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("fileTickets")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    if (
      !ticket ||
      ticket.kind !== args.kind ||
      ticket.expiresAt <= Date.now() ||
      ticket.usedAt
    )
      throw new ConvexError("Transfer expired or unavailable. Try again.");
    if (ticket.mcpTokenId) {
      const credential = await ctx.db.get(ticket.mcpTokenId);
      const scope = args.kind === "upload" ? "tasks:write" : "read";
      if (
        !credential ||
        credential.revoked ||
        credential.expiresAt <= Date.now() ||
        !credential.scopes.includes(scope) ||
        credential.subject !== ticket.subject
      )
        throw new ConvexError("This credential is no longer authorized.");
    }
    await authorized(ctx, ticket.workspaceId, ticket.subject);
    const state = await loadState(ctx, ticket.workspaceId);
    taskFor(state, ticket.taskId, ticket.subject);
    const artifact = state.artifacts?.find(
      (a) =>
        a.id === ticket.artifactId &&
        a.taskId === ticket.taskId &&
        !a.removedAt,
    );
    if (
      args.kind === "download" &&
      (!artifact || artifact.kind !== "file" || !artifact.storageId)
    )
      throw new ConvexError("This file is unavailable.");
    await ctx.db.patch(ticket._id, { usedAt: Date.now() });
    return {
      ...ticket,
      ...(artifact?.storageId ? { storageId: artifact.storageId } : {}),
    };
  },
});
export const finish = internalMutation({
  args: { ticketId: v.id("fileTickets"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (
      !ticket ||
      ticket.kind !== "upload" ||
      !ticket.usedAt ||
      ticket.expiresAt <= Date.now()
    )
      throw new ConvexError("Upload expired. Try again.");
    if (ticket.mcpTokenId) {
      const credential = await ctx.db.get(ticket.mcpTokenId);
      if (
        !credential ||
        credential.revoked ||
        credential.expiresAt <= Date.now() ||
        !credential.scopes.includes("tasks:write") ||
        credential.subject !== ticket.subject
      )
        throw new ConvexError("This credential is no longer authorized.");
    }
    await authorized(ctx, ticket.workspaceId, ticket.subject);
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size !== ticket.size)
      throw new ConvexError("File size does not match the upload.");
    const before = await loadState(ctx, ticket.workspaceId),
      after = structuredClone(before);
    const id = addTaskArtifact(
      after,
      {
        id: ticket.artifactId,
        taskId: ticket.taskId,
        name: ticket.name,
        kind: "file",
        placement: ticket.placement,
        size: metadata.size,
        contentType: ticket.contentType,
        storageId: args.storageId,
        createdBy: ticket.subject,
        createdAt: Date.now(),
      },
      { actorId: ticket.subject, now: Date.now(), id: newId },
    );
    await persist(ctx, ticket.workspaceId, before, after);
    await ctx.db.delete(ticket._id);
    return id;
  },
});
const historyArgs = {
  workspaceId: v.id("workspaces"),
  taskId: v.string(),
  kind: v.optional(v.literal("comment")),
  paginationOpts: paginationOptsValidator,
};
async function activityPage(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    taskId: string;
    kind?: "comment";
    paginationOpts: { cursor: string | null; numItems: number };
  },
  subject: string,
) {
  await authorized(ctx, args.workspaceId, subject);
  taskFor(await loadState(ctx, args.workspaceId), args.taskId, subject);
  const rows =
    args.kind === "comment"
      ? ctx.db
          .query("activities")
          .withIndex("by_task_kind", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("data.taskId", args.taskId)
              .eq("data.kind", "comment"),
          )
      : ctx.db
          .query("activities")
          .withIndex("by_task", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("data.taskId", args.taskId),
          );
  const result = await rows.order("desc").paginate(args.paginationOpts);
  return { ...result, page: result.page.map((d) => d.data) };
}
export const activity = query({
  args: historyArgs,
  handler: async (ctx, args) =>
    activityPage(ctx, args, (await identity(ctx)).subject),
});
export const activityFor = internalQuery({
  args: { ...historyArgs, subject: v.string() },
  handler: (ctx, args) => activityPage(ctx, args, args.subject),
});
