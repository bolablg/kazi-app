import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "../shared/workflow";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { authorized, loadState, persist, newId } from "./store";
import {
  evaluateRisks,
  taskFor,
  projectFor,
  nextRiskEvaluation,
} from "../shared/domain";
import { deadlineAt, addDays, dateInZone } from "../shared/scheduler";
import { accessToken } from "./calendar";
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const status of ["pending", "sending"] as const) {
      const due = await ctx.db
        .query("invitationOutbox")
        .withIndex("by_due", (q) =>
          q.eq("status", status).lte("nextAttemptAt", Date.now()),
        )
        .take(3);
      for (const item of due)
        await ctx.scheduler.runAfter(0, internal.commands.sendInvitationEmail, {
          id: item._id,
        });
    }
    const cursors = await ctx.db
      .query("calendarCursors")
      .withIndex("by_due", (q) => q.lte("nextSyncAt", Date.now()))
      .take(3);
    for (const cursor of cursors) {
      await ctx.db.patch(cursor._id, { nextSyncAt: Date.now() + 900000 });
      await ctx.scheduler.runAfter(0, internal.calendar.syncEvents, {
        cursorId: cursor._id,
      });
    }
    const due = await ctx.db
      .query("workspaces")
      .withIndex("by_due", (q) => q.lte("nextEvaluationAt", Date.now()))
      .take(1);
    for (const w of due) {
      const before = await loadState(ctx, w._id),
        after = evaluateRisks(before, {
          actorId: w.ownerId,
          now: Date.now(),
          id: newId,
        });
      for (const p of after.proposals)
        if (p.status === "awaiting_review" && p.expiresAt < Date.now())
          p.status = "stale";
      await persist(ctx, w._id, before, after);
      await ctx.db.patch(w._id, {
        nextEvaluationAt: nextRiskEvaluation(after, Date.now()),
      });
      const scopes = new Set(
        after.tasks
          .filter(
            (t) =>
              isSchedulableTask(t) &&
              t.assigneeId &&
              deadlineAt(
                t.deadline,
                after.members.find((m) => m.id === t.assigneeId)?.preferences
                  .timezone ?? "UTC",
              ) < Date.now(),
          )
          .map((t) => t.projectId),
      );
      for (const project of after.projects) {
        if (
          project.deadline &&
          !project.archived &&
          deadlineAt(
            project.deadline,
            after.members.find((m) => m.id === project.ownerId)?.preferences
              .timezone ?? "UTC",
          ) < Date.now() &&
          after.tasks.some(
            (t) => t.projectId === project.id && isSchedulableTask(t),
          )
        )
          scopes.add(project.id);
      }
      for (const projectId of [...scopes].slice(0, 5)) {
        const project = after.projects.find((p) => p.id === projectId);
        if (!project || project.archived) continue;
        const last = after.versions
          .filter((v) => v.projectId === projectId)
          .sort((a, b) => b.number - a.number)[0];
        if (
          last?.trigger === "recovery" &&
          (!last.recoveryTarget ||
            deadlineAt(
              last.recoveryTarget,
              after.members.find((m) => m.id === project.ownerId)?.preferences
                .timezone ?? "UTC",
            ) > Date.now())
        )
          continue;
        await ctx.scheduler.runAfter(0, internal.jobs.recover, {
          workspaceId: w._id,
          projectId,
          subject: project.ownerId,
        });
      }
    }
    await ctx.scheduler.runAfter(0, internal.jobs.dispatch, {});
    // Compact spent credentials and idempotency records, never accepted plan history.
    const expired = await ctx.db.query("oauthStates").take(50);
    for (const x of expired)
      if (x.expiresAt < Date.now() - 86400000) await ctx.db.delete(x._id);
  },
});
export const recover = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    projectId: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const s = await ctx.runQuery(internal.commands.stateForActor, {
      workspaceId: args.workspaceId,
      subject: args.subject,
    });
    const member = s.members.find((m) => m.id === args.subject);
    if (!member) return;
    try {
      await ctx.runAction(internal.calendar.refreshScope, {
        workspaceId: args.workspaceId,
        subject: args.subject,
        projectId: args.projectId,
      });
    } catch {
      return;
    }
    const day = dateInZone(Date.now(), member.preferences.timezone),
      last = s.versions
        .filter((v) => v.projectId === args.projectId)
        .sort((a, b) => b.number - a.number)[0];
    const proposalId = await ctx.runMutation(internal.commands.verified, {
      workspaceId: args.workspaceId,
      subject: args.subject,
      requestId: `recovery:${args.projectId}:${last?.id ?? "first"}`,
      command: JSON.stringify({
        type: "propose",
        projectId: args.projectId,
        startDate: day,
        days: member.preferences.horizonDays,
        recoveryTarget: addDays(day, member.preferences.horizonDays - 1),
        trigger: "recovery",
      }),
      automatic: !member.preferences.reviewRequired,
    });
    const current = await ctx.runQuery(internal.commands.stateForActor, {
      workspaceId: args.workspaceId,
      subject: args.subject,
    });
    const p = current.proposals.find((p) => p.id === proposalId);
    if (
      !p ||
      p.status !== "awaiting_review" ||
      member.preferences.reviewRequired
    )
      return;
    const owners = [
      ...new Set(p.alternatives[p.selected].sessions.map((x) => x.assigneeId)),
    ];
    if (
      !owners.length ||
      owners.some(
        (id) =>
          current.members.find((m) => m.id === id)?.preferences
            .reviewRequired !== false,
      )
    )
      return;
    try {
      await ctx.runMutation(internal.commands.verified, {
        workspaceId: args.workspaceId,
        subject: args.subject,
        command: JSON.stringify({
          type: "approve",
          id: p.id,
          revision: p.revision,
        }),
        requestId: `auto:${p.id}:${p.revision}`,
        automatic: true,
      });
    } catch {
      /* Review stays visible; no blind retry of rejected authority. */
    }
  },
});
export const dueWrites = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("outbox")
      .withIndex("by_due", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", Date.now()),
      )
      .take(8),
});
export const dispatch = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const writes = await ctx.runQuery(internal.jobs.dueWrites, {});
    for (const write of writes)
      await ctx.runAction(internal.jobs.write, { outboxId: write._id });
  },
});
export const authorizeWrite = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const outbox = await ctx.db.get(outboxId);
    if (!outbox || outbox.status !== "pending") return null;
    const s = await loadState(ctx, outbox.workspaceId);
    await authorized(ctx, outbox.workspaceId, outbox.actorId);
    const p = s.proposals.find((p) => p.id === outbox.proposalId);
    if (
      !p ||
      !(
        outbox.operation === "release"
          ? ["applied", "applying", "partial", "failed"]
          : ["applying", "partial", "failed"]
      ).includes(p.status)
    )
      throw new Error("This plan no longer authorizes calendar writes.");
    const session = p.alternatives[p.selected].sessions.find(
      (s) => s.id === outbox.sessionId,
    );
    if (!session) throw new Error("Session missing.");
    const owner = s.members.find((m) => m.id === session.assigneeId);
    if (!owner)
      throw new Error("Calendar owner no longer has workspace access.");
    if (
      outbox.operation === "release" &&
      (session.assigneeId !== outbox.actorId || session.start <= Date.now())
    )
      throw new Error("Only your own future sessions may be released.");
    if (
      outbox.operation !== "release" &&
      (!owner ||
        (!p.approvedBy.includes(owner.id) && !p.automatic) ||
        (p.automatic &&
          (owner?.preferences.reviewRequired ||
            s.projects.some(
              (project) =>
                project.reviewRequired === true &&
                (project.id === p.projectId ||
                  (p.sprintId &&
                    Object.keys(p.taskRevisions).some((id) =>
                      s.tasks.some(
                        (task) =>
                          task.id === id && task.projectId === project.id,
                      ),
                    ))),
            ))))
    )
      throw new Error("Calendar owner approval is required.");
    const task = taskFor(s, session.taskId, outbox.actorId);
    if (
      outbox.operation !== "release" &&
      (task.revision !== p.taskRevisions[task.id] ||
        task.assigneeId !== session.assigneeId)
    )
      throw new Error("Task facts changed. Review a fresh proposal.");
    projectFor(s, task.projectId, owner.id);
    const calendar = s.calendars.find((c) => c.ownerId === owner.id);
    if (!owner || calendar?.status !== "connected" || !calendar.destinationId)
      throw new Error("Reconnect the session owner’s calendar.");
    if (!outbox.calendarId)
      throw new Error(
        "The original calendar destination is unavailable. Reconcile this intent before retrying.",
      );
    if (
      outbox.operation !== "release" &&
      outbox.calendarId !== calendar.destinationId
    )
      throw new Error("Calendar selection changed. Review a fresh proposal.");
    return { outbox, session, calendar, title: task.title };
  },
});
export const write = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, args): Promise<void> => {
    try {
      let item = await ctx.runQuery(internal.jobs.authorizeWrite, args);
      if (!item) return;
      const token = await accessToken(ctx, item.session.assigneeId),
        url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(item.outbox.calendarId!)}/events/${item.outbox.eventId}`;
      // A caller-supplied deterministic provider ID survives uncertain POST outcomes.
      const existing = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
      });
      if (item.outbox.operation === "release") {
        if (existing.status === 404 || existing.status === 410) {
          await ctx.runMutation(internal.jobs.receipt, {
            ...args,
            success: true,
          });
          return;
        }
        if (!existing.ok)
          throw new Error(
            "Google event reconciliation is unavailable. Retry is pending.",
          );
        const event = await existing.json();
        if (event.extendedProperties?.private?.kaziSession !== item.session.id)
          throw new Error("The provider event ID belongs to another resource.");
        if (
          !event.start?.dateTime ||
          Date.parse(event.start.dateTime) <= Date.now()
        )
          throw new Error(
            "This event is now in the past. It cannot be released.",
          );
        await ctx.runQuery(internal.jobs.authorizeWrite, args);
        const removed = await fetch(url + "?sendUpdates=none", {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        });
        if (!removed.ok && ![404, 410].includes(removed.status))
          throw new Error(
            "Calendar release outcome is uncertain. Retry is pending.",
          );
        await ctx.runMutation(internal.jobs.receipt, {
          ...args,
          success: true,
        });
        return;
      }
      if (existing.ok) {
        const event = await existing.json();
        if (event.extendedProperties?.private?.kaziSession !== item.session.id)
          throw new Error("The provider event ID belongs to another resource.");
        await ctx.runMutation(internal.jobs.receipt, {
          ...args,
          success: true,
        });
        return;
      }
      if (existing.status !== 404)
        throw new Error(
          "Google event reconciliation is unavailable. Retry is pending.",
        );
      await ctx.runAction(internal.calendar.refreshFor, {
        workspaceId: item.outbox.workspaceId,
        subject: item.session.assigneeId,
      });
      item = await ctx.runQuery(internal.jobs.authorizeWrite, args);
      if (!item) return;
      const state = await ctx.runQuery(internal.commands.stateForActor, {
        workspaceId: item.outbox.workspaceId,
        subject: item.outbox.actorId,
      });
      if (
        state.busy.some(
          (b) =>
            b.ownerId === item!.session.assigneeId &&
            b.start < item!.session.end &&
            b.end > item!.session.start,
        )
      )
        throw new Error(
          "Availability changed. A new meeting overlaps this session. Review a fresh proposal.",
        );
      if (item.session.start < Date.now())
        throw new Error(
          "This session is in the past. Review a fresh proposal.",
        );
      const response = await fetch(
        url.slice(0, url.lastIndexOf("/")) + "?sendUpdates=none",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.outbox.eventId,
            summary: item.title,
            start: { dateTime: new Date(item.session.start).toISOString() },
            end: { dateTime: new Date(item.session.end).toISOString() },
            transparency: "opaque",
            extendedProperties: {
              private: {
                kaziSession: item.session.id,
                kaziProposal: item.outbox.proposalId,
              },
            },
          }),
        },
      );
      if (!response.ok && response.status !== 409)
        throw new Error(
          response.status === 429
            ? "Google is rate limited. Retry is pending."
            : "Calendar write outcome is uncertain. Kazi will reconcile before retrying.",
        );
      if (response.status === 409) {
        const check = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
        });
        if (!check.ok) throw new Error("Event reconciliation is pending.");
        const b = await check.json();
        if (b.extendedProperties?.private?.kaziSession !== item.session.id)
          throw new Error("Provider event ownership mismatch.");
      }
      await ctx.runMutation(internal.jobs.receipt, { ...args, success: true });
    } catch (e) {
      await ctx.runMutation(internal.jobs.receipt, {
        ...args,
        success: false,
        error: e instanceof Error ? e.message : "Calendar write failed.",
      });
    }
  },
});
export const receipt = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.outboxId);
    if (!item || item.status === "done") return;
    const attempts = item.attempts + 1;
    const paused =
      /approval|changed|past|reconnect|unavailable|access|authoriz|overlap/i.test(
        args.error ?? "",
      );
    const status = args.success
      ? "done"
      : paused
        ? "paused"
        : attempts >= 6
          ? "failed"
          : "pending";
    await ctx.db.patch(item._id, {
      status,
      attempts,
      nextAttemptAt: Date.now() + Math.min(3600000, 2 ** attempts * 15000),
      ...(args.error ? { error: args.error } : {}),
    });
    const p = await ctx.db
      .query("proposals")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", item.workspaceId).eq("key", item.proposalId),
      )
      .unique();
    if (!p) return;
    const data = structuredClone(p.data);
    const session = data.alternatives[data.selected].sessions.find(
      (s) => s.id === item.sessionId,
    );
    if (session) {
      session.status = args.success
        ? item.operation === "release"
          ? "released"
          : "scheduled"
        : "failed";
      if (args.success) {
        session.eventId = item.eventId;
        delete session.error;
      } else session.error = args.error;
    }
    const sessions = data.alternatives[data.selected].sessions;
    data.status =
      item.operation === "release"
        ? "partial"
        : sessions.every((s) => s.status === "scheduled")
          ? data.alternatives[data.selected].remainingMinutes
            ? "partial"
            : "applied"
          : sessions.some((s) => s.status === "scheduled")
            ? "partial"
            : status === "pending"
              ? "applying"
              : "failed";
    await ctx.db.patch(p._id, { data });
    const key = "receipt:" + item.proposalId + ":" + data.status;
    const old = await ctx.db
      .query("notifications")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", item.workspaceId).eq("key", key),
      )
      .unique();
    if (!old)
      await ctx.db.insert("notifications", {
        workspaceId: item.workspaceId,
        key,
        recipientId: item.actorId,
        data: {
          id: key,
          key,
          recipientId: item.actorId,
          proposalId: item.proposalId,
          title:
            data.status === "applied"
              ? "Your plan is on the calendar"
              : "Your scheduling receipt",
          body: `${sessions.filter((s) => s.status === "scheduled").length} of ${sessions.length} sessions confirmed; ${sessions.filter((s) => s.status === "released").length} future reservations released.${args.error ? " " + args.error : ""}`,
          kind: "system",
          createdAt: Date.now(),
          deliveryAt: Date.now(),
          read: false,
        },
      });
    if (status === "pending")
      await ctx.scheduler.runAfter(
        Math.min(3600000, 2 ** attempts * 15000),
        internal.jobs.dispatch,
        {},
      );
  },
});
export const diagnostics = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await authorized(ctx, args.workspaceId);
    if (!["owner", "admin"].includes(user.role))
      throw new Error("Only workspace managers can inspect job diagnostics.");
    const jobs = await ctx.db
      .query("outbox")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    return jobs.map((j) => ({
      id: j._id,
      status: j.status,
      attempts: j.attempts,
      error: j.error,
      nextAttemptAt: j.nextAttemptAt,
    }));
  },
});
