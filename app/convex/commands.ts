import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  action,
  internalAction,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  authorized,
  identity,
  loadState,
  persist,
  newId,
  createWorkspace,
  clean,
  crossTeamReservations,
} from "./store";
import { execute as reduce, visibleState } from "../shared/domain";
import {
  commandSchema,
  defaults,
  type Command,
  type State,
} from "../shared/model";
import { sha256, invitationToken } from "./crypto";
import { localInstant } from "../shared/scheduler";
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await identity(ctx);
    let profile = await ctx.db
      .query("profiles")
      .withIndex("by_subject", (q) => q.eq("subject", user.subject))
      .unique();
    if (!profile) {
      const workspaceId = await createWorkspace(
        ctx,
        user.subject,
        user.name ?? "You",
        user.email ?? "",
        "personal",
      );
      const id = await ctx.db.insert("profiles", {
        subject: user.subject,
        name: user.name ?? "You",
        email: user.email ?? "",
        activeWorkspaceId: workspaceId,
      });
      profile = await ctx.db.get(id);
    }
    if (profile) {
      // Only authenticated issuer claims may update the searchable directory.
      // These display fields never replace verified-email invitation checks.
      const username =
        typeof user.preferredUsername === "string"
          ? user.preferredUsername
          : undefined;
      const identityFields = {
        ...(user.name ? { name: user.name.slice(0, 180) } : {}),
        ...(user.email ? { email: user.email.slice(0, 320) } : {}),
        ...(username !== undefined ? { username: username.slice(0, 180) } : {}),
      };
      if (
        Object.entries(identityFields).some(
          ([key, value]) =>
            profile![key as "name" | "email" | "username"] !== value,
        )
      )
        await ctx.db.patch(profile._id, identityFields);
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_subject", (q) => q.eq("subject", user.subject))
        .take(10);
      for (const member of memberships)
        if (
          Object.entries(identityFields).some(
            ([key, value]) =>
              member.data[key as "name" | "email" | "username"] !== value,
          )
        )
          await ctx.db.patch(member._id, {
            data: { ...member.data, ...identityFields },
          });
      if (
        !memberships.some(
          (member) => member.workspaceId === profile!.activeWorkspaceId,
        )
      ) {
        const workspaceId =
          memberships[0]?.workspaceId ??
          (await createWorkspace(
            ctx,
            user.subject,
            user.name ?? "You",
            user.email ?? "",
            "personal",
          ));
        await ctx.db.patch(profile._id, { activeWorkspaceId: workspaceId });
        profile = { ...profile, activeWorkspaceId: workspaceId };
      }
    }
    if (profile?.activeWorkspaceId) {
      const workspace = await ctx.db.get(profile.activeWorkspaceId);
      if (workspace) {
        await authorized(ctx, workspace._id, user.subject);
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
          .take(1000);
        for (const task of tasks) {
          const status = task.data.status;
          if (["idea", "blocked", "rejected", "canceled"].includes(status))
            await ctx.db.patch(task._id, {
              data: {
                ...task.data,
                status: status === "idea" ? "backlog" : "archived",
              },
            });
        }
        const calendar = await ctx.db
          .query("calendarStatuses")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspace._id).eq("key", user.subject),
          )
          .unique();
        if (calendar?.data.status === "disconnected")
          await ctx.db.patch(calendar._id, {
            data: {
              ...calendar.data,
              status: "native",
              selectedIds: [],
              destinationId: "kazi",
              lastSync: Date.now(),
            },
          });
        if (!calendar)
          await ctx.db.insert("calendarStatuses", {
            workspaceId: workspace._id,
            key: user.subject,
            data: {
              ownerId: user.subject,
              status: "native",
              selectedIds: [],
              destinationId: "kazi",
              lastSync: Date.now(),
            },
          });
        const project = await ctx.db
          .query("projects")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspace._id).eq("key", workspace.inboxId),
          )
          .unique();
        if (project && ["Inbox", "Team Inbox"].includes(project.data.title))
          await ctx.db.patch(project._id, {
            data: {
              ...project.data,
              title: "Personal planning",
              icon: "calendar",
              description:
                "Tasks outside a named project. Visibility follows project access.",
            },
          });
      }
    }
    return profile?.activeWorkspaceId;
  },
});
export const statesForActor = internalQuery({
  args: { teamIds: v.array(v.id("workspaces")), subject: v.string() },
  handler: async (ctx, args) => {
    if (args.teamIds.length > 10)
      throw new ConvexError("Choose up to ten teams.");
    return Promise.all(
      [...new Set(args.teamIds)].map(async (id) => {
        await authorized(ctx, id, args.subject);
        return {
          id: String(id),
          state: clean(visibleState(await loadState(ctx, id), args.subject)),
        };
      }),
    );
  },
});
export const allSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const user = await identity(ctx),
      memberships = await ctx.db
        .query("memberships")
        .withIndex("by_subject", (q) => q.eq("subject", user.subject))
        .take(10);
    return Promise.all(
      memberships.map(async (member) => ({
        id: String(member.workspaceId),
        state: clean(
          visibleState(await loadState(ctx, member.workspaceId), user.subject),
        ),
      })),
    );
  },
});
export const workspaces = query({
  args: {},
  handler: async (ctx) => {
    const user = await identity(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_subject", (q) => q.eq("subject", user.subject))
      .take(50);
    return Promise.all(
      memberships.map(async (m) => {
        const w = await ctx.db.get(m.workspaceId);
        return w
          ? {
              id: w._id,
              key: w.key,
              name: w.name,
              kind: w.kind,
              role: m.data.role,
              ...(m.data.favoriteTeamAt !== undefined
                ? { favoriteAt: m.data.favoriteTeamAt }
                : {}),
            }
          : null;
      }),
    );
  },
});
async function createTeamAs(
  ctx: import("./_generated/server").MutationCtx,
  args: { name: string },
  subject: string,
) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .unique();
  if (!args.name.trim() || args.name.length > 100)
    throw new ConvexError("Enter a team name up to 100 characters.");
  const existing = await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .take(11);
  if (existing.length >= 10)
    throw new ConvexError("Initial rollout supports ten workspaces per user.");
  const workspaceId = await createWorkspace(
    ctx,
    subject,
    profile?.name ?? "You",
    profile?.email ?? "",
    "team",
    args.name.trim(),
  );
  if (profile?.username) {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", subject),
      )
      .unique();
    if (member)
      await ctx.db.patch(member._id, {
        data: { ...member.data, username: profile.username },
      });
  }
  return workspaceId;
}
export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) =>
    createTeamAs(ctx, args, (await identity(ctx)).subject),
});
export const createTeamFor = internalMutation({
  args: { name: v.string(), subject: v.string() },
  handler: async (ctx, args) => createTeamAs(ctx, args, args.subject),
});
// Collaboration uses the existing application scope; projects and IDs are retained.
async function enableAs(
  ctx: import("./_generated/server").MutationCtx,
  workspaceId: import("./_generated/dataModel").Id<"workspaces">,
  subject: string,
) {
  const member = await authorized(ctx, workspaceId, subject);
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.ownerId !== subject || member.role !== "owner")
    throw new ConvexError("Only the owner can enable collaboration.");
  if (workspace.kind === "team") return;
  await ctx.db.patch(workspaceId, { kind: "team" });
  const key = newId();
  await ctx.db.insert("activities", {
    workspaceId,
    key,
    data: {
      id: key,
      actorId: subject,
      at: Date.now(),
      kind: "change",
      message: "Enabled collaboration in Kazi",
    },
  });
}
export const enableCollaboration = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) =>
    enableAs(ctx, workspaceId, (await identity(ctx)).subject),
});
export const enableFor = internalMutation({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, { workspaceId, subject }) =>
    enableAs(ctx, workspaceId, subject),
});

export const snapshot = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }): Promise<State> => {
    const user = await authorized(ctx, workspaceId);
    return clean(visibleState(await loadState(ctx, workspaceId), user.id));
  },
});

export const execute = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    command: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await authorized(ctx, args.workspaceId);
    const command = commandSchema.parse(JSON.parse(args.command));
    if (
      ["approve", "propose", "invite", "release_sessions"].includes(
        command.type,
      )
    )
      throw new ConvexError({
        code: "ACTION_REQUIRED",
        message:
          "Use the dedicated verified action for planning, invitations, or scheduling.",
      });
    return run(ctx, args.workspaceId, user.id, command, args.requestId);
  },
});
async function run(
  ctx: import("./_generated/server").MutationCtx,
  workspaceId: import("./_generated/dataModel").Id<"workspaces">,
  subject: string,
  command: Command,
  requestId: string,
  verifiedCalendar = false,
  automatic = false,
  invitationHash?: string,
): Promise<string> {
  await authorized(ctx, workspaceId, subject);
  if (requestId.length > 180) throw new ConvexError("Request key is too long.");
  const key = subject + ":" + requestId,
    previous = await ctx.db
      .query("idempotency")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", key),
      )
      .unique();
  if (previous) return previous.result;
  if (command.type === "propose") {
    const windowAt = Math.floor(Date.now() / 900000) * 900000;
    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_actor", (q) =>
        q.eq("workspaceId", workspaceId).eq("subject", subject),
      )
      .unique();
    if (rate?.windowAt === windowAt && rate.count >= 10)
      throw new ConvexError({
        code: "RATE_LIMIT",
        message:
          "Planning is temporarily limited to ten previews per 15 minutes. Your existing work remains available.",
      });
    if (rate)
      await ctx.db.patch(rate._id, {
        windowAt,
        count: rate.windowAt === windowAt ? rate.count + 1 : 1,
      });
    else
      await ctx.db.insert("rateLimits", {
        workspaceId,
        subject,
        windowAt,
        count: 1,
      });
  }
  const before = await loadState(ctx, workspaceId);
  const input = structuredClone(before);
  if (command.type === "propose" || command.type === "approve") {
    const owners =
      command.type === "approve"
        ? [
            ...new Set(
              input.proposals
                .find((p) => p.id === command.id)
                ?.alternatives.flatMap((a) =>
                  a.sessions.map((s) => s.assigneeId),
                ) ?? [],
            ),
          ]
        : command.sprintId
          ? [
              ...new Set(
                input.tasks
                  .filter((task) =>
                    input.sprints
                      ?.find((sprint) => sprint.id === command.sprintId)
                      ?.taskIds.includes(task.id),
                  )
                  .flatMap((task) =>
                    task.assigneeId ? [task.assigneeId] : [],
                  ),
              ),
            ]
          : command.projectId
            ? [
                ...new Set(
                  input.tasks
                    .filter((t) => t.projectId === command.projectId)
                    .flatMap((t) => (t.assigneeId ? [t.assigneeId] : [])),
                ),
              ]
            : [subject];
    input.busy = input.busy.filter((span) => span.source !== "kazi");
    for (const owner of owners)
      input.busy.push(
        ...(await crossTeamReservations(ctx, owner, workspaceId)),
      );
  }
  const { state, result } = reduce(input, command, {
    actorId: subject,
    now: Date.now(),
    id: newId,
    verifiedCalendar,
    automatic,
    invitationHash,
  });
  await persist(ctx, workspaceId, before, state);
  if (command.type === "start_sprint") {
    const sprint = state.sprints!.find((item) => item.id === command.id)!;
    if (sprint.backlogPromotedAt === undefined)
      await ctx.scheduler.runAt(
        localInstant(sprint.startDate, 0, sprint.timezone),
        internal.jobs.activateSprint,
        { workspaceId, sprintId: sprint.id },
      );
  }
  await ctx.db.insert("idempotency", {
    workspaceId,
    key,
    actorId: subject,
    result,
    createdAt: Date.now(),
  });
  if (command.type === "approve") {
    const p = state.proposals.find((p) => p.id === command.id)!;
    if (p.status === "applying")
      for (const session of p.alternatives[p.selected].sessions.filter(
        (session) => session.status === "pending",
      )) {
        const existing = await ctx.db
          .query("outbox")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("key", session.id),
          )
          .unique();
        if (!existing) {
          const eventId = "k" + (await sha256(session.id)).slice(0, 48);
          await ctx.db.insert("outbox", {
            workspaceId,
            key: session.id,
            actorId: subject,
            proposalId: p.id,
            sessionId: session.id,
            eventId,
            calendarId: state.calendars.find(
              (c) => c.ownerId === session.assigneeId,
            )!.destinationId!,
            status: "pending",
            attempts: 0,
            nextAttemptAt: Date.now(),
          });
        }
      }
    await ctx.scheduler.runAfter(0, internal.jobs.dispatch, {});
  }
  return result;
}
export const verified = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    command: v.string(),
    requestId: v.string(),
    automatic: v.optional(v.boolean()),
    invitationHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> =>
    run(
      ctx,
      args.workspaceId,
      args.subject,
      commandSchema.parse(JSON.parse(args.command)),
      args.requestId,
      true,
      args.automatic,
      args.invitationHash,
    ),
});
export const stateForActor = internalQuery({
  args: { workspaceId: v.id("workspaces"), subject: v.string() },
  handler: async (ctx, args): Promise<State> => {
    await authorized(ctx, args.workspaceId, args.subject);
    return loadState(ctx, args.workspaceId);
  },
});
export const plan = action({
  args: {
    workspaceId: v.id("workspaces"),
    command: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    const command = commandSchema.parse(JSON.parse(args.command));
    if (!["propose", "approve"].includes(command.type))
      throw new ConvexError("Unsupported planning action.");
    await ctx.runQuery(internal.commands.stateForActor, {
      workspaceId: args.workspaceId,
      subject: user.subject,
    });
    await ctx.runAction(internal.calendar.refreshScope, {
      workspaceId: args.workspaceId,
      subject: user.subject,
      ...(command.type === "propose" && command.projectId
        ? { projectId: command.projectId }
        : {}),
      ...(command.type === "propose" && command.sprintId
        ? { sprintId: command.sprintId }
        : {}),
      ...(command.type === "approve" ? { proposalId: command.id } : {}),
    });
    return ctx.runMutation(internal.commands.verified, {
      ...args,
      subject: user.subject,
    });
  },
});
export const invite = action({
  args: {
    workspaceId: v.id("workspaces"),
    command: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runAction(internal.commands.inviteFor, {
      ...args,
      subject: user.subject,
    });
  },
});
export const inviteFor = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    command: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const user = { subject: args.subject };
    const command = commandSchema.parse(JSON.parse(args.command));
    if (command.type !== "invite") throw new ConvexError("Invalid invitation.");
    const token = await invitationToken(
      user.subject,
      args.workspaceId,
      args.requestId,
    );
    const invitationId = await ctx.runMutation(internal.commands.verified, {
      ...args,
      subject: user.subject,
      invitationHash: await sha256(token),
    });
    await ctx.runMutation(internal.commands.queueInvitationEmail, {
      workspaceId: args.workspaceId,
      subject: user.subject,
      requestId: args.requestId,
      invitationId,
    });
    return { url: `${process.env.APP_ORIGIN}/join?token=${token}` };
  },
});
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await identity(ctx),
      hash = await sha256(token);
    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("tokenHash", hash))
      .unique();
    if (
      !invite ||
      invite.data.expiresAt < Date.now() ||
      invite.data.status !== "pending" ||
      !user.emailVerified ||
      user.email?.toLowerCase() !== invite.data.email
    )
      throw new ConvexError(
        "This invitation is expired, revoked, already used, or intended for another verified email address.",
      );
    const workspace = await ctx.db.get(invite.workspaceId);
    if (!workspace) throw new ConvexError("Workspace unavailable.");
    const old = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("key", user.subject),
      )
      .unique();
    if (!old)
      await ctx.db.insert("memberships", {
        workspaceId: invite.workspaceId,
        key: user.subject,
        subject: user.subject,
        data: {
          id: user.subject,
          name: user.name ?? "Teammate",
          email: user.email ?? "",
          ...(typeof user.preferredUsername === "string"
            ? { username: user.preferredUsername }
            : {}),
          role: invite.data.role,
          color: "clay",
          preferences: { ...defaults },
        },
      });
    const calendar = await ctx.db
      .query("calendarStatuses")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("key", user.subject),
      )
      .unique();
    if (!calendar)
      await ctx.db.insert("calendarStatuses", {
        workspaceId: invite.workspaceId,
        key: user.subject,
        data: {
          ownerId: user.subject,
          status: "native",
          selectedIds: [],
          destinationId: "kazi",
          lastSync: Date.now(),
        },
      });
    for (const id of invite.data.projectIds) {
      const p = await ctx.db
        .query("projects")
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", invite.workspaceId).eq("key", id),
        )
        .unique();
      if (p)
        await ctx.db.patch(p._id, {
          data: {
            ...p.data,
            memberIds: [...new Set([...p.data.memberIds, user.subject])],
          },
        });
    }
    await ctx.db.patch(invite._id, {
      data: { ...invite.data, status: "accepted" },
    });
    return invite.workspaceId;
  },
});
export const release = action({
  args: {
    workspaceId: v.id("workspaces"),
    command: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Sign in first.");
    return ctx.runMutation(internal.commands.queueRelease, {
      ...args,
      subject: user.subject,
    });
  },
});
export const queueRelease = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    command: v.string(),
    requestId: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    await authorized(ctx, args.workspaceId, args.subject);
    const command = commandSchema.parse(JSON.parse(args.command));
    if (command.type !== "release_sessions")
      throw new ConvexError("Invalid release request.");
    const state = await loadState(ctx, args.workspaceId);
    // Validate exact IDs, current membership, calendar ownership, future-only scope.
    reduce(state, command, {
      actorId: args.subject,
      now: Date.now(),
      id: newId,
      verifiedCalendar: true,
    });
    const version = state.versions.find((v) => v.id === command.versionId)!;
    const nativeIds = command.sessionIds.filter((id) => {
      const session = version.sessions.find((s) => s.id === id);
      return (
        session &&
        version.inputs?.calendarDestinations?.[session.assigneeId] === "kazi"
      );
    });
    if (nativeIds.length)
      await run(
        ctx,
        args.workspaceId,
        args.subject,
        { ...command, sessionIds: nativeIds },
        args.requestId + ":native",
        true,
      );
    const externalIds = command.sessionIds.filter(
      (id) => !nativeIds.includes(id),
    );
    if (!externalIds.length)
      return "Future Kazi reservations released; accepted snapshot preserved.";
    for (const sessionId of externalIds) {
      const key = "release:" + sessionId,
        old = await ctx.db
          .query("outbox")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("key", key),
          )
          .unique();
      if (old) continue;
      const original = await ctx.db
        .query("outbox")
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("key", sessionId),
        )
        .unique();
      if (!original || original.status !== "done")
        throw new ConvexError(
          "Wait for calendar creation to be confirmed before releasing this session.",
        );
      await ctx.db.insert("outbox", {
        workspaceId: args.workspaceId,
        key,
        actorId: args.subject,
        proposalId: version.proposalId,
        sessionId,
        eventId: original.eventId,
        calendarId: original.calendarId,
        operation: "release",
        status: "pending",
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    }
    await ctx.scheduler.runAfter(0, internal.jobs.dispatch, {});
    return "Release queued; confirmation will appear in the scheduling receipt.";
  },
});
export const exportData = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await authorized(ctx, args.workspaceId);
    return {
      format: "kazi-export/1",
      exportedAt: Date.now(),
      data: clean(
        visibleState(await loadState(ctx, args.workspaceId), user.id),
      ),
    };
  },
});

export const queueInvitationEmail = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    requestId: v.string(),
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorized(ctx, args.workspaceId, args.subject);
    if (!["owner", "admin"].includes(actor.role))
      throw new ConvexError("A team manager must invite people.");
    const row = await ctx.db
      .query("invitations")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", args.invitationId),
      )
      .unique();
    if (!row || row.data.status !== "pending") return;
    const old = await ctx.db
      .query("invitationOutbox")
      .withIndex("by_invitation", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("invitationId", args.invitationId),
      )
      .unique();
    if (old) return;
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.INVITE_EMAIL_FROM ||
      !process.env.APP_ORIGIN
    ) {
      await ctx.db.patch(row._id, {
        data: { ...row.data, deliveryStatus: "not_configured" },
      });
      return;
    }
    const workspace = await ctx.db.get(args.workspaceId);
    const id = await ctx.db.insert("invitationOutbox", {
      ...args,
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      from: process.env.INVITE_EMAIL_FROM,
      teamName: workspace!.name,
      appOrigin: process.env.APP_ORIGIN,
    });
    await ctx.db.patch(row._id, {
      data: { ...row.data, deliveryStatus: "queued" },
    });
    await ctx.scheduler.runAfter(0, internal.commands.sendInvitationEmail, {
      id,
    });
  },
});
export const claimInvitationEmail = internalMutation({
  args: { id: v.id("invitationOutbox") },
  handler: async (ctx, { id }) => {
    const intent = await ctx.db.get(id);
    if (
      !intent ||
      ["sent", "failed"].includes(intent.status) ||
      intent.nextAttemptAt > Date.now()
    )
      return null;
    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", intent.workspaceId).eq("key", intent.invitationId),
      )
      .unique();
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", intent.workspaceId).eq("key", intent.subject),
      )
      .unique();
    if (
      !invite ||
      invite.data.status !== "pending" ||
      invite.data.expiresAt <= Date.now() ||
      !membership ||
      !["owner", "admin"].includes(membership.data.role) ||
      Date.now() - intent.createdAt > 23 * 3600000 ||
      intent.attempts >= 3
    ) {
      await ctx.db.patch(id, {
        status: "failed",
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        error:
          "Invitation expired, authority changed, or safe retry window ended.",
      });
      if (invite)
        await ctx.db.patch(invite._id, {
          data: {
            ...invite.data,
            deliveryStatus: "failed",
            deliveryError:
              "Invitation expired, authority changed, or safe retry window ended.",
          },
        });
      return null;
    }
    await ctx.db.patch(id, {
      status: "sending",
      attempts: intent.attempts + 1,
      nextAttemptAt: Date.now() + 120000,
    });
    return {
      ...intent,
      attempts: intent.attempts + 1,
      email: invite.data.email,
    };
  },
});
export const sendInvitationEmail = internalAction({
  args: { id: v.id("invitationOutbox") },
  handler: async (ctx, { id }): Promise<void> => {
    const intent = await ctx.runMutation(
      internal.commands.claimInvitationEmail,
      { id },
    );
    if (!intent) return;
    try {
      if (!process.env.RESEND_API_KEY)
        throw new Error("Email delivery is not configured.");
      const token = await invitationToken(
        intent.subject,
        intent.workspaceId,
        intent.requestId,
      );
      const url = intent.appOrigin + "/join?token=" + token;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": "kazi-invite/" + intent.invitationId,
        },
        body: JSON.stringify({
          from: intent.from,
          to: [intent.email],
          subject:
            "Join " + intent.teamName.replace(/[\r\n]/g, " ") + " on Kazi",
          text:
            "You have been invited to " +
            intent.teamName +
            " on Kazi. Create an account or sign in with this email address, then accept your invitation: " +
            url +
            "\n\nThis invitation expires in seven days. If you were not expecting it, you can ignore this message.",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429 || response.status >= 500
            ? "Email provider temporarily unavailable."
            : "Email provider rejected the invitation. Check the verified sender configuration.",
        );
      await ctx.runMutation(internal.commands.invitationEmailResult, {
        id,
        sent: true,
      });
    } catch (error) {
      await ctx.runMutation(internal.commands.invitationEmailResult, {
        id,
        sent: false,
        error:
          error instanceof Error ? error.message : "Email delivery failed.",
      });
    }
  },
});
export const invitationEmailResult = internalMutation({
  args: {
    id: v.id("invitationOutbox"),
    sent: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.id);
    if (!intent || intent.status === "sent") return;
    const retry =
      !args.sent &&
      intent.attempts < 3 &&
      Date.now() - intent.createdAt < 23 * 3600000;
    await ctx.db.patch(
      args.id,
      clean({
        status: args.sent ? "sent" : retry ? "pending" : "failed",
        nextAttemptAt: args.sent
          ? Number.MAX_SAFE_INTEGER
          : Date.now() + 60000 * 2 ** intent.attempts,
        error: args.error,
      }),
    );
    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", intent.workspaceId).eq("key", intent.invitationId),
      )
      .unique();
    if (invite)
      await ctx.db.patch(invite._id, {
        data: clean({
          ...invite.data,
          deliveryStatus: args.sent ? "sent" : retry ? "queued" : "failed",
          deliveryError: args.error,
        }),
      });
    if (retry)
      await ctx.scheduler.runAfter(
        60000 * 2 ** intent.attempts,
        internal.commands.sendInvitationEmail,
        { id: args.id },
      );
  },
});
