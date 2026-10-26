import { z } from "zod";

export const statusSchema = z.enum([
  "idea",
  "backlog",
  "todo",
  "in_progress",
  "to_validate",
  "blocked",
  "done",
  "rejected",
  "canceled",
  "archived",
]);
export const DEFAULT_PROJECT_NAME = "Personal planning";
export const taskWorkflow = [
  "backlog",
  "todo",
  "in_progress",
  "to_validate",
  "done",
] as const;
export const taskStatusOptions = [...taskWorkflow, "archived"] as const;
export const defaultAgingDays = {
  backlog: 90,
  todo: 14,
  in_progress: 7,
  to_validate: 2,
};

export const prioritySchema = z.enum(["high", "medium", "low"]);
export const roleSchema = z.enum(["owner", "admin", "member", "guest"]);
const id = z.string().min(1).max(180);
const text = z.string().trim().min(1).max(180);
export const preferencesSchema = z.object({
  reviewRequired: z.boolean(),
  timezone: z.string(),
  workingDays: z.array(z.number().int().min(1).max(7)),
  startHour: z.number().min(0).max(23),
  endHour: z.number().min(1).max(24),
  dailyMinutes: z.number().min(30).max(720),
  minSession: z.number().min(15).max(120),
  maxSession: z.number().min(15).max(240),
  bufferMinutes: z.number().min(0).max(60),
  quietStart: z.number().min(0).max(23),
  quietEnd: z.number().min(0).max(23),
  horizonDays: z.number().min(1).max(28),
  agingDays: z
    .object({
      backlog: z.number().int().min(1).max(730),
      todo: z.number().int().min(1).max(365),
      in_progress: z.number().int().min(1).max(365),
      to_validate: z.number().int().min(1).max(365),
    })
    .optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaults: Preferences = {
  reviewRequired: true,
  timezone: "America/Chicago",
  workingDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  dailyMinutes: 300,
  minSession: 30,
  maxSession: 90,
  bufferMinutes: 15,
  quietStart: 20,
  quietEnd: 8,
  horizonDays: 14,
};
export interface Member {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: z.infer<typeof roleSchema>;
  color: string;
  preferences: Preferences;
  favoriteProjectIds?: string[];
  favoriteProjectAt?: Record<string, number>;
  favoriteTeamAt?: number;
}
export interface Workspace {
  id: string;
  name: string;
  kind: "personal" | "team";
  inboxId: string;
  ownerId: string;
}
export interface Project {
  revision?: number;
  id: string;
  title: string;
  description: string;
  ownerId: string;
  memberIds: string[];
  color: string;
  icon: string;
  deadline?: string;
  startDate?: string;
  archived: boolean;
  private: boolean;
  reviewRequired?: boolean;
  statusChangedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  status?: "planned" | "active" | "on_hold" | "done";
  priority?: z.infer<typeof prioritySchema>;
}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  descriptionMentions?: Mention[];
  status: z.infer<typeof statusSchema>;
  priority: z.infer<typeof prioritySchema>;
  assigneeId?: string;
  ownerId?: string;
  brainstorm?: boolean;
  reviewDate?: string;
  collaborators: string[];
  estimatedMinutes?: number;
  remainingMinutes?: number;
  loggedMinutes: number;
  startedAt?: number;
  statusChangedAt?: number;
  milestone?: boolean;
  deadline?: string;
  startDate?: string;
  dependencies: string[];
  labels: string[];
  parentId?: string;
  revision: number;
  lastProgress: number;
  createdAt: number;
  updatedAt: number;
}
export interface SprintTaskSnapshot {
  id: string;
  projectId: string;
  title: string;
  status: Task["status"];
}
export interface SprintObjective {
  id: string;
  title: string;
  successCriteria: string;
  leadId?: string;
}
export interface SprintObjectiveResult extends SprintObjective {
  outcome: "achieved" | "partial" | "missed";
  note?: string;
}
export interface Sprint {
  id: string;
  title: string;
  objective: string;
  successCriteria: string;
  focus?: string;
  automaticName?: boolean;
  objectives?: SprintObjective[];
  /** Primary objective for a selected task; an absent key means Other work. */
  objectiveAssignments?: Record<string, string>;
  startDate: string;
  endDate: string;
  timezone: string;
  ownerId: string;
  status: "planned" | "active" | "closed" | "canceled";
  taskIds: string[];
  /** All projects ever included; historical scope must retain its access boundary. */
  projectIds: string[];
  revision: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  /** Backlog activation was reconciled once at or after the sprint start. */
  backlogPromotedAt?: number;
  /** Actor who authorized the started sprint’s current task selection. */
  backlogPromotionActorId?: string;
  initialTasks?: SprintTaskSnapshot[];
  initialObjectives?: SprintObjective[];
  initialObjectiveAssignments?: Record<string, string>;
  changes: {
    at: number;
    actorId: string;
    added: string[];
    removed: string[];
    objectives?: SprintObjective[];
    objectiveAssignments?: Record<string, string>;
  }[];
  closeout?: {
    at: number;
    actorId: string;
    outcome?: "achieved" | "partial" | "missed";
    objectives?: SprintObjectiveResult[];
    objectiveAssignments?: Record<string, string>;
    note: string;
    tasks: SprintTaskSnapshot[];
    originalTasks: SprintTaskSnapshot[];
    decisions: {
      taskId: string;
      action: "backlog" | "outside" | "sprint";
      sprintId?: string;
    }[];
  };
}
export interface Session {
  id: string;
  taskId: string;
  assigneeId: string;
  start: number;
  end: number;
  status: "proposed" | "pending" | "scheduled" | "failed" | "released";
  eventId?: string;
  updatedAt?: number;
  error?: string;
}
/** Mutable calendar reservations, separate from immutable accepted plan snapshots. */
export interface CalendarSession {
  id: string;
  taskId: string;
  assigneeId: string;
  start: number;
  end: number;
  status: "scheduled" | "released";
  revision: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  timezone: string;
  seriesId?: string;
  origin?: "plan";
  originalStart: number;
  originalEnd: number;
  reminderMinutes?: number;
  history: {
    at: number;
    actorId: string;
    action: "scheduled" | "rescheduled" | "released";
    fromStart?: number;
    fromEnd?: number;
    toStart?: number;
    toEnd?: number;
  }[];
}
export interface Allocation {
  sessions: Session[];
  unscheduled: { taskId: string; minutes: number; reason: string }[];
  scheduledMinutes: number;
  remainingMinutes: number;
  explanations: string[];
  algorithm: string;
}
export interface Proposal {
  id: string;
  projectId?: string;
  sprintId?: string;
  sprintRevision?: number;
  title: string;
  revision: number;
  status:
    | "awaiting_review"
    | "applying"
    | "applied"
    | "partial"
    | "rejected"
    | "stale"
    | "failed";
  trigger: "weekly" | "recovery";
  parentVersionId?: string;
  taskRevisions: Record<string, number>;
  alternatives: Allocation[];
  selected: number;
  createdAt: number;
  expiresAt: number;
  recoveryTarget?: string;
  availabilityAt: number;
  createdBy: string;
  automatic: boolean;
  approvedBy: string[];
  inputs?: PlanningInputs;
}
export interface Version {
  id: string;
  lineageId: string;
  number: number;
  projectId?: string;
  sprintId?: string;
  parentId?: string;
  proposalId: string;
  trigger: string;
  createdAt: number;
  createdBy: string;
  taskSnapshot: Task[];
  sessions: Session[];
  recoveryTarget?: string;
  algorithm: string;
  inputs?: PlanningInputs;
}
export interface PlanningInputs {
  confirmedSessions?: Session[];
  sprintObjectives?: SprintObjective[];
  sprintObjectiveAssignments?: Record<string, string>;
  sprintFocus?: string;
  windowStart?: number;
  windowEnd?: number;
  calendarDestinations?: Record<string, string>;
  tasks: Task[];
  preferences: Record<string, Preferences>;
  busy: Busy[];
  startDate: string;
  days: number;
  now: number;
  recoveryTarget?: string;
}
export interface Attempt {
  id: string;
  taskId: string;
  versionId: string;
  previousId?: string;
  remainingMinutes: number;
}
export interface Notification {
  id: string;
  recipientId: string;
  taskId?: string;
  proposalId?: string;
  title: string;
  body: string;
  kind: "overdue" | "stale" | "capacity" | "review" | "assignment" | "system";
  createdAt: number;
  read: boolean;
  snoozedUntil?: number;
  key: string;
  deliveryAt: number;
}
export interface Activity {
  id: string;
  actorId: string;
  taskId?: string;
  projectId?: string;
  message: string;
  at: number;
  kind: "change" | "comment" | "policy";
  attachmentIds?: string[];
  mentions?: Mention[];
  fromStatus?: Task["status"];
  toStatus?: Task["status"];
  changes?: string[];
}
export interface TaskArtifact {
  id: string;
  taskId: string;
  name: string;
  kind: "file" | "link";
  placement: "description" | "task";
  url?: string;
  storageId?: string;
  size?: number;
  contentType?: string;
  createdBy: string;
  createdAt: number;
  removedAt?: number;
}
export interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member" | "guest";
  expiresAt: number;
  status: "pending" | "accepted" | "revoked";
  deliveryStatus?: "not_configured" | "queued" | "sent" | "failed";
  deliveryError?: string;
  tokenHash: string;
  projectIds: string[];
}
export interface Busy {
  start: number;
  end: number;
  ownerId: string;
  source?: "kazi";
}
export interface CalendarStatus {
  ownerId: string;
  status: "disconnected" | "connected" | "error" | "demo" | "native";
  selectedIds: string[];
  destinationId?: string;
  shareAvailability?: boolean;
  lastSync?: number;
  availabilityFrom?: number;
  availabilityUntil?: number;
  error?: string;
}
/** Immutable facts, recorded by commands rather than inferred from task edits. */
export interface ReportEvent {
  id: string;
  taskId: string;
  projectId: string;
  actorId: string;
  assigneeId?: string;
  at: number;
  type: "time_logged" | "completed";
  minutes: number;
  dueAt?: number;
  taskCreatedAt?: number;
  startedAt?: number;
  deadline?: string;
  leaf: boolean;
}
export interface LifecycleEvent {
  id: string;
  entityType: "task" | "project";
  entityId: string;
  projectId: string;
  actorId: string;
  assigneeId?: string;
  ownerId?: string;
  at: number;
  revision?: number;
  note?: string;
  action: string;
  changes: string[];
  fromStatus?: string;
  toStatus?: string;
}
export interface State {
  teams?: (Omit<Workspace, "id"> & {
    id: string;
    key: string;
    role: Member["role"];
    favoriteAt?: number;
  })[];
  resourceTeams?: Record<string, string>;
  teamMemberships?: Record<string, Member[]>;

  legacyResourceIds?: {
    projects: Record<string, string>;
    tasks: Record<string, string>;
    plans: Record<string, string>;
  };
  workspace: Workspace;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  sprints?: Sprint[];
  proposals: Proposal[];
  versions: Version[];
  attempts: Attempt[];
  iterations: {
    id: string;
    projectId: string;
    versionId: string;
    previousId?: string;
    createdAt: number;
  }[];
  notifications: Notification[];
  activities: Activity[];
  artifacts?: TaskArtifact[];
  reportEvents?: ReportEvent[];
  lifecycleEvents?: LifecycleEvent[];
  /** Authorized projection of due instants, without exposing others' preferences. */
  taskDueAt?: Record<string, number>;
  invitations: Invitation[];
  calendarSessions?: CalendarSession[];
  calendars: CalendarStatus[];
  busy: Busy[];
}

export const mentionSchema = z.object({
  memberId: id,
  start: z.number().int().min(0),
  end: z.number().int().min(1),
});
export type Mention = z.infer<typeof mentionSchema>;
const plannedDate = z.union([z.iso.date(), z.literal("")]).optional();
const taskFields = {
  startDate: plannedDate,
  ownerId: id.optional(),
  brainstorm: z.boolean().optional(),
  reviewDate: plannedDate,
  milestone: z.boolean().optional(),
  collaborators: z.array(id).max(30).optional(),
  title: text,
  description: z.string().max(5000),
  descriptionMentions: z.array(mentionSchema).max(30).optional(),
  projectId: id.optional(),
  assigneeId: id.optional(),
  priority: prioritySchema,
  estimatedMinutes: z.number().int().min(0).max(100000).optional(),
  remainingMinutes: z.number().int().min(0).max(100000).optional(),
  deadline: z.string().optional(),
  dependencies: z.array(id).max(100),
  labels: z.array(text).max(20).describe("Colored task tags."),
  parentId: id.optional(),
};
export const sprintObjectiveSchema = z.object({
  id,
  title: z.string().trim().max(2000),
  successCriteria: z.string().trim().max(2000).default(""),
  leadId: id.optional(),
});
const objectiveAssignmentsSchema = z.record(id, id);
const calendarScope = z.enum(["occurrence", "following", "series"]).optional();
const calendarReminder = z
  .number()
  .int()
  .refine(
    (n) => [0, 5, 10, 15, 30, 60].includes(n),
    "Choose a supported reminder interval.",
  )
  .optional();
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("restore_calendar_sessions"),
    sessions: z
      .array(
        z.object({
          sessionId: id,
          revision: z.number().int().min(1),
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          status: z.enum(["scheduled", "released"]),
          reminderMinutes: calendarReminder.nullable(),
        }),
      )
      .min(1)
      .max(26)
      .refine(
        (rows) =>
          new Set(rows.map((row) => row.sessionId)).size === rows.length,
        "Choose each session once.",
      ),
  }),
  z.object({
    type: z.literal("schedule_calendar_session"),
    taskId: id,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    recurrence: z
      .object({
        frequency: z.enum(["daily", "weekly"]),
        count: z.number().int().min(2).max(26),
        timezone: z.string().min(1).max(100),
      })
      .optional(),
    reminderMinutes: calendarReminder,
  }),
  z.object({
    type: z.literal("update_calendar_session"),
    sessionId: id,
    revision: z.number().int().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    scope: calendarScope,
    restore: z.boolean().optional(),
    reminderMinutes: calendarReminder.nullable(),
  }),
  z.object({
    type: z.literal("cancel_calendar_session"),
    sessionId: id,
    revision: z.number().int().min(1),
    scope: calendarScope,
  }),
  z.object({
    type: z.literal("create_sprint"),
    title: text
      .optional()
      .describe(
        "Omit for an automatic team/personal name based on the start week's ISO number.",
      ),
    objective: z.string().trim().max(2000).default(""),
    successCriteria: z.string().trim().max(2000).default(""),
    focus: z.string().trim().max(2000).optional(),
    objectives: z.array(sprintObjectiveSchema).max(20).optional(),
    objectiveAssignments: objectiveAssignmentsSchema.optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    timezone: z.string().min(1).max(100),
    taskIds: z.array(id).max(100).default([]),
  }),
  z.object({
    type: z.literal("update_sprint"),
    id,
    revision: z.number().int().min(1),
    patch: z.object({
      title: text.optional(),
      objective: z.string().trim().max(2000).optional(),
      successCriteria: z.string().trim().max(2000).optional(),
      startDate: z.iso.date().optional(),
      endDate: z.iso.date().optional(),
      taskIds: z.array(id).max(100).optional(),
      focus: z.string().trim().max(2000).optional(),
      automaticName: z.boolean().optional(),
      objectives: z.array(sprintObjectiveSchema).max(20).optional(),
      objectiveAssignments: objectiveAssignmentsSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal("start_sprint"),
    id,
    revision: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("cancel_sprint"),
    id,
    revision: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("close_sprint"),
    id,
    revision: z.number().int().min(1),
    outcome: z.enum(["achieved", "partial", "missed"]).optional(),
    objectiveOutcomes: z
      .array(
        z.object({
          objectiveId: id,
          outcome: z.enum(["achieved", "partial", "missed"]),
          note: z.string().trim().max(2000).optional(),
        }),
      )
      .max(20)
      .optional(),
    note: z.string().trim().max(5000).default(""),
    decisions: z
      .array(
        z.object({
          taskId: id,
          action: z.enum(["backlog", "outside", "sprint"]),
          sprintId: id.optional(),
        }),
      )
      .max(100),
  }),
  z.object({
    type: z.literal("use_kazi_agenda"),
    shareAvailability: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("create_task"),
    ...taskFields,
    status: z.enum(["backlog", "todo"]).optional(),
  }),
  z.object({
    type: z.literal("update_task"),
    id,
    patch: z.object({ ...taskFields, status: statusSchema }).partial(),
  }),
  z.object({
    type: z.literal("review_task"),
    id,
    decision: z.enum(["approve", "return"]),
    reason: z.string().trim().max(5000).optional(),
  }),
  z.object({
    type: z.literal("progress"),
    id,
    remainingMinutes: z.number().int().min(0).max(100000),
    note: z.string().max(5000),
    loggedMinutes: z.number().int().min(0).max(10000).default(0),
  }),
  z.object({
    type: z.literal("comment"),
    id,
    body: z.string().max(5000),
    mentions: z.array(mentionSchema).max(30).optional(),
    attachmentIds: z.array(id).max(10).optional(),
  }),
  z.object({
    type: z.literal("attach_link"),
    id,
    name: text,
    url: z
      .url()
      .max(2048)
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use an HTTPS link.",
      ),
    placement: z.enum(["description", "task"]).default("task"),
  }),
  z.object({
    type: z.literal("remove_artifact"),
    id,
    artifactId: id,
  }),
  z.object({
    type: z.literal("create_project"),
    status: z.enum(["planned", "active", "on_hold", "done"]).optional(),
    priority: prioritySchema.optional(),
    title: text,
    description: z.string().max(5000),
    color: z.enum(["olive", "clay", "blue", "gold", "plum"]),
    deadline: z.string().optional(),
    startDate: plannedDate,
    private: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("update_project"),
    id,
    patch: z
      .object({
        title: text,
        description: z.string().max(5000),
        archived: z.boolean(),
        memberIds: z.array(id),
        ownerId: id,
        reviewRequired: z.boolean(),
        status: z.enum(["planned", "active", "on_hold", "done"]),
        priority: prioritySchema,
        deadline: z.string(),
        startDate: z.string(),
      })
      .partial(),
  }),
  z.object({
    type: z.literal("favorite_project"),
    projectId: id,
    favorite: z.boolean(),
  }),
  z.object({ type: z.literal("favorite_team"), favorite: z.boolean() }),
  z.object({ type: z.literal("preferences"), preferences: preferencesSchema }),
  z.object({
    type: z.literal("propose"),
    projectId: id.optional(),
    sprintId: id.optional(),
    startDate: z.string(),
    days: z.number().int().min(1).max(28).default(7),
    recoveryTarget: z.string().optional(),
    trigger: z.enum(["weekly", "recovery"]).default("weekly"),
  }),
  z.object({
    type: z.literal("select_alternative"),
    id,
    revision: z.number().int(),
    selected: z.number().int().min(0).max(2),
  }),
  z.object({ type: z.literal("approve"), id, revision: z.number().int() }),
  z.object({ type: z.literal("reject"), id, revision: z.number().int() }),
  z.object({
    type: z.literal("notification"),
    id,
    action: z.enum(["read", "snooze"]),
  }),
  z.object({
    type: z.literal("invite"),
    email: z.email(),
    role: z.enum(["admin", "member", "guest"]),
    projectIds: z.array(id).default([]),
  }),
  z.object({ type: z.literal("revoke_invitation"), id }),
  z.object({
    type: z.literal("set_member_role"),
    id,
    role: z.enum(["admin", "member", "guest"]),
  }),
  z.object({ type: z.literal("remove_member"), id }),
  z.object({
    type: z.literal("release_sessions"),
    versionId: id,
    sessionIds: z.array(id).min(1).max(100),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Context = {
  actorId: string;
  now: number;
  id: () => string;
  verifiedCalendar?: boolean;
  automatic?: boolean;
  invitationHash?: string;
};
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}
export const statusLabels = {
  idea: "Backlog",
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  to_validate: "To validate",
  blocked: "Archived",
  done: "Completed",
  rejected: "Archived",
  canceled: "Archived",
  archived: "Archived",
};
