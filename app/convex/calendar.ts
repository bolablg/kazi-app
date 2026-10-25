import { mergeTeamStates } from "../shared/teams";
import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  mutation,
} from "./_generated/server";
import { buildIcal } from "../shared/ical";
import { internal } from "./_generated/api";
import { projectFor, visibleState } from "../shared/domain";
import {
  authorized,
  loadState,
  persist,
  identity,
  crossTeamReservations,
} from "./store";
import { encrypt, decrypt, randomToken, sha256 } from "./crypto";
import type { Id } from "./_generated/dataModel";
const scopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
];
const feedOptions = {
  workspaceId: v.id("workspaces"),
  label: v.string(),
  projectId: v.optional(v.string()),
  includeDeadlines: v.boolean(),
  allTeams: v.optional(v.boolean()),
};
export const createFeed = action({
  args: feedOptions,
  handler: async (
    ctx,
    args,
  ): Promise<{ id: string; url: string; expiresAt: number }> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.calendar.createFeedFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const createFeedFor = internalAction({
  args: { ...feedOptions, subject: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: string; url: string; expiresAt: number }> => {
    if (!args.label.trim() || args.label.length > 80)
      throw new ConvexError("Enter a calendar link label up to 80 characters.");
    if (!process.env.CONVEX_SITE_URL)
      throw new ConvexError("Configure the backend HTTP origin first.");
    const token = randomToken();
    const result = await ctx.runMutation(internal.calendar.saveFeed, {
      ...args,
      hash: await sha256(token),
    });
    if (!process.env.CONVEX_SITE_URL)
      throw new ConvexError("Configure the backend HTTP origin first.");
    return {
      ...result,
      url: process.env.CONVEX_SITE_URL + "/agenda/" + token + ".ics",
    };
  },
});
export const saveFeed = internalMutation({
  args: { ...feedOptions, subject: v.string(), hash: v.string() },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    if (args.projectId)
      projectFor(await calendarState(ctx, args), args.projectId, args.subject);
    const rows = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_owner", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("subject", args.subject),
      )
      .collect();
    if (rows.filter((r) => !r.revoked && r.expiresAt > Date.now()).length >= 5)
      throw new ConvexError(
        "Revoke a calendar link before creating another. Five active links are supported.",
      );
    const expiresAt = Date.now() + 365 * 86400000;
    const id = await ctx.db.insert("calendarFeeds", {
      ...args,
      label: args.label.trim(),
      createdAt: Date.now(),
      expiresAt,
      revoked: false,
    });
    return { id: String(id), expiresAt };
  },
});
async function feedList(
  ctx: import("./_generated/server").QueryCtx,
  workspaceId: Id<"workspaces">,
  subject: string,
) {
  await authorized(ctx, workspaceId, subject);
  const rows = await ctx.db
    .query("calendarFeeds")
    .withIndex("by_owner", (q) =>
      q.eq("workspaceId", workspaceId).eq("subject", subject),
    )
    .order("desc")
    .take(100);
  return rows.map(
    ({
      _id,
      label,
      projectId,
      includeDeadlines,
      createdAt,
      expiresAt,
      revoked,
    }) => ({
      id: String(_id),
      label,
      projectId,
      includeDeadlines,
      createdAt,
      expiresAt,
      revoked,
    }),
  );
}
export const feeds = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const user = await identity(ctx);
    return feedList(ctx, workspaceId, user.subject);
  },
});
export const feedsFor = internalQuery({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, { workspaceId, subject }) =>
    feedList(ctx, workspaceId, subject),
});
async function revokeFeedAs(
  ctx: import("./_generated/server").MutationCtx,
  id: Id<"calendarFeeds">,
  subject: string,
) {
  const row = await ctx.db.get(id);
  if (!row || row.subject !== subject)
    throw new ConvexError("Calendar link unavailable.");
  await authorized(ctx, row.workspaceId, subject);
  await ctx.db.patch(id, { revoked: true });
}
export const revokeFeed = mutation({
  args: { id: v.id("calendarFeeds") },
  handler: async (ctx, { id }) =>
    revokeFeedAs(ctx, id, (await identity(ctx)).subject),
});
export const revokeFeedFor = internalMutation({
  args: { id: v.id("calendarFeeds"), subject: v.string() },
  handler: async (ctx, { id, subject }) => revokeFeedAs(ctx, id, subject),
});
const exportOptions = {
  workspaceId: v.id("workspaces"),
  projectId: v.optional(v.string()),
  includeDeadlines: v.optional(v.boolean()),
  allTeams: v.optional(v.boolean()),
};
async function exportAs(
  ctx: import("./_generated/server").QueryCtx,
  args: {
    workspaceId: Id<"workspaces">;
    subject: string;
    projectId?: string;
    includeDeadlines?: boolean;
    allTeams?: boolean;
  },
) {
  await authorized(ctx, args.workspaceId, args.subject);
  const state = await calendarState(ctx, args);
  if (args.projectId) projectFor(state, args.projectId, args.subject);
  return buildIcal(state, args.subject, {
    ...args,
    appOrigin: process.env.APP_ORIGIN,
  });
}
export const exportAgenda = query({
  args: exportOptions,
  handler: async (ctx, args): Promise<string> =>
    exportAs(ctx, { ...args, subject: (await identity(ctx)).subject }),
});
export const exportAgendaFor = internalQuery({
  args: { ...exportOptions, subject: v.string() },
  handler: exportAs,
});
export const feedContent = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, { hash }): Promise<string | null> => {
    const row = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!row || row.revoked || row.expiresAt <= Date.now()) return null;
    try {
      return await exportAs(ctx, row);
    } catch {
      return null;
    }
  },
});
export const connect = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.calendar.connectFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const connectFor = internalAction({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const user = { subject: args.subject };
    await ctx.runQuery(internal.commands.stateForActor, {
      ...args,
      subject: user.subject,
    });
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.CONVEX_SITE_URL ||
      !process.env.TOKEN_ENCRYPTION_KEY
    )
      throw new ConvexError(
        "Google Calendar is not configured. Ask the workspace owner to complete the setup guide.",
      );
    const state = randomToken();
    await ctx.runMutation(internal.calendar.saveOAuthState, {
      ...args,
      subject: user.subject,
      hash: await sha256(state),
    });
    return (
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.CONVEX_SITE_URL + "/google/callback",
        response_type: "code",
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString()
    );
  },
});
export const saveOAuthState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    await ctx.db.insert("oauthStates", {
      ...args,
      expiresAt: Date.now() + 600000,
      used: false,
    });
  },
});
export const consumeState = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const s = await ctx.db
      .query("oauthStates")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!s || s.used || s.expiresAt < Date.now())
      throw new ConvexError(
        "Calendar connection expired. Start again from Settings.",
      );
    await authorized(ctx, s.workspaceId, s.subject);
    await ctx.db.patch(s._id, { used: true });
    return { subject: s.subject, workspaceId: s.workspaceId };
  },
});
export const storeSecret = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
  },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    const old = await ctx.db
      .query("calendarSecrets")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .unique();
    const value = {
      subject: args.subject,
      ciphertext: args.ciphertext,
      iv: args.iv,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.replace(old._id, value);
    else await ctx.db.insert("calendarSecrets", value);
    const status = await ctx.db
      .query("calendarStatuses")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", args.subject),
      )
      .unique();
    const data = {
      ownerId: args.subject,
      status: "native" as const,
      selectedIds: [],
      destinationId: "kazi",
      lastSync: Date.now(),
    };
    if (status) await ctx.db.patch(status._id, { data });
    else
      await ctx.db.insert("calendarStatuses", {
        workspaceId: args.workspaceId,
        key: args.subject,
        data,
      });
  },
});
export const secret = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) =>
    ctx.db
      .query("calendarSecrets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique(),
});
export async function accessToken(
  ctx: import("./_generated/server").ActionCtx,
  subject: string,
): Promise<string> {
  const secret = await ctx.runQuery(internal.calendar.secret, { subject });
  if (!secret) throw new Error("Reconnect Google Calendar to continue.");
  const refresh = await decrypt(secret);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 400
        ? "Calendar consent was revoked. Reconnect Google Calendar."
        : "Google could not refresh your connection. Try again shortly.",
    );
  const body = await response.json();
  return body.access_token;
}
export const list = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.calendar.listFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const listFor = internalAction({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: string; name: string; writable: boolean }[]> => {
    const user = { subject: args.subject };
    await ctx.runQuery(internal.commands.stateForActor, {
      ...args,
      subject: user.subject,
    });
    const token = await accessToken(ctx, user.subject);
    let page: string | undefined;
    const result: { id: string; name: string; writable: boolean }[] = [];
    do {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      );
      url.searchParams.set("maxResults", "250");
      if (page) url.searchParams.set("pageToken", page);
      const r = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok)
        throw new ConvexError(
          "Calendar list unavailable. Reconnect your Google account.",
        );
      const body = await r.json();
      result.push(
        ...(body.items ?? []).map(
          (x: { id: string; summary: string; accessRole: string }) => ({
            id: x.id,
            name: x.summary,
            writable: x.accessRole === "owner",
          }),
        ),
      );
      page = body.nextPageToken;
      if (result.length > 1000)
        throw new ConvexError("Select an account with fewer calendars.");
    } while (page);
    return result;
  },
});
export const choose = action({
  args: {
    workspaceId: v.id("workspaces"),
    selectedIds: v.array(v.string()),
    destinationId: v.string(),
    shareAvailability: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.calendar.chooseFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const chooseFor = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    selectedIds: v.array(v.string()),
    destinationId: v.string(),
    shareAvailability: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = { subject: args.subject };
    const calendars =
      args.destinationId === "kazi" && !args.selectedIds.length
        ? []
        : await ctx.runAction(internal.calendar.availableFor, {
            workspaceId: args.workspaceId,
            subject: user.subject,
          });
    if (
      (args.destinationId !== "kazi" && !args.selectedIds.length) ||
      args.selectedIds.length > 20 ||
      (args.destinationId !== "kazi" &&
        !args.selectedIds.includes(args.destinationId)) ||
      (args.destinationId !== "kazi" &&
        !calendars.some(
          (x: { id: string; writable: boolean }) =>
            x.id === args.destinationId && x.writable,
        )) ||
      args.selectedIds.some(
        (id) => !calendars.some((x: { id: string }) => x.id === id),
      )
    )
      throw new ConvexError(
        "Choose up to 20 available calendars and an owned writable destination included in availability.",
      );
    await ctx.runMutation(internal.calendar.selection, {
      ...args,
      subject: user.subject,
    });
    await ctx.runAction(internal.calendar.refreshFor, {
      workspaceId: args.workspaceId,
      subject: user.subject,
    });
  },
});
export const availableFor = internalAction({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args): Promise<{ id: string; writable: boolean }[]> =>
    ctx.runAction(internal.calendar.listFor, args),
});

export const selection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    selectedIds: v.array(v.string()),
    destinationId: v.string(),
    shareAvailability: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    const r = await ctx.db
      .query("calendarStatuses")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", args.subject),
      )
      .unique();
    if (!r) throw new ConvexError("Reconnect Google Calendar.");
    await ctx.db.patch(r._id, {
      data: {
        ownerId: args.subject,
        status: args.destinationId === "kazi" ? "native" : "connected",
        selectedIds: args.selectedIds,
        destinationId: args.destinationId,
        shareAvailability: args.shareAvailability ?? false,
      },
    });
    const cursors = await ctx.db
      .query("calendarCursors")
      .withIndex("by_owner", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("subject", args.subject),
      )
      .take(20);
    for (const cursor of cursors) await ctx.db.delete(cursor._id);
    if (args.destinationId === "kazi") return;
    const cursorId = await ctx.db.insert("calendarCursors", {
      workspaceId: args.workspaceId,
      subject: args.subject,
      calendarId: args.destinationId,
      nextSyncAt: Date.now() + 900000,
    });
    await ctx.scheduler.runAfter(0, internal.calendar.syncEvents, { cursorId });
  },
});
export const refresh = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    await ctx.runAction(internal.calendar.refreshFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const refreshFor = internalAction({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const s = await ctx.runQuery(internal.commands.stateForActor, args);
    const cal = s.calendars.find((x) => x.ownerId === args.subject);
    if (cal?.destinationId === "kazi" && !cal.selectedIds.length) {
      await ctx.runMutation(internal.calendar.saveAvailability, {
        ...args,
        busy: await ctx.runQuery(internal.calendar.otherReservations, args),
        syncedAt: Date.now(),
      });
      return;
    }
    if (!cal?.selectedIds.length || !cal.destinationId)
      throw new ConvexError(
        "Connect Google Calendar and choose availability calendars and a writable destination in Settings.",
      );
    try {
      const token = await accessToken(ctx, args.subject),
        now = Date.now();
      const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: new Date(now).toISOString(),
          timeMax: new Date(now + 29 * 86400000).toISOString(),
          items: cal.selectedIds.map((id) => ({ id })),
        }),
      });
      if (!r.ok)
        throw new Error(
          r.status === 429
            ? "Google Calendar is rate limited. Try again shortly."
            : "Calendar availability could not be confirmed. Reconnect or try again.",
        );
      const body = await r.json();
      const busy: import("../shared/model").Busy[] = await ctx.runQuery(
        internal.calendar.otherReservations,
        args,
      );
      for (const id of cal.selectedIds) {
        const calendar = body.calendars?.[id];
        if (!calendar || calendar.errors?.length)
          throw new Error(
            "An availability calendar is unavailable. Review your selected calendars.",
          );
        for (const b of calendar.busy ?? [])
          busy.push({
            start: Date.parse(b.start),
            end: Date.parse(b.end),
            ownerId: args.subject,
          });
      }
      await ctx.runMutation(internal.calendar.saveAvailability, {
        ...args,
        busy,
        syncedAt: now,
      });
    } catch (e) {
      await ctx.runMutation(internal.calendar.saveAvailability, {
        ...args,
        busy: [],
        error: e instanceof Error ? e.message : "Calendar connection failed.",
      });
      throw e;
    }
  },
});
export const refreshScope = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    projectId: v.optional(v.string()),
    sprintId: v.optional(v.string()),
    proposalId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const s = await ctx.runQuery(internal.commands.stateForActor, {
      workspaceId: args.workspaceId,
      subject: args.subject,
    });
    let owners = [args.subject];
    if (args.sprintId) {
      const sprint = visibleState(s, args.subject).sprints?.find(
        (item) => item.id === args.sprintId,
      );
      if (!sprint) throw new ConvexError("This sprint is unavailable.");
      const tasks = s.tasks.filter((task) => sprint.taskIds.includes(task.id));
      const member = s.members.find((m) => m.id === args.subject)!;
      if (
        tasks.some(
          (task) =>
            task.assigneeId !== args.subject &&
            projectFor(s, task.projectId, args.subject).ownerId !==
              args.subject &&
            !["owner", "admin"].includes(member.role),
        )
      )
        throw new ConvexError(
          "A project manager must propose work for teammates.",
        );
      owners = [
        ...new Set(
          tasks.flatMap((task) => (task.assigneeId ? [task.assigneeId] : [])),
        ),
      ];
    }
    if (args.projectId) {
      const project = projectFor(s, args.projectId, args.subject),
        member = s.members.find((m) => m.id === args.subject)!;
      if (
        project.ownerId !== args.subject &&
        !["owner", "admin"].includes(member.role)
      )
        throw new ConvexError(
          "A project manager must propose work for teammates.",
        );
      owners = [
        ...new Set(
          s.tasks
            .filter((t) => t.projectId === project.id && t.assigneeId)
            .map((t) => t.assigneeId!),
        ),
      ];
    }
    if (args.proposalId) {
      const proposal = visibleState(s, args.subject).proposals.find(
        (p) => p.id === args.proposalId,
      );
      if (!proposal) throw new ConvexError("This proposal is unavailable.");
      owners = [
        ...new Set(
          proposal.alternatives[proposal.selected].sessions.map(
            (s) => s.assigneeId,
          ),
        ),
      ];
    }
    if (args.proposalId && !owners.includes(args.subject))
      throw new ConvexError(
        "Only an affected calendar owner can approve these sessions.",
      );
    for (const subject of owners) {
      const cal = s.calendars.find((c) => c.ownerId === subject);
      if (subject === args.subject || cal?.shareAvailability === true)
        await ctx.runAction(internal.calendar.refreshFor, {
          workspaceId: args.workspaceId,
          subject,
        });
    }
  },
});
export const saveAvailability = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    busy: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        ownerId: v.string(),
        source: v.optional(v.literal("kazi")),
      }),
    ),
    syncedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    const before = await loadState(ctx, args.workspaceId),
      after = structuredClone(before),
      cal = after.calendars.find((x) => x.ownerId === args.subject);
    if (!cal) throw new ConvexError("Calendar connection missing.");
    if (args.error) {
      cal.status = "error";
      cal.error = args.error;
    } else {
      cal.status = cal.destinationId === "kazi" ? "native" : "connected";
      delete cal.error;
      cal.lastSync = args.syncedAt;
      after.busy = [
        ...after.busy.filter((x) => x.ownerId !== args.subject),
        ...args.busy,
      ];
    }
    await persist(ctx, args.workspaceId, before, after);
  },
});
export const disconnect = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.calendar.disconnectFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const disconnectFor = internalAction({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const user = { subject: args.subject };
    await ctx.runQuery(internal.commands.stateForActor, {
      ...args,
      subject: user.subject,
    });
    const secret = await ctx.runQuery(internal.calendar.secret, {
      subject: user.subject,
    });
    if (secret) {
      const token = await decrypt(secret);
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
      if (!response.ok && response.status !== 400)
        throw new ConvexError(
          "Google could not revoke consent. Try disconnecting again.",
        );
    }
    await ctx.runMutation(internal.calendar.removeSecret, {
      subject: user.subject,
    });
  },
});
export const removeSecret = internalMutation({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const secret = await ctx.db
      .query("calendarSecrets")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (secret) await ctx.db.delete(secret._id);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .take(50);
    for (const m of memberships) {
      const cursors = await ctx.db
        .query("calendarCursors")
        .withIndex("by_owner", (q) =>
          q.eq("workspaceId", m.workspaceId).eq("subject", subject),
        )
        .take(20);
      for (const cursor of cursors) await ctx.db.delete(cursor._id);
      const cal = await ctx.db
        .query("calendarStatuses")
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", m.workspaceId).eq("key", subject),
        )
        .unique();
      if (cal)
        await ctx.db.patch(cal._id, {
          data: {
            ownerId: subject,
            status: "native",
            selectedIds: [],
            destinationId: "kazi",
            lastSync: Date.now(),
          },
        });
    }
  },
});
// Incremental metadata reconciliation only for Kazi's writable destination.
// Other event titles, descriptions, attendees and payloads are never stored.
export const cursor = internalQuery({
  args: { id: v.id("calendarCursors") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});
export const syncEvents = internalAction({
  args: { cursorId: v.id("calendarCursors") },
  handler: async (ctx, { cursorId }): Promise<void> => {
    const cursor = await ctx.runQuery(internal.calendar.cursor, {
      id: cursorId,
    });
    if (!cursor) return;
    try {
      const state = await ctx.runQuery(internal.commands.stateForActor, {
        workspaceId: cursor.workspaceId,
        subject: cursor.subject,
      });
      if (
        !state.calendars.some(
          (c) =>
            c.ownerId === cursor.subject &&
            c.destinationId === cursor.calendarId &&
            c.status === "connected",
        )
      )
        return;
      const token = await accessToken(ctx, cursor.subject),
        params = new URLSearchParams({
          maxResults: "250",
          showDeleted: "true",
          singleEvents: "false",
        });
      if (cursor.syncToken) params.set("syncToken", cursor.syncToken);
      if (cursor.pageToken) params.set("pageToken", cursor.pageToken);
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cursor.calendarId)}/events?${params}`,
        { headers: { Authorization: "Bearer " + token } },
      );
      if (response.status === 410) {
        await ctx.runMutation(internal.calendar.advanceCursor, {
          id: cursorId,
          reset: true,
        });
        return;
      }
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Calendar change reconciliation is rate limited."
            : "Calendar changes could not be reconciled. Reconnect if this persists.",
        );
      const body = await response.json();
      for (const event of body.items ?? []) {
        if (!event.id || !/^k[0-9a-f]{48}$/.test(event.id)) continue;
        await ctx.runMutation(internal.calendar.reconcileEvent, {
          workspaceId: cursor.workspaceId,
          subject: cursor.subject,
          eventId: event.id,
          canceled: event.status === "cancelled",
          ...(event.start?.dateTime
            ? { start: Date.parse(event.start.dateTime) }
            : {}),
          ...(event.end?.dateTime
            ? { end: Date.parse(event.end.dateTime) }
            : {}),
        });
      }
      await ctx.runMutation(internal.calendar.advanceCursor, {
        id: cursorId,
        ...(body.nextSyncToken ? { syncToken: body.nextSyncToken } : {}),
        ...(body.nextPageToken ? { pageToken: body.nextPageToken } : {}),
      });
    } catch (e) {
      await ctx.runMutation(internal.calendar.advanceCursor, {
        id: cursorId,
        error:
          e instanceof Error
            ? e.message
            : "Calendar change reconciliation failed.",
      });
    }
  },
});
export const advanceCursor = internalMutation({
  args: {
    id: v.id("calendarCursors"),
    syncToken: v.optional(v.string()),
    pageToken: v.optional(v.string()),
    reset: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cursor = await ctx.db.get(args.id);
    if (!cursor) return;
    const nextSyncAt =
      Date.now() +
      (args.error ? 1800000 : args.reset || args.pageToken ? 60000 : 900000);
    await ctx.db.patch(args.id, {
      syncToken: args.reset ? undefined : (args.syncToken ?? cursor.syncToken),
      pageToken: args.reset ? undefined : args.pageToken,
      nextSyncAt,
      error: args.error,
    });
  },
});
export const reconcileEvent = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    eventId: v.string(),
    canceled: v.boolean(),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    const writes = await ctx.db
        .query("outbox")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .take(3),
      write = writes.find(
        (w) =>
          w.operation !== "release" &&
          w.workspaceId === args.workspaceId &&
          w.status === "done",
      );
    if (!write) return;
    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", write.proposalId),
      )
      .unique();
    if (!proposal) return;
    const data = structuredClone(proposal.data),
      session = data.alternatives[data.selected].sessions.find(
        (s) => s.id === write.sessionId,
      );
    if (!session || session.assigneeId !== args.subject) return;
    const changed = args.canceled
      ? session.status !== "released"
      : args.start !== undefined &&
        args.end !== undefined &&
        (session.start !== args.start || session.end !== args.end);
    if (!changed) return;
    const message = args.canceled
      ? "This focus session was removed in Google Calendar. Your original plan snapshot is preserved."
      : "This focus session was moved in Google Calendar. Your original plan snapshot is preserved.";
    if (args.canceled) session.status = "released";
    else {
      session.start = args.start!;
      session.end = args.end!;
    }
    session.error = message;
    data.status = "partial";
    await ctx.db.patch(proposal._id, { data });
    const key = `external:${args.eventId}:${args.canceled ? "canceled" : args.start}`;
    const old = await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", key),
      )
      .unique();
    if (!old)
      await ctx.db.insert("notifications", {
        workspaceId: args.workspaceId,
        key,
        recipientId: args.subject,
        data: {
          id: key,
          key,
          recipientId: args.subject,
          proposalId: proposal.key,
          title: "A focus session changed in Google Calendar",
          body: message,
          kind: "system",
          createdAt: Date.now(),
          deliveryAt: Date.now(),
          read: false,
        },
      });
  },
});

export const otherReservations = internalQuery({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args) => {
    await authorized(ctx, args.workspaceId, args.subject);
    return crossTeamReservations(ctx, args.subject, args.workspaceId);
  },
});

async function calendarState(
  ctx: import("./_generated/server").QueryCtx,
  args: { workspaceId: Id<"workspaces">; subject: string; allTeams?: boolean },
) {
  await authorized(ctx, args.workspaceId, args.subject);
  if (!args.allTeams)
    return visibleState(await loadState(ctx, args.workspaceId), args.subject);
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", args.subject))
    .take(10);
  const entries = await Promise.all(
    memberships.map(async (member) => ({
      id: String(member.workspaceId),
      state: visibleState(
        await loadState(ctx, member.workspaceId),
        args.subject,
      ),
    })),
  );
  return mergeTeamStates(entries, args.subject);
}
