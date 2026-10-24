import { lifecycleEventV } from "./validators";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  memberV,
  projectV,
  taskV,
  proposalV,
  versionV,
  attemptV,
  notificationV,
  activityV,
  invitationV,
  calendarV,
  reportEventV,
} from "./validators";
const scoped = { workspaceId: v.id("workspaces"), key: v.string() };
export default defineSchema({
  reportEvents: defineTable({ ...scoped, at: v.number(), data: reportEventV })
    .index("by_time", ["workspaceId", "at"])
    .index("by_key", ["workspaceId", "key"]),
  iterations: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    projectRef: v.id("projects"),
    versionRef: v.id("versions"),
    data: v.object({
      id: v.string(),
      projectId: v.string(),
      versionId: v.string(),
      previousId: v.optional(v.string()),
      createdAt: v.number(),
    }),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  calendarCursors: defineTable({
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    calendarId: v.string(),
    syncToken: v.optional(v.string()),
    pageToken: v.optional(v.string()),
    nextSyncAt: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_due", ["nextSyncAt"])
    .index("by_owner", ["workspaceId", "subject"]),
  rateLimits: defineTable({
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    windowAt: v.number(),
    count: v.number(),
  }).index("by_actor", ["workspaceId", "subject"]),
  profiles: defineTable({
    subject: v.string(),
    name: v.string(),
    email: v.string(),
    activeWorkspaceId: v.optional(v.id("workspaces")),
  }).index("by_subject", ["subject"]),
  workspaces: defineTable({
    key: v.string(),
    name: v.string(),
    kind: v.union(v.literal("personal"), v.literal("team")),
    inboxId: v.string(),
    ownerId: v.string(),
    nextEvaluationAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_due", ["nextEvaluationAt"]),
  memberships: defineTable({ ...scoped, subject: v.string(), data: memberV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"])
    .index("by_subject", ["subject"]),
  projects: defineTable({ ...scoped, data: projectV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  tasks: defineTable({ ...scoped, projectRef: v.id("projects"), data: taskV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"])
    .index("by_project", ["projectRef"]),
  proposals: defineTable({ ...scoped, data: proposalV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  versions: defineTable({ ...scoped, data: versionV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  attempts: defineTable({
    ...scoped,
    taskRef: v.id("tasks"),
    versionRef: v.id("versions"),
    data: attemptV,
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  notifications: defineTable({
    ...scoped,
    recipientId: v.string(),
    data: notificationV,
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"])
    .index("by_recipient", ["workspaceId", "recipientId"]),
  activities: defineTable({ ...scoped, data: activityV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  invitations: defineTable({
    ...scoped,
    tokenHash: v.string(),
    data: invitationV,
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"])
    .index("by_token", ["tokenHash"]),
  calendarStatuses: defineTable({ ...scoped, data: calendarV })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  busy: defineTable({
    ...scoped,
    data: v.object({
      start: v.number(),
      end: v.number(),
      ownerId: v.string(),
      source: v.optional(v.literal("kazi")),
    }),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  calendarSecrets: defineTable({
    subject: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    updatedAt: v.number(),
  }).index("by_subject", ["subject"]),
  oauthStates: defineTable({
    hash: v.string(),
    subject: v.string(),
    workspaceId: v.id("workspaces"),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_hash", ["hash"]),
  idempotency: defineTable({
    ...scoped,
    actorId: v.string(),
    result: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"]),
  outbox: defineTable({
    ...scoped,
    actorId: v.string(),
    proposalId: v.string(),
    sessionId: v.string(),
    eventId: v.string(),
    calendarId: v.optional(v.string()),
    operation: v.optional(v.union(v.literal("create"), v.literal("release"))),
    status: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("paused"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_key", ["workspaceId", "key"])
    .index("by_event", ["eventId"])
    .index("by_due", ["status", "nextAttemptAt"]),
  lifecycleEvents: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    at: v.number(),
    data: lifecycleEventV,
  })
    .index("by_time", ["workspaceId", "at"])
    .index("by_entity", ["workspaceId", "data.entityId", "at"])
    .index("by_key", ["workspaceId", "key"]),
  invitationOutbox: defineTable({
    workspaceId: v.id("workspaces"),
    invitationId: v.string(),
    subject: v.string(),
    requestId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    createdAt: v.number(),
    from: v.string(),
    teamName: v.string(),
    appOrigin: v.string(),
    error: v.optional(v.string()),
  })
    .index("by_invitation", ["workspaceId", "invitationId"])
    .index("by_due", ["status", "nextAttemptAt"]),
  calendarFeeds: defineTable({
    workspaceId: v.id("workspaces"),
    subject: v.string(),
    hash: v.string(),
    label: v.string(),
    projectId: v.optional(v.string()),
    includeDeadlines: v.boolean(),
    allTeams: v.optional(v.boolean()),
    createdAt: v.number(),
    expiresAt: v.number(),
    revoked: v.boolean(),
  })
    .index("by_hash", ["hash"])
    .index("by_owner", ["workspaceId", "subject"]),
  mcpTokens: defineTable({
    subject: v.string(),
    hash: v.string(),
    label: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
    revoked: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    clientName: v.optional(v.string()),
    clientVersion: v.optional(v.string()),
    lastTool: v.optional(v.string()),
    toolCalls: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_subject", ["subject"])
    .index("by_active", ["subject", "revoked", "expiresAt"]),
  mcpActivity: defineTable({
    subject: v.string(),
    tokenId: v.id("mcpTokens"),
    label: v.string(),
    tool: v.string(),
    at: v.number(),
    outcome: v.union(v.literal("success"), v.literal("error")),
  })
    .index("by_subject", ["subject", "at"])
    .index("by_token", ["tokenId", "at"]),
});
