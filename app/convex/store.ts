import { upgradeDefaultProject } from "../shared/workflow";
import { transactionId } from "../shared/ids";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { type State, type Member, defaults, fail } from "../shared/model";
import { actor } from "../shared/domain";
export const tables = {
  members: "memberships",
  projects: "projects",
  tasks: "tasks",
  sprints: "sprints",
  proposals: "proposals",
  versions: "versions",
  iterations: "iterations",
  attempts: "attempts",
  notifications: "notifications",
  activities: "activities",
  artifacts: "taskArtifacts",
  invitations: "invitations",
  calendars: "calendarStatuses",
  busy: "busy",
} as const;
export type EntityField = keyof typeof tables;
export const newId = transactionId;
export const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export async function identity(ctx: QueryCtx | MutationCtx) {
  const i = await ctx.auth.getUserIdentity();
  if (!i)
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
    });
  return i;
}
export async function authorized(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  subject?: string,
) {
  const id = subject ?? (await identity(ctx)).subject;
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_key", (q) => q.eq("workspaceId", workspaceId).eq("key", id))
    .unique();
  if (!member)
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "This workspace is unavailable.",
    });
  return member.data;
}
export async function loadState(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<State> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) fail("FORBIDDEN", "Workspace unavailable.");
  const records = await Promise.all(
    Object.entries(tables).map(async ([field, table]) => {
      const limit = field === "activities" ? 200 : 1001;
      const docs = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .order(field === "activities" ? "desc" : "asc")
        .take(limit);
      if (docs.length === 1001)
        throw new ConvexError({
          code: "WORKSPACE_LIMIT",
          message:
            "This workspace reached the initial rollout limit. Export your data and contact the workspace owner.",
        });
      return [field, docs.map((d) => d.data)] as const;
    }),
  );
  return upgradeDefaultProject({
    workspace: {
      id: workspace.key,
      name: workspace.name,
      kind: workspace.kind,
      inboxId: workspace.inboxId,
      ownerId: workspace.ownerId,
    },
    ...Object.fromEntries(records),
    // Reporting history is paginated separately; commands only append facts.
    reportEvents: [],
    lifecycleEvents: [],
  } as unknown as State);
}
export async function persist(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  before: State,
  after: State,
) {
  // The only dynamic database boundary: each table's validator checks its data and
  // cross-document references are resolved below in the same transaction.
  for (const field of Object.keys(tables) as EntityField[]) {
    const table = tables[field],
      old = (before[field] ?? []) as unknown as Record<string, unknown>[],
      next = (after[field] ?? []) as unknown as Record<string, unknown>[];
    const key = (row: Record<string, unknown>) =>
      String(row.id ?? row.ownerId ?? `${row.ownerId}:${row.start}:${row.end}`);
    const keyFor = (row: Record<string, unknown>) =>
      field === "busy" ? `${row.ownerId}:${row.start}:${row.end}` : key(row);
    const oldMap = new Map(old.map((row) => [keyFor(row), row]));
    for (const row of next) {
      const k = keyFor(row);
      if (JSON.stringify(row) === JSON.stringify(oldMap.get(k))) continue;
      const existing = await ctx.db
        .query(table)
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", workspaceId).eq("key", k),
        )
        .unique();
      if (
        field === "versions" &&
        existing &&
        JSON.stringify(existing.data) !== JSON.stringify(clean(row))
      )
        fail("IMMUTABLE", "Accepted plan history cannot be rewritten.");
      if (
        field === "sprints" &&
        existing &&
        ["closed", "canceled"].includes(
          String((existing.data as { status?: string }).status),
        )
      )
        fail("IMMUTABLE", "Closed sprint history cannot be rewritten.");
      const extra: Record<string, unknown> = {};
      if (field === "members") extra.subject = row.id;
      if (field === "notifications") extra.recipientId = row.recipientId;
      if (field === "invitations") extra.tokenHash = row.tokenHash;
      if (field === "tasks" || field === "iterations") {
        const p = await ctx.db
          .query("projects")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("key", String(row.projectId)),
          )
          .unique();
        if (!p) fail("REFERENCE", "Project reference is unavailable.");
        extra.projectRef = p._id;
      }
      if (field === "attempts") {
        const task = await ctx.db
            .query("tasks")
            .withIndex("by_key", (q) =>
              q.eq("workspaceId", workspaceId).eq("key", String(row.taskId)),
            )
            .unique(),
          version = await ctx.db
            .query("versions")
            .withIndex("by_key", (q) =>
              q.eq("workspaceId", workspaceId).eq("key", String(row.versionId)),
            )
            .unique();
        if (!task || !version)
          fail("REFERENCE", "Plan attempt references are unavailable.");
        extra.taskRef = task._id;
        extra.versionRef = version._id;
      }
      if (field === "iterations") {
        const version = await ctx.db
          .query("versions")
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("key", String(row.versionId)),
          )
          .unique();
        if (!version) fail("REFERENCE", "Iteration version is unavailable.");
        extra.versionRef = version._id;
      }
      const value = clean({ workspaceId, key: k, data: row, ...extra });
      if (existing) await ctx.db.replace(existing._id, value as never);
      else await ctx.db.insert(table, value as never);
    }
    const nextKeys = new Set(next.map(keyFor));
    for (const row of old) {
      const k = keyFor(row);
      if (!nextKeys.has(k)) {
        if (
          [
            "versions",
            "attempts",
            "iterations",
            "activities",
            "sprints",
          ].includes(field)
        )
          fail("IMMUTABLE", "Historical records cannot be deleted.");
        const existing = await ctx.db
          .query(table)
          .withIndex("by_key", (q) =>
            q.eq("workspaceId", workspaceId).eq("key", k),
          )
          .unique();
        if (existing) await ctx.db.delete(existing._id);
      }
    }
  }
  const priorReports = new Map(
    (before.reportEvents ?? []).map((e) => [e.id, e]),
  );
  for (const event of after.reportEvents ?? []) {
    const prior = priorReports.get(event.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event))
      fail("IMMUTABLE", "Reporting history cannot be rewritten.");
    if (prior) continue;
    const existing = await ctx.db
      .query("reportEvents")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", event.id),
      )
      .unique();
    if (existing) {
      if (JSON.stringify(existing.data) !== JSON.stringify(clean(event)))
        fail("IMMUTABLE", "Reporting history cannot be rewritten.");
      continue;
    }
    for (const [table, key] of [
      ["tasks", event.taskId],
      ["projects", event.projectId],
    ] as const) {
      const ref = await ctx.db
        .query(table)
        .withIndex("by_key", (q) =>
          q.eq("workspaceId", workspaceId).eq("key", key),
        )
        .unique();
      if (!ref) fail("REFERENCE", "Reporting reference is unavailable.");
    }
    await ctx.db.insert(
      "reportEvents",
      clean({ workspaceId, key: event.id, at: event.at, data: event }),
    );
  }
  const priorLifecycle = new Map(
    (before.lifecycleEvents ?? []).map((event) => [event.id, event]),
  );
  for (const event of after.lifecycleEvents ?? []) {
    const prior = priorLifecycle.get(event.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event))
      fail("IMMUTABLE", "Lifecycle history cannot be rewritten.");
    if (prior) continue;
    const old = await ctx.db
      .query("lifecycleEvents")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", workspaceId).eq("key", event.id),
      )
      .unique();
    if (old && JSON.stringify(old.data) !== JSON.stringify(clean(event)))
      fail("IMMUTABLE", "Lifecycle history cannot be rewritten.");
    if (!old)
      await ctx.db.insert(
        "lifecycleEvents",
        clean({ workspaceId, key: event.id, at: event.at, data: event }),
      );
  }
  await ctx.db.patch(workspaceId, { nextEvaluationAt: Date.now() + 60000 });
}
export async function createWorkspace(
  ctx: MutationCtx,
  subject: string,
  name: string,
  email: string,
  kind: "personal" | "team",
  title?: string,
): Promise<Id<"workspaces">> {
  const key = newId(),
    inboxId = newId();
  const workspaceId = await ctx.db.insert("workspaces", {
    key,
    name:
      title ?? (kind === "personal" ? "Personal workspace" : "Team workspace"),
    kind,
    inboxId,
    ownerId: subject,
    nextEvaluationAt: Date.now() + 60000,
  });
  const member: Member = {
    id: subject,
    name,
    email,
    role: "owner",
    color: "olive",
    preferences: { ...defaults },
  };
  await ctx.db.insert("memberships", {
    workspaceId,
    key: subject,
    subject,
    data: member,
  });
  await ctx.db.insert("projects", {
    workspaceId,
    key: inboxId,
    data: {
      id: inboxId,
      title: "Personal planning",
      description:
        kind === "personal"
          ? "Your private place to capture work."
          : "Shared with this workspace.",
      ownerId: subject,
      memberIds: [subject],
      color: "olive",
      icon: "calendar",
      archived: false,
      private: false,
    },
  });
  await ctx.db.insert("calendarStatuses", {
    workspaceId,
    key: subject,
    data: {
      ownerId: subject,
      status: "native",
      selectedIds: [],
      destinationId: "kazi",
      lastSync: Date.now(),
    },
  });
  return workspaceId;
}

export async function crossTeamReservations(
  ctx: QueryCtx | MutationCtx,
  subject: string,
  exclude: Id<"workspaces">,
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .take(10);
  const busy: import("../shared/model").Busy[] = [];
  for (const member of memberships) {
    if (member.workspaceId === exclude) continue;
    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", member.workspaceId))
      .take(1000);
    for (const { data: p } of proposals)
      if (["applying", "applied", "partial"].includes(p.status))
        for (const session of p.alternatives[p.selected].sessions)
          if (
            session.assigneeId === subject &&
            ["pending", "scheduled"].includes(session.status) &&
            session.end > Date.now()
          )
            busy.push({
              ownerId: subject,
              start: session.start,
              end: session.end,
              source: "kazi",
            });
  }
  return busy;
}
