import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { authorized, loadState, identity } from "./store";
import { visibleState } from "../shared/domain";

const eventArgs = {
  workspaceId: v.id("workspaces"),
  from: v.number(),
  to: v.number(),
  paginationOpts: paginationOptsValidator,
};
async function eventsAs(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    workspaceId: import("./_generated/dataModel").Id<"workspaces">;
    from: number;
    to: number;
    paginationOpts: import("convex/server").PaginationOptions;
  },
  subject: string,
) {
  await authorized(ctx, args.workspaceId, subject);
  if (
    !Number.isFinite(args.from) ||
    !Number.isFinite(args.to) ||
    args.to <= args.from ||
    args.to - args.from > 367 * 86400000
  )
    throw new ConvexError("Choose a reporting period of up to one year.");
  const state = visibleState(await loadState(ctx, args.workspaceId), subject);
  const tasks = new Set(state.tasks.map((t) => t.id)),
    projects = new Set(state.projects.map((p) => p.id));
  const result = await ctx.db
    .query("reportEvents")
    .withIndex("by_time", (q) =>
      q
        .eq("workspaceId", args.workspaceId)
        .gte("at", args.from)
        .lt("at", args.to),
    )
    .paginate({
      ...args.paginationOpts,
      numItems: Math.min(100, args.paginationOpts.numItems),
    });
  return {
    ...result,
    page: result.page
      .map((d) => d.data)
      .filter((e) => tasks.has(e.taskId) && projects.has(e.projectId)),
  };
}
export const events = query({
  args: eventArgs,
  handler: async (ctx, args) =>
    eventsAs(ctx, args, (await authorized(ctx, args.workspaceId)).id),
});
export const eventsFor = internalQuery({
  args: { ...eventArgs, subject: v.string() },
  handler: async (ctx, args) => eventsAs(ctx, args, args.subject),
});

const lifecycleArgs = {
  workspaceId: v.id("workspaces"),
  entityId: v.optional(v.string()),
  paginationOpts: paginationOptsValidator,
};
async function lifecycleAs(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    workspaceId: import("./_generated/dataModel").Id<"workspaces">;
    entityId?: string;
    paginationOpts: import("convex/server").PaginationOptions;
  },
  subject: string,
) {
  await authorized(ctx, args.workspaceId, subject);
  const state = visibleState(await loadState(ctx, args.workspaceId), subject),
    tasks = new Set(state.tasks.map((task) => task.id)),
    projects = new Set(state.projects.map((project) => project.id));
  const base = args.entityId
    ? ctx.db
        .query("lifecycleEvents")
        .withIndex("by_entity", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("data.entityId", args.entityId!),
        )
    : ctx.db
        .query("lifecycleEvents")
        .withIndex("by_time", (q) => q.eq("workspaceId", args.workspaceId));
  const result = await base.paginate({
    ...args.paginationOpts,
    numItems: Math.min(100, args.paginationOpts.numItems),
  });
  return {
    ...result,
    page: result.page
      .map((row) => row.data)
      .filter(
        (event) =>
          projects.has(event.projectId) &&
          (event.entityType === "project" || tasks.has(event.entityId)),
      ),
  };
}
export const lifecycle = query({
  args: lifecycleArgs,
  handler: async (ctx, args) =>
    lifecycleAs(ctx, args, (await authorized(ctx, args.workspaceId)).id),
});
export const lifecycleFor = internalQuery({
  args: { ...lifecycleArgs, subject: v.string() },
  handler: async (ctx, args) => lifecycleAs(ctx, args, args.subject),
});

const teamArgs = {
  teamIds: v.array(v.id("workspaces")),
  paginationOpts: paginationOptsValidator,
};
async function acrossTeams(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    teamIds: import("./_generated/dataModel").Id<"workspaces">[];
    paginationOpts: import("convex/server").PaginationOptions;
    from?: number;
    to?: number;
  },
  lifecycle: boolean,
  subject?: string,
) {
  if (args.teamIds.length > 10)
    throw new ConvexError("Choose up to ten teams.");
  const user = subject ? { subject } : await identity(ctx);
  for (const id of args.teamIds) await authorized(ctx, id, user.subject);
  const ids = [...new Set(args.teamIds)].sort();
  let cursor: { team: number; cursor: string | null } = {
    team: 0,
    cursor: null,
  };
  if (args.paginationOpts.cursor) {
    try {
      cursor = JSON.parse(args.paginationOpts.cursor);
    } catch {
      throw new ConvexError("Invalid report cursor.");
    }
  }
  if (
    !Number.isInteger(cursor.team) ||
    cursor.team < 0 ||
    cursor.team >= ids.length
  )
    return { page: [], isDone: true, continueCursor: "" };
  const opts = {
    cursor: cursor.cursor,
    numItems: Math.min(100, args.paginationOpts.numItems),
  };
  const result = lifecycle
    ? await lifecycleAs(
        ctx,
        { workspaceId: ids[cursor.team], paginationOpts: opts },
        user.subject,
      )
    : await eventsAs(
        ctx,
        {
          workspaceId: ids[cursor.team],
          paginationOpts: opts,
          from: args.from!,
          to: args.to!,
        },
        user.subject,
      );
  const next = result.isDone
    ? { team: cursor.team + 1, cursor: null }
    : { team: cursor.team, cursor: result.continueCursor };
  return {
    page: result.page,
    isDone: next.team >= ids.length,
    continueCursor: JSON.stringify(next),
  };
}
export const allEvents = query({
  args: { ...teamArgs, from: v.number(), to: v.number() },
  handler: async (ctx, args) =>
    acrossTeams(ctx, args, false) as Promise<{
      page: import("../shared/model").ReportEvent[];
      isDone: boolean;
      continueCursor: string;
    }>,
});
export const allLifecycle = query({
  args: teamArgs,
  handler: async (ctx, args) =>
    acrossTeams(ctx, args, true) as Promise<{
      page: import("../shared/model").LifecycleEvent[];
      isDone: boolean;
      continueCursor: string;
    }>,
});

export const allEventsFor = internalQuery({
  args: { ...teamArgs, from: v.number(), to: v.number(), subject: v.string() },
  handler: async (ctx, args) =>
    acrossTeams(ctx, args, false, args.subject) as Promise<{
      page: import("../shared/model").ReportEvent[];
      isDone: boolean;
      continueCursor: string;
    }>,
});
export const allLifecycleFor = internalQuery({
  args: { ...teamArgs, subject: v.string() },
  handler: async (ctx, args) =>
    acrossTeams(ctx, args, true, args.subject) as Promise<{
      page: import("../shared/model").LifecycleEvent[];
      isDone: boolean;
      continueCursor: string;
    }>,
});
