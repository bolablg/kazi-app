import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "./workflow";
import { Temporal } from "@js-temporal/polyfill";
import {
  calendarSessions,
  calendarReservations,
  calendarOccurrences,
  calendarSessionIssues,
  shiftedCalendarSessions,
  calendarSessionIsNative,
} from "./calendarPlanning";
import { stableId } from "./ids";
import {
  type State,
  type Context,
  type Command,
  type Task,
  type TaskArtifact,
  type Session,
  type CalendarSession,
  type Project,
  type Member,
  type Mention,
  type Proposal,
  type Sprint,
  commandSchema,
  defaults,
  defaultAgingDays,
  fail,
} from "./model";
import { trimMentionText } from "./people";
import {
  allocate,
  addDays,
  dateInZone,
  deadlineAt,
  localInstant,
  MINUTE,
} from "./scheduler";
import {
  automaticSprintName,
  isOpenSprint,
  sprintAssignments,
  sprintDays,
  sprintObjectives,
  sprintSnapshot,
} from "./sprints";

export function actor(s: State, id: string): Member {
  return (
    s.members.find((m) => m.id === id) ??
    fail("FORBIDDEN", "You no longer have access to this workspace.")
  );
}
export function canSeeProject(s: State, p: Project, userId: string): boolean {
  const m = s.members.find((m) => m.id === userId);
  if (!m) return false;
  return (
    m.role === "owner" ||
    m.role === "admin" ||
    p.ownerId === userId ||
    p.memberIds.includes(userId) ||
    (!p.private && m.role !== "guest")
  );
}
export function projectFor(s: State, id: string, userId: string): Project {
  const p = s.projects.find((p) => p.id === id);
  if (!p || !canSeeProject(s, p, userId))
    fail(
      "FORBIDDEN",
      "This resource is unavailable or you do not have access.",
    );
  return p;
}
export function taskFor(s: State, id: string, userId: string): Task {
  const t = s.tasks.find((t) => t.id === id);
  if (!t)
    fail(
      "FORBIDDEN",
      "This resource is unavailable or you do not have access.",
    );
  projectFor(s, t.projectId, userId);
  return t;
}
function manager(s: State, userId: string) {
  return ["owner", "admin"].includes(actor(s, userId).role);
}
function canManage(s: State, p: Project, id: string) {
  return manager(s, id) || p.ownerId === id;
}
function editable(s: State, t: Task, id: string) {
  const p = projectFor(s, t.projectId, id);
  if (
    !canManage(s, p, id) &&
    t.assigneeId !== id &&
    (t.ownerId ?? p.ownerId) !== id
  )
    fail(
      "FORBIDDEN",
      "Only the assignee or a project manager can change this task.",
    );
}
export function canSeeSprint(
  s: State,
  sprint: Sprint,
  userId: string,
): boolean {
  const member = s.members.find((m) => m.id === userId);
  if (!member) return false;
  const ids = new Set([
    ...sprint.taskIds,
    ...(sprint.initialTasks ?? []).map((t) => t.id),
    ...sprint.changes.flatMap((change) => [...change.added, ...change.removed]),
  ]);
  const projects = new Set([
    ...sprint.projectIds,
    ...s.tasks.filter((task) => ids.has(task.id)).map((task) => task.projectId),
  ]);
  if (!projects.size)
    return (
      sprint.ownerId === userId ||
      !!sprint.objectives?.some((objective) => objective.leadId === userId) ||
      ["owner", "admin"].includes(member.role)
    );
  return [...projects].every((id) => {
    const project = s.projects.find((p) => p.id === id);
    return !!project && canSeeProject(s, project, userId);
  });
}
export function sprintFor(s: State, id: string, userId: string): Sprint {
  const sprint = s.sprints?.find((item) => item.id === id);
  if (!sprint || !canSeeSprint(s, sprint, userId))
    fail("FORBIDDEN", "This sprint is unavailable or you do not have access.");
  return sprint;
}
function manageSprint(
  s: State,
  id: string,
  revision: number,
  c: Context,
): Sprint {
  const sprint = sprintFor(s, id, c.actorId);
  if (sprint.ownerId !== c.actorId && !manager(s, c.actorId))
    fail(
      "FORBIDDEN",
      "Only the sprint owner or a team manager can change this sprint.",
    );
  if (sprint.revision !== revision)
    fail("REVISION", "This sprint changed. Reload it before saving.");
  if (!isOpenSprint(sprint)) fail("STATE", "This sprint is already closed.");
  return sprint;
}
function validateSprint(s: State, sprint: Sprint) {
  const days = sprintDays(sprint.startDate, sprint.endDate);
  if (days < 1 || days > 28)
    fail("DATES", "Choose a sprint period between one and 28 days.");
  dateInZone(sprint.createdAt, sprint.timezone);
  const objectives = sprintObjectives(sprint),
    assignments = sprintAssignments(sprint);
  if (
    new Set(objectives.map((objective) => objective.id)).size !==
    objectives.length
  )
    fail("OBJECTIVE", "Each sprint objective needs a different ID.");
  if (
    Object.keys(assignments).length > 100 ||
    Object.entries(assignments).some(
      ([taskId, objectiveId]) =>
        !sprint.taskIds.includes(taskId) ||
        !objectives.some((objective) => objective.id === objectiveId),
    )
  )
    fail("OBJECTIVE", "Assign selected tasks to an objective in this sprint.");
  for (const objective of objectives) {
    if (
      objective.leadId &&
      !s.members.some((member) => member.id === objective.leadId)
    )
      fail("MEMBER", "Choose an objective lead from this team.");
    if (objective.leadId && !canSeeSprint(s, sprint, objective.leadId))
      fail(
        "FORBIDDEN",
        "An objective lead needs access to every linked project in the sprint.",
      );
  }
  if (sprint.status === "active") {
    if (
      !objectives.length ||
      objectives.some((objective) => !objective.title.trim())
    )
      fail(
        "OBJECTIVE",
        "Give each sprint objective a clear outcome before starting.",
      );
    if (
      objectives.some(
        (objective) =>
          !sprint.taskIds.some(
            (taskId) => assignments[taskId] === objective.id,
          ),
      )
    )
      fail(
        "OBJECTIVE",
        "Select at least one task for each sprint objective before starting.",
      );
  }
}
function syncSprintObjectives(sprint: Sprint) {
  if (!sprint.objectives) return;
  sprint.objectives = sprint.objectives.map((objective) => ({
    ...objective,
    leadId: objective.leadId ?? sprint.ownerId,
  }));
  sprint.objective = sprint.objectives[0]?.title ?? "";
  sprint.successCriteria = sprint.objectives[0]?.successCriteria ?? "";
}
function selectSprintTasks(
  s: State,
  sprint: Sprint,
  ids: string[],
  c: Context,
) {
  if (new Set(ids).size !== ids.length)
    fail("TASKS", "Each task can only be selected once.");
  for (const id of ids) {
    const task = taskFor(s, id, c.actorId);
    editable(s, task, c.actorId);
    if (
      !sprint.taskIds.includes(id) &&
      (task.status === "done" || isArchivedTask(task))
    )
      fail("TASKS", "Select unfinished, unarchived work for the sprint.");
    if (s.tasks.some((child) => child.parentId === id))
      fail(
        "TASKS",
        "Select the individual subtasks instead of their parent to count work once.",
      );
    if (
      s.sprints?.some(
        (other) =>
          other.id !== sprint.id &&
          isOpenSprint(other) &&
          other.taskIds.includes(id),
      )
    )
      fail("TASKS", "A selected task already belongs to another open sprint.");
  }
  for (const id of sprint.taskIds.filter((id) => !ids.includes(id)))
    editable(s, taskFor(s, id, c.actorId), c.actorId);
  const added = ids.filter((id) => !sprint.taskIds.includes(id));
  const removed = sprint.taskIds.filter((id) => !ids.includes(id));
  if (added.length || removed.length)
    sprint.changes.push({ at: c.now, actorId: c.actorId, added, removed });
  sprint.taskIds = [...ids];
  if (sprint.objectiveAssignments)
    sprint.objectiveAssignments = Object.fromEntries(
      Object.entries(sprint.objectiveAssignments).filter(([id]) =>
        ids.includes(id),
      ),
    );
  sprint.projectIds = [
    ...new Set([
      ...sprint.projectIds,
      ...ids.map((id) => s.tasks.find((t) => t.id === id)!.projectId),
    ]),
  ];
}
/** A sprint commits only Backlog work; subsequent manual stage changes stay intact. */
function promoteSprintBacklog(
  s: State,
  sprint: Sprint,
  ids: string[],
  c: Context,
  recordLifecycle = false,
) {
  let promoted = 0;
  if (!canSeeSprint(s, sprint, c.actorId)) return promoted;
  for (const task of s.tasks) {
    if (task.status !== "backlog" || !ids.includes(task.id)) continue;
    if (s.projects.find((project) => project.id === task.projectId)?.archived)
      continue;
    try {
      editable(s, task, c.actorId);
    } catch {
      // Scheduled commitments do not retain task access after it is revoked.
      continue;
    }
    task.status = "todo";
    task.statusChangedAt = task.lastProgress = task.updatedAt = c.now;
    task.revision++;
    const activityId = audit(
      s,
      c,
      `Moved from Backlog to To do for sprint “${sprint.title}”`,
      task.id,
      task.projectId,
    );
    Object.assign(
      s.activities.find((event) => event.id === activityId)!,
      {
        changes: ["status"],
        fromStatus: "backlog",
        toStatus: "todo",
      },
    );
    if (recordLifecycle)
      (s.lifecycleEvents ??= []).push({
        id: c.id(),
        entityType: "task",
        entityId: task.id,
        projectId: task.projectId,
        actorId: c.actorId,
        assigneeId: task.assigneeId,
        ownerId: task.ownerId,
        at: c.now,
        revision: task.revision,
        action: "sprint_activation",
        changes: ["status"],
        fromStatus: "backlog",
        toStatus: "todo",
      });
    promoted++;
  }
  return promoted;
}
function sprintHasBegun(sprint: Sprint, now: number) {
  return (
    sprint.status === "active" &&
    localInstant(sprint.startDate, 0, sprint.timezone) <= now &&
    now < localInstant(sprint.endDate, 24, sprint.timezone)
  );
}
function activateDueSprintBacklogs(s: State, c: Context) {
  for (const sprint of s.sprints ?? []) {
    if (
      sprint.backlogPromotedAt !== undefined ||
      !sprintHasBegun(sprint, c.now)
    )
      continue;
    const promoted = promoteSprintBacklog(
      s,
      sprint,
      sprint.taskIds,
      { ...c, actorId: sprint.backlogPromotionActorId ?? sprint.ownerId },
      true,
    );
    sprint.backlogPromotedAt = sprint.updatedAt = c.now;
    sprint.revision++;
    if (promoted) staleSprintPlans(s, sprint.id);
  }
}
/** Targeted scheduled activation, with the cron retained as recovery fallback. */
export function activateSprintBacklogs(state: State, c: Context): State {
  const s = structuredClone(state);
  activateDueSprintBacklogs(s, c);
  return s;
}
function staleSprintPlans(s: State, sprintId: string) {
  for (const proposal of s.proposals)
    if (
      proposal.sprintId === sprintId &&
      proposal.status === "awaiting_review"
    ) {
      proposal.status = "stale";
      proposal.approvedBy = [];
    }
}
export function visibleState(s: State, userId: string): State {
  actor(s, userId);
  const projects = s.projects.filter((p) => canSeeProject(s, p, userId)),
    projectIds = new Set(projects.map((p) => p.id));
  const tasks = s.tasks.filter((t) => projectIds.has(t.projectId)),
    taskIds = new Set(tasks.map((t) => t.id));
  const proposals = s.proposals.filter(
    (p) =>
      (!p.sprintId ||
        !!s.sprints?.some(
          (sprint) =>
            sprint.id === p.sprintId && canSeeSprint(s, sprint, userId),
        )) &&
      (p.projectId
        ? projectIds.has(p.projectId)
        : !!p.sprintId || p.createdBy === userId) &&
      Object.keys(p.taskRevisions).every((id) => taskIds.has(id)),
  );
  const versions = s.versions.filter(
    (v) =>
      (!v.sprintId ||
        !!s.sprints?.some(
          (sprint) =>
            sprint.id === v.sprintId && canSeeSprint(s, sprint, userId),
        )) &&
      (v.projectId
        ? projectIds.has(v.projectId)
        : !!v.sprintId || v.createdBy === userId) &&
      v.taskSnapshot.every((t) => taskIds.has(t.id)),
  );
  return {
    ...s,
    projects,
    tasks,
    sprints: (s.sprints ?? []).filter((sprint) =>
      canSeeSprint(s, sprint, userId),
    ),
    taskDueAt: Object.fromEntries(
      tasks
        .filter((t) => t.deadline)
        .map((t) => [
          t.id,
          deadlineAt(
            t.deadline,
            s.members.find((m) => m.id === t.assigneeId)?.preferences
              .timezone ?? actor(s, userId).preferences.timezone,
          ),
        ]),
    ),
    proposals,
    versions,
    calendarSessions: (s.calendarSessions ?? []).filter((session) =>
      taskIds.has(session.taskId),
    ),
    attempts: s.attempts.filter((a) =>
      versions.some((v) => v.id === a.versionId),
    ),
    iterations: s.iterations.filter((i) =>
      versions.some((v) => v.id === i.versionId),
    ),
    notifications: s.notifications.filter(
      (n) => n.recipientId === userId && (!n.taskId || taskIds.has(n.taskId)),
    ),
    activities: s.activities.filter(
      (a) =>
        (!a.taskId || taskIds.has(a.taskId)) &&
        (!a.projectId || projectIds.has(a.projectId)),
    ),
    artifacts: (s.artifacts ?? [])
      .filter((a) => taskIds.has(a.taskId))
      .map(({ storageId: _, ...artifact }) => artifact),
    legacyResourceIds: s.legacyResourceIds
      ? {
          projects: Object.fromEntries(
            Object.entries(s.legacyResourceIds.projects).filter(([, id]) =>
              projectIds.has(id),
            ),
          ),
          tasks: Object.fromEntries(
            Object.entries(s.legacyResourceIds.tasks).filter(([, id]) =>
              taskIds.has(id),
            ),
          ),
          plans: Object.fromEntries(
            Object.entries(s.legacyResourceIds.plans).filter(([, id]) =>
              proposals.some((p) => p.id === id),
            ),
          ),
        }
      : undefined,
    lifecycleEvents: (s.lifecycleEvents ?? []).filter(
      (event) =>
        projectIds.has(event.projectId) &&
        (event.entityType === "project" || taskIds.has(event.entityId)),
    ),
    reportEvents: (s.reportEvents ?? []).filter(
      (e) => taskIds.has(e.taskId) && projectIds.has(e.projectId),
    ),
    invitations: manager(s, userId)
      ? s.invitations.map((i) => ({ ...i, tokenHash: "" }))
      : [],
    members: s.members.map((m) =>
      m.id === userId
        ? {
            ...m,
            favoriteProjectIds: m.favoriteProjectIds?.filter((id) =>
              projectIds.has(id),
            ),
            favoriteProjectAt: m.favoriteProjectAt
              ? Object.fromEntries(
                  Object.entries(m.favoriteProjectAt).filter(([id]) =>
                    projectIds.has(id),
                  ),
                )
              : undefined,
          }
        : {
            ...m,
            preferences: { ...defaults },
            favoriteProjectIds: undefined,
            favoriteProjectAt: undefined,
            favoriteTeamAt: undefined,
          },
    ),
    calendars: s.calendars.filter((c) => c.ownerId === userId),
    busy: s.busy.filter((b) => b.ownerId === userId),
  };
}
function audit(
  s: State,
  c: Context,
  message: string,
  taskId?: string,
  projectId?: string,
  kind: "change" | "comment" | "policy" = "change",
  attachmentIds?: string[],
  mentions?: Mention[],
) {
  const event = {
    id: c.id(),
    actorId: c.actorId,
    taskId,
    projectId,
    message,
    at: c.now,
    kind,
    ...(attachmentIds?.length ? { attachmentIds } : {}),
    ...(mentions?.length ? { mentions } : {}),
  };
  s.activities.unshift(event);
  return event.id;
}
function editableCalendarSession(
  s: State,
  id: string,
  revision: number,
  c: Context,
) {
  const session = calendarSessions(s).find((item) => item.id === id);
  if (!session) fail("FORBIDDEN", "This calendar session is unavailable.");
  if (!calendarSessionIsNative(s, id))
    fail(
      "CALENDAR",
      "This event was published to an external calendar. Manage its original plan or calendar; changing the Kazi destination does not move it.",
    );
  const task = taskFor(s, session.taskId, c.actorId);
  if (session.assigneeId !== c.actorId || task.assigneeId !== c.actorId)
    fail(
      "FORBIDDEN",
      "Only the worker can change their own calendar reservations.",
    );
  if (session.revision !== revision)
    fail(
      "REVISION",
      "This session changed. Reload the calendar before saving.",
    );
  if (session.start < c.now)
    fail(
      "PAST",
      "Past calendar reservations are preserved. Choose a future session.",
    );
  if (
    s.calendars.find((cal) => cal.ownerId === c.actorId)?.destinationId !==
    "kazi"
  )
    fail("CALENDAR", "Use the Kazi agenda before changing its reservations.");
  return { session, task };
}
function calendarTargets(
  s: State,
  session: CalendarSession,
  scope: "occurrence" | "following" | "series" | undefined,
  now: number,
) {
  if (!session.seriesId || !scope || scope === "occurrence") return [session];
  return calendarSessions(s).filter(
    (item) =>
      item.seriesId === session.seriesId &&
      item.start >= now &&
      (scope === "series" || item.originalStart >= session.originalStart),
  );
}
function saveCalendarHistory(
  s: State,
  sessions: CalendarSession[],
  task: Task,
  c: Context,
  action: "scheduled" | "rescheduled" | "released" | "updated",
) {
  const text = `${action === "scheduled" ? "Reserved" : action === "rescheduled" ? "Rescheduled" : action === "updated" ? "Updated" : "Released"} ${sessions.length === 1 ? "a focus session" : sessions.length + " focus sessions"}`;
  for (const proposal of s.proposals)
    if (
      proposal.status === "awaiting_review" &&
      proposal.alternatives[proposal.selected]?.sessions.some(
        (row) => row.assigneeId === c.actorId,
      )
    )
      proposal.status = "stale";
  const id = audit(s, c, text, task.id, task.projectId);
  Object.assign(
    s.activities.find((entry) => entry.id === id)!,
    { changes: ["calendar"] },
  );
  (s.lifecycleEvents ??= []).push({
    id: c.id(),
    entityType: "task",
    entityId: task.id,
    projectId: task.projectId,
    actorId: c.actorId,
    assigneeId: task.assigneeId,
    ownerId: task.ownerId,
    at: c.now,
    revision: task.revision,
    action: "calendar_" + action,
    changes: ["calendar"],
    note: text,
  });
  if (task.ownerId && task.ownerId !== c.actorId)
    notify(
      s,
      c,
      task.ownerId,
      `calendar:${id}`,
      text,
      task.title,
      "system",
      task.id,
    );
}
export function deliverCalendarReminder(
  state: State,
  sessionId: string,
  revision: number,
  now: number,
  id: () => string,
): State {
  const s = structuredClone(state),
    session = s.calendarSessions?.find((row) => row.id === sessionId);
  if (
    !session ||
    session.status !== "scheduled" ||
    session.revision !== revision ||
    session.reminderMinutes === undefined ||
    now >= session.end ||
    now > session.start + 15 * MINUTE ||
    now < session.start - session.reminderMinutes * MINUTE
  )
    return s;
  const task = s.tasks.find((row) => row.id === session.taskId),
    member = s.members.find((m) => m.id === session.assigneeId);
  if (
    !task ||
    !member ||
    task.assigneeId !== member.id ||
    !isSchedulableTask(task)
  )
    return s;
  const project = s.projects.find((p) => p.id === task.projectId);
  if (!project || project.archived || !canSeeProject(s, project, member.id))
    return s;
  notify(
    s,
    { actorId: member.id, now, id },
    member.id,
    `calendar-reminder:${session.id}:${revision}`,
    now >= session.start ? "Focus session started" : "Upcoming focus session",
    task.title,
    "system",
    task.id,
  );
  const reminder = s.notifications.find(
    (entry) => entry.key === `calendar-reminder:${session.id}:${revision}`,
  );
  if (reminder && reminder.deliveryAt >= session.end)
    s.notifications = s.notifications.filter(
      (entry) => entry.id !== reminder.id,
    );
  return s;
}
export function addTaskArtifact(s: State, artifact: TaskArtifact, c: Context) {
  const task = taskFor(s, artifact.taskId, c.actorId);
  if (
    artifact.createdBy !== c.actorId ||
    artifact.name.length > 180 ||
    !artifact.name.trim()
  )
    fail("ARTIFACT", "Enter a valid artifact name.");
  if (
    (s.artifacts ?? []).filter((a) => a.taskId === task.id && !a.removedAt)
      .length >= 100
  )
    fail("ARTIFACT_LIMIT", "A task can have up to 100 artifacts.");
  (s.artifacts ??= []).push(artifact);
  audit(
    s,
    c,
    `${artifact.kind === "file" ? "Uploaded" : "Linked"} ${artifact.name}`,
    task.id,
    task.projectId,
    "change",
    [artifact.id],
  );
  return artifact.id;
}
function notify(
  s: State,
  c: Context,
  recipientId: string,
  key: string,
  title: string,
  body: string,
  kind: State["notifications"][number]["kind"],
  taskId?: string,
  proposalId?: string,
) {
  if (
    s.notifications.some((n) => n.key === key && n.recipientId === recipientId)
  )
    return;
  const m = s.members.find((m) => m.id === recipientId);
  if (!m) return;
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: m.preferences.timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(c.now);
  const hour = Number(local),
    p = m.preferences;
  const quiet =
    p.quietStart > p.quietEnd
      ? hour >= p.quietStart || hour < p.quietEnd
      : hour >= p.quietStart && hour < p.quietEnd;
  let deliveryAt = c.now;
  if (quiet) {
    const day = dateInZone(c.now, p.timezone),
      next = hour >= p.quietStart ? addDays(day, 1) : day;
    deliveryAt = localInstant(next, p.quietEnd, p.timezone);
  }
  s.notifications.unshift({
    id: c.id(),
    recipientId,
    key,
    title,
    body,
    kind,
    taskId,
    proposalId,
    createdAt: c.now,
    deliveryAt,
    read: false,
  });
}
function validateTask(s: State, t: Task, c: Context) {
  const p = projectFor(s, t.projectId, c.actorId);
  if (p.archived)
    fail("ARCHIVED", "Restore this project before changing its tasks.");
  if (t.assigneeId) {
    const assignee = actor(s, t.assigneeId);
    if (!canSeeProject(s, p, assignee.id))
      fail("ASSIGNEE", "The assignee needs access to this project first.");
  }
  for (const id of t.collaborators)
    if (!canSeeProject(s, p, actor(s, id).id))
      fail("COLLABORATOR", "A collaborator needs project access.");
  for (const dep of t.dependencies) {
    const d = taskFor(s, dep, c.actorId);
    if (d.id === t.id)
      fail("DEPENDENCY_CYCLE", "A task cannot depend on itself.");
  }
  if (t.parentId) {
    const parent = taskFor(s, t.parentId, c.actorId);
    if (
      parent.projectId !== t.projectId ||
      parent.id === t.id ||
      parent.parentId
    )
      fail(
        "PARENT",
        "Subtasks must have a top-level parent in the same project.",
      );
  }
  if (t.ownerId) {
    const owner = actor(s, t.ownerId);
    if (!canSeeProject(s, projectFor(s, t.projectId, c.actorId), owner.id))
      fail("OWNER", "The task owner needs access to this project.");
  }
  if (t.reviewDate) Temporal.PlainDate.from(t.reviewDate);
  if (t.brainstorm && t.status !== "backlog") t.brainstorm = false;
  if (t.brainstorm && !t.reviewDate)
    t.reviewDate = addDays(
      dateInZone(c.now, actor(s, t.ownerId ?? c.actorId).preferences.timezone),
      actor(s, t.ownerId ?? c.actorId).preferences.agingDays?.backlog ??
        defaultAgingDays.backlog,
    );
  if (t.startDate) {
    Temporal.PlainDate.from(t.startDate);
    if (
      t.deadline &&
      localInstant(
        t.startDate,
        0,
        actor(s, t.assigneeId ?? c.actorId).preferences.timezone,
      ) >=
        deadlineAt(
          t.deadline,
          actor(s, t.assigneeId ?? c.actorId).preferences.timezone,
        )
    )
      fail("DATES", "The planned start must be on or before the deadline.");
  }
  if (t.deadline)
    deadlineAt(
      t.deadline,
      actor(s, t.assigneeId ?? c.actorId).preferences.timezone,
    );
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id))
      fail("DEPENDENCY_CYCLE", "Remove the circular dependency before saving.");
    const item = id === t.id ? t : s.tasks.find((x) => x.id === id);
    if (item) {
      const next = new Set(path).add(id);
      item.dependencies.forEach((d) => visit(d, next));
    }
  };
  visit(t.id, new Set());
}

function validateMentions(
  s: State,
  t: Task,
  text: string,
  mentions: Mention[],
  c: Context,
) {
  const project = projectFor(s, t.projectId, c.actorId);
  let end = 0;
  for (const mention of mentions) {
    if (
      mention.start < end ||
      mention.end <= mention.start ||
      mention.end > text.length ||
      !text.slice(mention.start, mention.end).startsWith("@") ||
      /[\r\n]/.test(text.slice(mention.start, mention.end)) ||
      !canSeeProject(s, project, mention.memberId)
    )
      fail(
        "MENTION",
        "Select a teammate with access to this project for each mention.",
      );
    end = mention.end;
  }
}
function addMentionCollaborators(t: Task, mentions: Mention[]) {
  t.collaborators = [
    ...new Set([...t.collaborators, ...mentions.map((m) => m.memberId)]),
  ];
  if (t.collaborators.length > 30)
    fail("COLLABORATOR_LIMIT", "A task can have up to 30 collaborators.");
}
function notifyMentions(
  s: State,
  t: Task,
  mentions: Mention[],
  previous: Mention[],
  key: string,
  c: Context,
) {
  const prior = new Set(previous.map((m) => m.memberId));
  for (const id of new Set(mentions.map((m) => m.memberId)))
    if (id !== c.actorId && !prior.has(id))
      notify(
        s,
        c,
        id,
        key,
        `${actor(s, c.actorId).name} mentioned you`,
        t.title,
        "system",
        t.id,
      );
}

function notifyCollaborators(
  s: State,
  t: Task,
  prior: string[],
  mentions: Mention[],
  c: Context,
) {
  const mentioned = new Set(mentions.map((m) => m.memberId));
  for (const id of t.collaborators)
    if (id !== c.actorId && !prior.includes(id) && !mentioned.has(id))
      notify(
        s,
        c,
        id,
        `collaborator:${t.id}:${t.revision}`,
        "Added as a collaborator",
        t.title,
        "assignment",
        t.id,
      );
}
function proposalFor(
  s: State,
  id: string,
  c: Context,
  revision: number,
): Proposal {
  const p = s.proposals.find((p) => p.id === id);
  if (!p) fail("FORBIDDEN", "This proposal is unavailable.");
  if (p.projectId) projectFor(s, p.projectId, c.actorId);
  else if (p.sprintId) sprintFor(s, p.sprintId, c.actorId);
  else if (p.createdBy !== c.actorId)
    fail("FORBIDDEN", "This proposal is private.");
  if (p.revision !== revision)
    fail("REVISION", "This proposal changed. Review the current revision.");
  return p;
}

export function execute(
  state: State,
  input: Command,
  context: Context,
): { state: State; result: string } {
  const requested = commandSchema.parse(input);
  const command =
    requested.type === "review_task"
      ? {
          type: "update_task" as const,
          id: requested.id,
          patch: {
            status:
              requested.decision === "approve"
                ? ("done" as const)
                : ("in_progress" as const),
          },
        }
      : requested;
  const s = structuredClone(state),
    c = context;
  const me = actor(s, c.actorId);
  if (requested.type === "review_task") {
    const task = taskFor(s, requested.id, c.actorId),
      project = projectFor(s, task.projectId, c.actorId);
    if (
      (task.ownerId ?? project.ownerId) !== c.actorId &&
      !manager(s, c.actorId)
    )
      fail(
        "FORBIDDEN",
        "Only the task owner or an administrator can validate this work.",
      );
    if (task.status !== "to_validate")
      fail("STATE", "This task is not awaiting validation.");
    if (requested.decision === "return" && !requested.reason?.trim())
      fail("REASON", "Give the worker a reason for returning this task.");
  }
  let result = "Saved";
  switch (command.type) {
    case "restore_calendar_sessions": {
      if (!c.verifiedCalendar)
        fail(
          "CALENDAR",
          "Fresh calendar availability must be checked before restoring reservations.",
        );
      const targets = command.sessions.map((desired) => ({
        ...editableCalendarSession(s, desired.sessionId, desired.revision, c),
        desired,
      }));
      const ids = new Set(targets.map(({ session }) => session.id));
      s.calendarSessions = [
        ...(s.calendarSessions ?? []).filter((row) => !ids.has(row.id)),
        ...targets.map(({ session }) => ({
          ...session,
          status: "released" as const,
        })),
      ];
      const changed: CalendarSession[] = [];
      for (const { session, desired } of targets) {
        if (
          !Number.isSafeInteger(desired.start) ||
          !Number.isSafeInteger(desired.end) ||
          desired.start % MINUTE !== 0 ||
          desired.end % MINUTE !== 0 ||
          desired.end <= desired.start ||
          desired.start < c.now ||
          desired.end > c.now + 184 * 86400000 ||
          desired.end - desired.start < 15 * MINUTE ||
          desired.end - desired.start > 240 * MINUTE
        )
          fail(
            "DATES",
            "Choose valid future reservation times within the next six months.",
          );
        if (desired.status === "scheduled") {
          const issues = calendarSessionIssues(
            s,
            { taskId: session.taskId, start: desired.start, end: desired.end },
            c.actorId,
            c.now,
            [session.id],
          );
          if (issues.length) fail("SCHEDULE", issues[0]);
        }
        const action =
          desired.status === "released"
            ? ("released" as const)
            : session.status === "released"
              ? ("scheduled" as const)
              : ("rescheduled" as const);
        const history =
          desired.status !== session.status ||
          desired.start !== session.start ||
          desired.end !== session.end
            ? [
                ...session.history,
                {
                  at: c.now,
                  actorId: c.actorId,
                  action,
                  fromStart: session.start,
                  fromEnd: session.end,
                  ...(desired.status === "scheduled"
                    ? { toStart: desired.start, toEnd: desired.end }
                    : {}),
                },
              ]
            : session.history;
        const row: CalendarSession = {
          ...session,
          start: desired.start,
          end: desired.end,
          status: desired.status,
          revision: session.revision + 1,
          updatedAt: c.now,
          reminderMinutes:
            desired.reminderMinutes === null
              ? undefined
              : desired.reminderMinutes,
          history,
        };
        s.calendarSessions = s.calendarSessions!.map((item) =>
          item.id === row.id ? row : item,
        );
        changed.push(row);
      }
      for (const taskId of new Set(changed.map((row) => row.taskId)))
        saveCalendarHistory(
          s,
          changed.filter((row) => row.taskId === taskId),
          taskFor(s, taskId, c.actorId),
          c,
          "updated",
        );
      result = changed[0].id;
      break;
    }
    case "schedule_calendar_session": {
      if (!c.verifiedCalendar)
        fail(
          "CALENDAR",
          "Fresh calendar availability must be checked before scheduling.",
        );
      const task = taskFor(s, command.taskId, c.actorId);
      if (task.assigneeId !== c.actorId)
        fail(
          "FORBIDDEN",
          "Only the worker can reserve time on their own calendar.",
        );
      if (
        s.calendars.find((cal) => cal.ownerId === c.actorId)?.destinationId !==
        "kazi"
      )
        fail("CALENDAR", "Use the Kazi agenda before reserving focus time.");
      if (
        command.recurrence &&
        command.recurrence.timezone !== me.preferences.timezone
      )
        fail("TIMEZONE", "Repeat sessions in your saved calendar time zone.");
      const spans = calendarOccurrences(
          command.start,
          command.end,
          command.recurrence,
          me.preferences.workingDays,
        ),
        seriesId = command.recurrence ? c.id() : undefined;
      const sessions: CalendarSession[] = [];
      for (const span of spans) {
        const issues = calendarSessionIssues(
          s,
          { ...span, taskId: task.id },
          c.actorId,
          c.now,
        );
        if (issues.length) fail("SCHEDULE", issues[0]);
        const session: CalendarSession = {
          id: c.id(),
          taskId: task.id,
          assigneeId: c.actorId,
          ...span,
          status: "scheduled",
          revision: 1,
          createdAt: c.now,
          updatedAt: c.now,
          createdBy: c.actorId,
          timezone: me.preferences.timezone,
          seriesId,
          originalStart: span.start,
          originalEnd: span.end,
          reminderMinutes: command.reminderMinutes,
          history: [
            {
              at: c.now,
              actorId: c.actorId,
              action: "scheduled",
              toStart: span.start,
              toEnd: span.end,
            },
          ],
        };
        (s.calendarSessions ??= []).push(session);
        sessions.push(session);
      }
      saveCalendarHistory(s, sessions, task, c, "scheduled");
      result = sessions[0].id;
      break;
    }
    case "update_calendar_session": {
      if (!c.verifiedCalendar)
        fail(
          "CALENDAR",
          "Fresh calendar availability must be checked before scheduling.",
        );
      const { session, task } = editableCalendarSession(
        s,
        command.sessionId,
        command.revision,
        c,
      );
      if (session.status === "released" && !command.restore)
        fail(
          "STATE",
          "This session was released. Restore it explicitly before reserving time.",
        );
      const shifted = shiftedCalendarSessions(
          s,
          session,
          command.start,
          command.end,
          command.scope,
          c.now,
        ).filter(
          (item) => command.restore || item.session.status === "scheduled",
        ),
        targets = shifted.map((item) => item.session);
      const targetIds = new Set(targets.map((row) => row.id));
      s.calendarSessions = [
        ...(s.calendarSessions ?? []).filter((row) => !targetIds.has(row.id)),
        ...targets.map((row) => ({ ...row, status: "released" as const })),
      ];
      const changed: CalendarSession[] = [];
      for (const target of targets) {
        if (target.assigneeId !== c.actorId)
          fail("FORBIDDEN", "Only the worker can change this calendar series.");
        const { start, end } = shifted.find(
            (item) => item.session.id === target.id,
          )!,
          issues = calendarSessionIssues(
            s,
            { taskId: target.taskId, start, end },
            c.actorId,
            c.now,
            [target.id],
          );
        if (issues.length) fail("SCHEDULE", issues[0]);
        const updated: CalendarSession = {
          ...target,
          start,
          end,
          status: "scheduled",
          revision: target.revision + 1,
          updatedAt: c.now,
          reminderMinutes:
            command.reminderMinutes === null
              ? undefined
              : (command.reminderMinutes ?? target.reminderMinutes),
          history: [
            ...target.history,
            ...(target.status === "released" ||
            target.start !== start ||
            target.end !== end
              ? [
                  {
                    at: c.now,
                    actorId: c.actorId,
                    action:
                      target.status === "released"
                        ? ("scheduled" as const)
                        : ("rescheduled" as const),
                    fromStart: target.start,
                    fromEnd: target.end,
                    toStart: start,
                    toEnd: end,
                  },
                ]
              : []),
          ],
        };
        s.calendarSessions = s.calendarSessions!.map((row) =>
          row.id === target.id ? updated : row,
        );
        changed.push(updated);
      }
      saveCalendarHistory(
        s,
        changed,
        task,
        c,
        session.status === "released"
          ? "scheduled"
          : session.start !== command.start || session.end !== command.end
            ? "rescheduled"
            : "updated",
      );
      result = session.id;
      break;
    }
    case "cancel_calendar_session": {
      const { session, task } = editableCalendarSession(
        s,
        command.sessionId,
        command.revision,
        c,
      );
      if (session.status !== "scheduled")
        fail("STATE", "This session is already released.");
      const targets = calendarTargets(s, session, command.scope, c.now).filter(
          (row) => row.status === "scheduled",
        ),
        ids = new Set(targets.map((row) => row.id));
      const changed: CalendarSession[] = targets.map((row) => ({
        ...row,
        status: "released",
        revision: row.revision + 1,
        updatedAt: c.now,
        history: [
          ...row.history,
          {
            at: c.now,
            actorId: c.actorId,
            action: "released",
            fromStart: row.start,
            fromEnd: row.end,
          },
        ],
      }));
      s.calendarSessions = [
        ...(s.calendarSessions ?? []).filter((row) => !ids.has(row.id)),
        ...changed,
      ];
      saveCalendarHistory(s, changed, task, c, "released");
      result = session.id;
      break;
    }
    case "create_sprint": {
      if (me.role === "guest")
        fail("FORBIDDEN", "Guests cannot create sprints.");
      const sprint: Sprint = {
        id: c.id(),
        title:
          command.title ?? automaticSprintName(s.workspace, command.startDate),
        objective: command.objective,
        successCriteria: command.successCriteria,
        focus: command.focus,
        automaticName: command.title === undefined,
        objectives: command.objectives,
        startDate: command.startDate,
        endDate: command.endDate,
        timezone: command.timezone,
        ownerId: c.actorId,
        status: "planned",
        taskIds: [],
        projectIds: [],
        revision: 1,
        createdAt: c.now,
        updatedAt: c.now,
        changes: [],
      };
      selectSprintTasks(s, sprint, command.taskIds, c);
      sprint.objectiveAssignments = command.objectiveAssignments;
      syncSprintObjectives(sprint);
      validateSprint(s, sprint);
      (s.sprints ??= []).push(sprint);
      result = sprint.id;
      break;
    }
    case "update_sprint": {
      const sprint = manageSprint(s, command.id, command.revision, c);
      if (
        sprint.status === "active" &&
        (command.patch.startDate ||
          command.patch.endDate ||
          command.patch.title ||
          command.patch.automaticName !== undefined)
      )
        fail(
          "DATES",
          "An active sprint keeps its dates and name. Adjust its scope or close it instead.",
        );
      const beforeObjectives = JSON.stringify(sprintObjectives(sprint));
      const beforeAssignments = JSON.stringify(sprintAssignments(sprint));
      const changeCount = sprint.changes.length;
      const previousTaskIds = new Set(sprint.taskIds);
      const { taskIds, objectiveAssignments, ...fields } = command.patch;
      if (
        sprint.objectives &&
        !fields.objectives &&
        (fields.objective !== undefined || fields.successCriteria !== undefined)
      )
        fields.objectives = sprint.objectives.map((objective, index) =>
          index === 0
            ? {
                ...objective,
                title: fields.objective ?? objective.title,
                successCriteria:
                  fields.successCriteria ?? objective.successCriteria,
              }
            : objective,
        );
      Object.assign(sprint, fields);
      if (taskIds) selectSprintTasks(s, sprint, taskIds, c);
      if (objectiveAssignments !== undefined)
        sprint.objectiveAssignments = objectiveAssignments;
      syncSprintObjectives(sprint);
      if (sprint.status === "planned" && sprint.automaticName)
        sprint.title = automaticSprintName(s.workspace, sprint.startDate);
      validateSprint(s, sprint);
      if (
        beforeObjectives !== JSON.stringify(sprintObjectives(sprint)) ||
        beforeAssignments !== JSON.stringify(sprintAssignments(sprint))
      ) {
        const entry = {
          objectives: structuredClone(sprintObjectives(sprint)),
          objectiveAssignments: { ...sprintAssignments(sprint) },
        };
        if (sprint.changes.length > changeCount)
          Object.assign(sprint.changes.at(-1)!, entry);
        else
          sprint.changes.push({
            at: c.now,
            actorId: c.actorId,
            added: [],
            removed: [],
            ...entry,
          });
      }
      if (taskIds && sprint.status === "active")
        sprint.backlogPromotionActorId = c.actorId;
      if (taskIds && sprintHasBegun(sprint, c.now)) {
        promoteSprintBacklog(
          s,
          sprint,
          sprint.backlogPromotedAt === undefined
            ? sprint.taskIds
            : sprint.taskIds.filter((id) => !previousTaskIds.has(id)),
          c,
        );
        sprint.backlogPromotedAt ??= c.now;
      }
      sprint.revision++;
      sprint.updatedAt = c.now;
      staleSprintPlans(s, sprint.id);
      break;
    }
    case "start_sprint": {
      const sprint = manageSprint(s, command.id, command.revision, c);
      if (sprint.status !== "planned")
        fail("STATE", "This sprint has already started.");
      if (s.sprints?.some((other) => other.status === "active"))
        fail(
          "STATE",
          "Close the current active sprint before starting another.",
        );
      if (localInstant(sprint.endDate, 24, sprint.timezone) <= c.now)
        fail("DATES", "Choose a sprint period that has not ended.");
      if (!sprint.taskIds.length)
        fail("TASKS", "Select work before starting the sprint.");
      selectSprintTasks(s, sprint, sprint.taskIds, c);
      if (sprint.automaticName)
        sprint.title = automaticSprintName(s.workspace, sprint.startDate);
      sprint.status = "active";
      validateSprint(s, sprint);
      sprint.startedAt = c.now;
      sprint.backlogPromotionActorId = c.actorId;
      sprint.initialTasks = sprintSnapshot(
        s.tasks.filter((task) => sprint.taskIds.includes(task.id)),
      );
      sprint.initialObjectives = structuredClone(sprintObjectives(sprint));
      sprint.initialObjectiveAssignments = { ...sprintAssignments(sprint) };
      if (sprintHasBegun(sprint, c.now)) {
        promoteSprintBacklog(s, sprint, sprint.taskIds, c);
        sprint.backlogPromotedAt = c.now;
      }
      sprint.revision++;
      sprint.updatedAt = c.now;
      staleSprintPlans(s, sprint.id);
      break;
    }
    case "cancel_sprint": {
      const sprint = manageSprint(s, command.id, command.revision, c);
      if (sprint.status !== "planned")
        fail("STATE", "Use closeout for an active sprint.");
      sprint.status = "canceled";
      sprint.updatedAt = c.now;
      sprint.revision++;
      staleSprintPlans(s, sprint.id);
      break;
    }
    case "close_sprint": {
      const sprint = manageSprint(s, command.id, command.revision, c);
      if (sprint.status !== "active")
        fail("STATE", "Start the sprint before closing it.");
      const tasks = s.tasks.filter((task) => sprint.taskIds.includes(task.id));
      const unfinished = tasks.filter(
        (task) => task.status !== "done" && !isArchivedTask(task),
      );
      if (
        command.decisions.length !== unfinished.length ||
        new Set(command.decisions.map((d) => d.taskId)).size !==
          unfinished.length ||
        unfinished.some(
          (task) => !command.decisions.some((d) => d.taskId === task.id),
        )
      )
        fail(
          "CLOSEOUT",
          "Choose what happens to every unfinished task before closing.",
        );
      const snapshot = sprintSnapshot(tasks);
      const objectives = sprintObjectives(sprint);
      const results =
        command.objectiveOutcomes ??
        (objectives.length === 1 && command.outcome
          ? [{ objectiveId: objectives[0].id, outcome: command.outcome }]
          : []);
      if (
        results.length !== objectives.length ||
        new Set(results.map((result) => result.objectiveId)).size !==
          objectives.length ||
        objectives.some(
          (objective) =>
            !results.some((result) => result.objectiveId === objective.id),
        )
      )
        fail("CLOSEOUT", "Assess every sprint objective before closing.");
      // Close first inside this atomic command, allowing explicit transfer to a planned sprint.
      sprint.status = "closed";
      sprint.closeout = {
        at: c.now,
        actorId: c.actorId,
        outcome: command.outcome,
        objectives: objectives.map((objective) => {
          const result = results.find(
            (result) => result.objectiveId === objective.id,
          )!;
          return { ...objective, outcome: result.outcome, note: result.note };
        }),
        objectiveAssignments: { ...sprintAssignments(sprint) },
        note: command.note,
        tasks: snapshot,
        originalTasks: sprintSnapshot(
          s.tasks.filter((task) =>
            sprint.initialTasks?.some((original) => original.id === task.id),
          ),
        ),
        decisions: command.decisions,
      };
      sprint.updatedAt = c.now;
      sprint.revision++;
      staleSprintPlans(s, sprint.id);
      for (const decision of command.decisions) {
        const task = taskFor(s, decision.taskId, c.actorId);
        editable(s, task, c.actorId);
        if (decision.action !== "sprint" && decision.sprintId)
          fail(
            "CLOSEOUT",
            "Only a sprint transfer can have a destination sprint.",
          );
        if (decision.action === "backlog") {
          const lifecycleEvents = s.lifecycleEvents;
          Object.assign(
            s,
            execute(
              s,
              {
                type: "update_task",
                id: task.id,
                patch: { status: "backlog" },
              },
              c,
            ).state,
            { lifecycleEvents },
          );
        } else if (decision.action === "sprint") {
          if (!decision.sprintId || decision.sprintId === sprint.id)
            fail(
              "CLOSEOUT",
              "Choose a different planned sprint for this task.",
            );
          const target = sprintFor(s, decision.sprintId, c.actorId);
          manageSprint(s, target.id, target.revision, c);
          if (target.status !== "planned")
            fail("CLOSEOUT", "Move unfinished work to a planned sprint.");
          if (target.taskIds.length >= 100)
            fail("TASKS", "A sprint can contain up to 100 tasks.");
          selectSprintTasks(s, target, [...target.taskIds, task.id], c);
          validateSprint(s, target);
          target.revision++;
          target.updatedAt = c.now;
          staleSprintPlans(s, target.id);
        }
      }
      result = sprint.id;
      break;
    }
    case "use_kazi_agenda": {
      const cal = s.calendars.find((row) => row.ownerId === c.actorId);
      if (cal) {
        cal.destinationId = "kazi";
        if (
          cal.status !== "demo" &&
          !(cal.status === "error" && cal.selectedIds.length)
        )
          cal.status = "native";
        if (command.shareAvailability !== undefined)
          cal.shareAvailability = command.shareAvailability;
      } else
        s.calendars.push({
          ownerId: c.actorId,
          status: "native",
          selectedIds: [],
          destinationId: "kazi",
          lastSync: c.now,
          shareAvailability: command.shareAvailability ?? false,
        });
      audit(
        s,
        c,
        "Enabled Kazi agenda; existing external availability preserved",
      );
      break;
    }
    case "create_project": {
      if (me.role === "guest")
        fail("FORBIDDEN", "Guests cannot create projects.");
      const p: Project = {
        id: c.id(),
        title: command.title,
        description: command.description,
        ownerId: c.actorId,
        memberIds: [c.actorId],
        color: command.color,
        icon: "folder",
        deadline: command.deadline,
        startDate: command.startDate,
        private: command.private,
        archived: false,
        status: command.status ?? "active",
        priority: command.priority ?? "medium",
        createdAt: c.now,
        updatedAt: c.now,
        statusChangedAt: c.now,
      };
      if (p.startDate) Temporal.PlainDate.from(p.startDate);
      if (
        p.startDate &&
        p.deadline &&
        localInstant(
          p.startDate,
          0,
          actor(s, p.ownerId).preferences.timezone,
        ) >= deadlineAt(p.deadline, actor(s, p.ownerId).preferences.timezone)
      )
        fail("DATES", "Project start must be on or before delivery date.");
      if (p.deadline) deadlineAt(p.deadline, me.preferences.timezone);
      s.projects.push(p);
      audit(s, c, "Created project", undefined, p.id);
      result = p.id;
      break;
    }
    case "update_project": {
      const p = projectFor(s, command.id, c.actorId);
      if (!canManage(s, p, c.actorId))
        fail("FORBIDDEN", "A project manager must make this change.");
      if (p.id === s.workspace.inboxId && command.patch.archived)
        fail("INBOX", "The default planning project cannot be archived.");
      command.patch.memberIds?.forEach((id) => actor(s, id));
      if (command.patch.ownerId) actor(s, command.patch.ownerId);
      if (command.patch.startDate)
        Temporal.PlainDate.from(command.patch.startDate);
      const priorDeadline = p.deadline,
        priorStatus = p.status;
      Object.assign(p, command.patch);
      p.updatedAt = c.now;
      p.revision = (p.revision ?? 0) + 1;
      if (priorStatus !== p.status) p.statusChangedAt = c.now;
      if (
        p.startDate &&
        p.deadline &&
        localInstant(
          p.startDate,
          0,
          actor(s, p.ownerId).preferences.timezone,
        ) >= deadlineAt(p.deadline, actor(s, p.ownerId).preferences.timezone)
      )
        fail("DATES", "Project start must be on or before delivery date.");
      if (p.deadline)
        deadlineAt(p.deadline, actor(s, p.ownerId).preferences.timezone);
      if (priorDeadline !== p.deadline)
        audit(
          s,
          c,
          `Original project deadline changed from ${priorDeadline || "none"} to ${p.deadline || "none"}`,
          undefined,
          p.id,
        );
      audit(s, c, "Updated project", undefined, p.id);
      break;
    }
    case "favorite_project": {
      const project = projectFor(s, command.projectId, c.actorId);
      const favorites = new Set(me.favoriteProjectIds ?? []);
      if (command.favorite) {
        if (!favorites.has(project.id))
          (me.favoriteProjectAt ??= {})[project.id] = c.now;
        favorites.add(project.id);
      } else {
        favorites.delete(project.id);
        if (me.favoriteProjectAt) delete me.favoriteProjectAt[project.id];
      }
      me.favoriteProjectIds = [...favorites];
      result = project.id;
      break;
    }
    case "favorite_team": {
      if (s.workspace.kind !== "team")
        fail("TEAM", "Choose a shared team to add it to Favorites.");
      if (command.favorite) me.favoriteTeamAt ??= c.now;
      else delete me.favoriteTeamAt;
      result = s.workspace.id;
      break;
    }
    case "create_task": {
      const projectId = command.projectId ?? s.workspace.inboxId,
        p = projectFor(s, projectId, c.actorId);
      if (me.role === "guest" && !p.memberIds.includes(me.id))
        fail("FORBIDDEN", "You cannot add work here.");
      const { type: _, ...fields } = command;
      const t: Task = {
        ...fields,
        id: c.id(),
        projectId,
        assigneeId: command.assigneeId ?? c.actorId,
        ownerId: command.ownerId ?? c.actorId,
        status: command.status ?? "backlog",
        collaborators: command.collaborators ?? [],
        loggedMinutes: 0,
        statusChangedAt: c.now,
        remainingMinutes: command.remainingMinutes ?? command.estimatedMinutes,
        revision: 1,
        createdAt: c.now,
        updatedAt: c.now,
        lastProgress: c.now,
      };
      if (t.assigneeId === "unassigned") delete t.assigneeId;
      validateMentions(s, t, t.description, t.descriptionMentions ?? [], c);
      addMentionCollaborators(t, t.descriptionMentions ?? []);
      validateTask(s, t, c);
      s.tasks.push(t);
      audit(s, c, "Created task", t.id, p.id);
      notifyMentions(
        s,
        t,
        t.descriptionMentions ?? [],
        [],
        `mention:description:${t.id}:${t.revision}`,
        c,
      );
      notifyCollaborators(s, t, [], t.descriptionMentions ?? [], c);
      if (t.assigneeId && t.assigneeId !== c.actorId)
        notify(
          s,
          c,
          t.assigneeId,
          "assignment:" + t.id,
          "New work for you",
          t.title,
          "assignment",
          t.id,
        );
      result = t.id;
      break;
    }
    case "update_task": {
      const t = taskFor(s, command.id, c.actorId);
      editable(s, t, c.actorId);
      if (command.patch.status === "idea") command.patch.status = "backlog";
      if (
        command.patch.status &&
        ["blocked", "rejected", "canceled"].includes(command.patch.status)
      )
        command.patch.status = "archived";
      const reviewOwner =
        t.ownerId ?? projectFor(s, t.projectId, c.actorId).ownerId;
      if (
        command.patch.status === "done" &&
        t.status !== "done" &&
        reviewOwner !== c.actorId &&
        !manager(s, c.actorId)
      )
        fail(
          "VALIDATION_REQUIRED",
          "Submit this task To validate. Its owner must approve completion.",
        );
      if (
        command.patch.ownerId &&
        command.patch.ownerId !== reviewOwner &&
        reviewOwner !== c.actorId &&
        !canManage(s, projectFor(s, t.projectId, c.actorId), c.actorId)
      )
        fail(
          "FORBIDDEN",
          "Only the task owner or project manager can change review ownership.",
        );
      const oldAssignee = t.assigneeId,
        oldCollaborators = [...t.collaborators],
        oldMentions = t.descriptionMentions ?? [],
        priorDeadline = t.deadline,
        priorStatus = t.status,
        priorProject = t.projectId;
      if (
        command.patch.assigneeId !== undefined &&
        command.patch.assigneeId !== t.assigneeId &&
        reviewOwner !== c.actorId &&
        !canManage(s, projectFor(s, t.projectId, c.actorId), c.actorId) &&
        command.patch.assigneeId !== c.actorId
      )
        fail("FORBIDDEN", "Ask a project manager to reassign this task.");
      if (command.patch.projectId && command.patch.projectId !== t.projectId) {
        projectFor(s, command.patch.projectId, c.actorId);
        if (t.parentId || s.tasks.some((x) => x.parentId === t.id))
          fail(
            "SUBTASKS",
            "Move the parent and subtasks together in a dedicated operation.",
          );
      }
      if (
        command.patch.description !== undefined &&
        command.patch.descriptionMentions === undefined
      )
        command.patch.descriptionMentions = [];
      Object.assign(t, command.patch);
      for (const field of ["deadline", "startDate", "reviewDate"] as const)
        if (t[field] === "") delete t[field];
      if (t.status !== priorStatus) {
        t.statusChangedAt = c.now;
        if (priorStatus === "done" || isArchivedTask({ status: priorStatus }))
          delete t.startedAt;
        if (t.status === "in_progress" && t.startedAt === undefined)
          t.startedAt = c.now;
      }
      if ((priorDeadline || undefined) !== (t.deadline || undefined))
        audit(
          s,
          c,
          `Original task deadline changed from ${priorDeadline || "none"} to ${t.deadline || "none"}`,
          t.id,
          t.projectId,
        );
      if (command.patch.assigneeId === "unassigned") delete t.assigneeId;
      if (
        command.patch.status !== undefined ||
        command.patch.remainingMinutes !== undefined
      )
        t.lastProgress = c.now;
      t.updatedAt = c.now;
      t.revision++;
      validateMentions(s, t, t.description, t.descriptionMentions ?? [], c);
      if (command.patch.descriptionMentions !== undefined)
        addMentionCollaborators(t, t.descriptionMentions ?? []);
      validateTask(s, t, c);
      notifyMentions(
        s,
        t,
        t.descriptionMentions ?? [],
        oldMentions,
        `mention:description:${t.id}:${t.revision}`,
        c,
      );
      notifyCollaborators(
        s,
        t,
        oldCollaborators,
        t.descriptionMentions ?? [],
        c,
      );
      if (priorStatus !== "done" && t.status === "done") {
        const dueAt = deadlineAt(
          priorDeadline,
          s.members.find((m) => m.id === oldAssignee)?.preferences.timezone ??
            me.preferences.timezone,
        );
        (s.reportEvents ??= []).push({
          id: c.id(),
          taskId: t.id,
          projectId: priorProject,
          actorId: c.actorId,
          assigneeId: oldAssignee,
          at: c.now,
          type: "completed",
          minutes: 0,
          taskCreatedAt: t.createdAt,
          ...(t.startedAt !== undefined ? { startedAt: t.startedAt } : {}),
          ...(Number.isFinite(dueAt) ? { dueAt } : {}),
          ...(priorDeadline ? { deadline: priorDeadline } : {}),
          leaf: !s.tasks.some((x) => x.parentId === t.id),
        });
      }
      if (
        t.parentId &&
        (command.patch.status !== undefined ||
          command.patch.remainingMinutes !== undefined)
      ) {
        const parent = s.tasks.find((p) => p.id === t.parentId);
        if (parent) {
          parent.lastProgress = c.now;
          parent.updatedAt = c.now;
          parent.revision++;
        }
      }
      if (!isSchedulableTask(t) || oldAssignee !== t.assigneeId) {
        for (const proposal of s.proposals) {
          let released = false;
          for (const session of proposal.alternatives[proposal.selected]
            ?.sessions ?? []) {
            if (
              session.taskId === t.id &&
              session.start > c.now &&
              session.status === "scheduled" &&
              proposal.inputs?.calendarDestinations?.[session.assigneeId] ===
                "kazi"
            ) {
              session.status = "released";
              session.updatedAt = c.now;
              released = true;
            }
          }
          if (released && proposal.status === "applied")
            proposal.status = "partial";
        }
      }
      audit(
        s,
        c,
        priorStatus !== "done" && t.status === "done"
          ? "Completed task"
          : priorStatus === "done" && t.status !== "done"
            ? "Reopened task"
            : "Updated task",
        t.id,
        t.projectId,
      );
      if (priorStatus !== "to_validate" && t.status === "to_validate") {
        const owner =
          t.ownerId ?? projectFor(s, t.projectId, c.actorId).ownerId;
        notify(
          s,
          c,
          owner,
          `${t.id}:validation:${t.revision}`,
          "Task ready for validation",
          `${t.title} is ready for your review. Approve it or return it with a reason.`,
          "review",
          t.id,
        );
      }
      if (requested.type === "review_task") {
        audit(
          s,
          c,
          requested.decision === "approve"
            ? "Validated task"
            : "Changes requested: " + requested.reason,
          t.id,
          t.projectId,
          "comment",
        );
        if (t.assigneeId && t.assigneeId !== c.actorId)
          notify(
            s,
            c,
            t.assigneeId,
            `${t.id}:review:${t.revision}`,
            requested.decision === "approve"
              ? "Your task was validated"
              : "Changes requested",
            requested.decision === "approve"
              ? t.title + " was approved and completed."
              : t.title + ": " + requested.reason,
            "review",
            t.id,
          );
      }
      if (oldAssignee !== t.assigneeId && t.assigneeId)
        notify(
          s,
          c,
          t.assigneeId,
          `assignment:${t.id}:${t.revision}`,
          "A task was assigned to you",
          t.title,
          "assignment",
          t.id,
        );
      break;
    }
    case "progress": {
      const t = taskFor(s, command.id, c.actorId);
      editable(s, t, c.actorId);
      if (isArchivedTask(t))
        fail("ARCHIVED", "Restore this task before recording progress.");
      t.remainingMinutes = command.remainingMinutes;
      t.loggedMinutes += command.loggedMinutes;
      t.lastProgress = c.now;
      t.updatedAt = c.now;
      t.revision++;
      if (command.loggedMinutes > 0)
        (s.reportEvents ??= []).push({
          id: c.id(),
          taskId: t.id,
          projectId: t.projectId,
          actorId: c.actorId,
          assigneeId: t.assigneeId,
          at: c.now,
          type: "time_logged",
          minutes: command.loggedMinutes,
          leaf: !s.tasks.some((x) => x.parentId === t.id),
        });
      if (t.parentId) {
        const parent = s.tasks.find((p) => p.id === t.parentId);
        if (parent) {
          parent.lastProgress = c.now;
          parent.updatedAt = c.now;
          parent.revision++;
        }
      }
      audit(
        s,
        c,
        `Progress: ${command.remainingMinutes} minutes remaining. ${command.note}`,
        t.id,
        t.projectId,
      );
      break;
    }
    case "comment": {
      const t = taskFor(s, command.id, c.actorId);
      const content = trimMentionText(command.body, command.mentions);
      command.body = content.text;
      const mentions = content.mentions;
      validateMentions(s, t, command.body, mentions, c);
      const attachmentIds = [...new Set(command.attachmentIds ?? [])];
      if (!command.body && !attachmentIds.length)
        fail("COMMENT", "Write a comment or attach a file.");
      for (const id of attachmentIds)
        if (
          !(s.artifacts ?? []).some(
            (a) => a.id === id && a.taskId === t.id && !a.removedAt,
          )
        )
          fail("ARTIFACT", "An attachment is unavailable for this task.");
      result = audit(
        s,
        c,
        command.body,
        t.id,
        t.projectId,
        "comment",
        attachmentIds,
        mentions,
      );
      const beforeCollaborators = [...t.collaborators];
      addMentionCollaborators(t, mentions);
      if (beforeCollaborators.length !== t.collaborators.length) {
        t.revision++;
        t.updatedAt = c.now;
        audit(
          s,
          c,
          "Added mentioned people as collaborators",
          t.id,
          t.projectId,
        );
      }
      notifyMentions(s, t, mentions, [], "comment:" + result, c);
      for (const person of new Set([
        t.ownerId,
        t.assigneeId,
        ...t.collaborators,
      ]))
        if (
          person &&
          person !== c.actorId &&
          canSeeProject(s, projectFor(s, t.projectId, c.actorId), person)
        )
          notify(
            s,
            c,
            person,
            "comment:" + result,
            `New comment on ${t.title}`,
            command.body.slice(0, 300) || "Shared an attachment.",
            "system",
            t.id,
          );
      break;
    }
    case "attach_link": {
      result = addTaskArtifact(
        s,
        {
          id: c.id(),
          taskId: command.id,
          name: command.name,
          kind: "link",
          url: new URL(command.url).href,
          placement: command.placement,
          createdBy: c.actorId,
          createdAt: c.now,
        },
        c,
      );
      break;
    }
    case "remove_artifact": {
      const t = taskFor(s, command.id, c.actorId);
      const artifact = (s.artifacts ?? []).find(
        (a) => a.taskId === t.id && a.id === command.artifactId,
      );
      if (!artifact) fail("ARTIFACT", "This artifact is unavailable.");
      if (artifact.createdBy !== c.actorId) editable(s, t, c.actorId);
      if (!artifact.removedAt) {
        artifact.removedAt = c.now;
        audit(s, c, `Removed artifact ${artifact.name}`, t.id, t.projectId);
      }
      break;
    }
    case "preferences": {
      const p = command.preferences;
      if (
        p.endHour <= p.startHour ||
        p.maxSession < p.minSession ||
        p.horizonDays > 28 ||
        !p.workingDays.length
      )
        fail(
          "PREFERENCES",
          "Choose valid working hours, session lengths, days, and a horizon up to 28 days.",
        );
      dateInZone(c.now, p.timezone);
      me.preferences = p;
      audit(
        s,
        c,
        `Review new plans before scheduling: ${p.reviewRequired ? "ON" : "OFF"}. Personal scope; ${p.dailyMinutes} min/day; ${p.timezone}.`,
        undefined,
        undefined,
        "policy",
      );
      break;
    }
    case "propose": {
      if (command.projectId && command.sprintId)
        fail("SCOPE", "Choose a project or a sprint for this plan.");
      const sprint = command.sprintId
        ? sprintFor(s, command.sprintId, c.actorId)
        : undefined;
      if (sprint && !isOpenSprint(sprint))
        fail("STATE", "This sprint is closed. Plan current work instead.");
      if (sprint && localInstant(sprint.endDate, 24, sprint.timezone) <= c.now)
        fail(
          "DATES",
          "This sprint period has ended. Close it and plan the remaining work.",
        );
      const p = command.projectId
        ? projectFor(s, command.projectId, c.actorId)
        : undefined;
      const tasks = s.tasks.filter(
        (t) =>
          (sprint
            ? sprint.taskIds.includes(t.id)
            : p
              ? t.projectId === p.id
              : t.assigneeId === c.actorId) &&
          canSeeProject(
            s,
            s.projects.find((p) => p.id === t.projectId)!,
            c.actorId,
          ),
      );
      if (
        p &&
        !canManage(s, p, c.actorId) &&
        tasks.some((t) => t.assigneeId !== c.actorId)
      )
        fail(
          "FORBIDDEN",
          "A project manager must propose work for other people.",
        );
      if (
        sprint &&
        tasks.some(
          (task) =>
            task.assigneeId !== c.actorId &&
            !canManage(s, projectFor(s, task.projectId, c.actorId), c.actorId),
        )
      )
        fail(
          "FORBIDDEN",
          "A project manager must propose work for other people.",
        );
      if (!tasks.some(isSchedulableTask))
        fail("EMPTY", "Move tasks into To do before planning work sessions.");
      const existing = s.proposals.find(
        (x) =>
          x.projectId === command.projectId &&
          x.sprintId === command.sprintId &&
          x.createdBy === c.actorId &&
          x.status === "awaiting_review" &&
          x.trigger === command.trigger,
      );
      if (existing) {
        const unchanged =
          existing.expiresAt > c.now &&
          (!sprint || existing.sprintRevision === sprint.revision) &&
          existing.inputs?.startDate ===
            (sprint
              ? dateInZone(
                  Math.max(
                    c.now,
                    localInstant(sprint.startDate, 0, sprint.timezone),
                  ),
                  sprint.timezone,
                )
              : command.startDate) &&
          Object.entries(existing.taskRevisions).every(
            ([id, revision]) =>
              s.tasks.find((task) => task.id === id)?.revision === revision,
          ) &&
          !existing.alternatives[existing.selected].sessions.some((session) =>
            s.busy.some(
              (busy) =>
                busy.ownerId === session.assigneeId &&
                busy.start < session.end &&
                busy.end > session.start,
            ),
          );
        if (unchanged) {
          result = existing.id;
          break;
        }
        existing.status = "stale";
      }
      const prefs: Record<string, Member["preferences"]> = {};
      for (const member of s.members) {
        const calendar = s.calendars.find((x) => x.ownerId === member.id);
        if (
          calendar &&
          (calendar.status === "demo" ||
            (calendar.status === "native" &&
              (!calendar.selectedIds.length ||
                (calendar.lastSync &&
                  c.now - calendar.lastSync < 5 * MINUTE))) ||
            (calendar.status === "connected" &&
              calendar.lastSync &&
              c.now - calendar.lastSync < 5 * MINUTE)) &&
          (member.id === c.actorId ||
            calendar.status === "demo" ||
            calendar.shareAvailability === true)
        )
          prefs[member.id] = member.preferences;
      }
      if (!Object.keys(prefs).length)
        fail(
          "CALENDAR",
          "Connect and refresh your calendar before planning. Unknown availability is not free time.",
        );
      const busy = [
        ...s.busy,
        ...calendarReservations(s).map((x) => ({
          start: x.start,
          end: x.end,
          ownerId: x.assigneeId,
        })),
      ];
      const common = {
        tasks,
        confirmedSessions: calendarReservations(s).filter(
          (session) => session.status === "scheduled",
        ),
        allTasks: s.tasks,
        busy: busy.filter((b) => prefs[b.ownerId] !== undefined),
        preferences: prefs,
        startDate: sprint
          ? dateInZone(
              Math.max(
                c.now,
                localInstant(sprint.startDate, 0, sprint.timezone),
              ),
              sprint.timezone,
            )
          : command.startDate,
        days: sprint
          ? sprintDays(
              dateInZone(
                Math.max(
                  c.now,
                  localInstant(sprint.startDate, 0, sprint.timezone),
                ),
                sprint.timezone,
              ),
              sprint.endDate,
            )
          : Math.min(command.days, me.preferences.horizonDays),
        windowStart: sprint
          ? localInstant(sprint.startDate, 0, sprint.timezone)
          : undefined,
        windowEnd: sprint
          ? localInstant(sprint.endDate, 24, sprint.timezone)
          : undefined,
        now: c.now,
        recoveryTarget: command.recoveryTarget,
      };
      const alternatives = [allocate({ ...common, strategy: "early" })];
      for (const strategy of ["focus", "compact"] as const) {
        const alternative = allocate({ ...common, strategy });
        if (
          alternative.sessions.length &&
          !alternatives.some(
            (a) =>
              JSON.stringify(a.sessions) ===
              JSON.stringify(alternative.sessions),
          )
        )
          alternatives.push(alternative);
      }
      const parent = s.versions
        .filter(
          (v) =>
            v.projectId === command.projectId &&
            v.sprintId === command.sprintId &&
            (v.projectId || v.sprintId || v.createdBy === c.actorId),
        )
        .sort((a, b) => b.number - a.number)[0];
      const proposal: Proposal = {
        id: c.id(),
        projectId: command.projectId,
        sprintId: sprint?.id,
        sprintRevision: sprint?.revision,
        title: sprint?.title ?? p?.title ?? "Personal plan",
        revision: 1,
        status: "awaiting_review",
        trigger: command.trigger,
        parentVersionId: parent?.id,
        taskRevisions: Object.fromEntries(
          tasks.filter(isSchedulableTask).map((t) => [t.id, t.revision]),
        ),
        alternatives,
        selected: 0,
        createdAt: c.now,
        expiresAt: c.now + 24 * 60 * MINUTE,
        recoveryTarget: command.recoveryTarget,
        availabilityAt: c.now,
        createdBy: c.actorId,
        automatic: !!c.automatic,
        approvedBy: [],
        inputs: {
          sprintObjectives: sprint
            ? structuredClone(sprintObjectives(sprint))
            : undefined,
          sprintObjectiveAssignments: sprint
            ? { ...sprintAssignments(sprint) }
            : undefined,
          sprintFocus: sprint?.focus,
          windowStart: common.windowStart,
          windowEnd: common.windowEnd,
          calendarDestinations: Object.fromEntries(
            s.calendars
              .filter((cal) => prefs[cal.ownerId] && cal.destinationId)
              .map((cal) => [cal.ownerId, cal.destinationId!]),
          ),
          tasks: structuredClone(tasks),
          preferences: structuredClone(prefs),
          busy: structuredClone(common.busy),
          startDate: common.startDate,
          days: common.days,
          now: c.now,
          recoveryTarget: command.recoveryTarget,
        },
      };
      s.proposals.push(proposal);
      notify(
        s,
        c,
        c.actorId,
        "review:" + proposal.id,
        command.trigger === "recovery"
          ? "Recovery plan ready for review"
          : "Weekly plan ready for review",
        "Your proposal is ready. Review the sessions before scheduling.",
        "review",
        undefined,
        proposal.id,
      );
      audit(s, c, "Created plan proposal", undefined, p?.id);
      result = proposal.id;
      break;
    }
    case "select_alternative": {
      const p = proposalFor(s, command.id, c, command.revision);
      if (p.status !== "awaiting_review")
        fail("STATE", "Only a pending proposal can be edited.");
      if (!p.alternatives[command.selected])
        fail("ALTERNATIVE", "This alternative is unavailable.");
      p.selected = command.selected;
      p.revision++;
      p.approvedBy = [];
      break;
    }
    case "reject": {
      const p = proposalFor(s, command.id, c, command.revision);
      if (p.status !== "awaiting_review")
        fail("STATE", "This proposal is no longer awaiting review.");
      p.status = "rejected";
      p.approvedBy = [];
      audit(s, c, "Rejected proposal", undefined, p.projectId);
      break;
    }
    case "approve": {
      const p = proposalFor(s, command.id, c, command.revision);
      const accepted = s.versions.find((v) => v.proposalId === p.id);
      if (accepted) {
        result = accepted.id;
        break;
      }
      if (p.status !== "awaiting_review" || p.expiresAt < c.now)
        fail(
          "STALE",
          "This proposal expired or is no longer awaiting review. Generate a fresh proposal.",
        );
      if (p.sprintId) {
        const sprint = sprintFor(s, p.sprintId, c.actorId);
        if (!isOpenSprint(sprint) || sprint.revision !== p.sprintRevision)
          fail(
            "STALE",
            "The sprint changed. Review a fresh plan before scheduling.",
          );
      }
      if (!c.verifiedCalendar)
        fail(
          "CALENDAR",
          "Fresh calendar availability must be checked before scheduling.",
        );
      const changed = Object.entries(p.taskRevisions).some(([id, revision]) => {
        const task = s.tasks.find((t) => t.id === id);
        return !task || task.revision !== revision || !isSchedulableTask(task);
      });
      if (changed)
        fail(
          "STALE",
          "Tasks changed since this proposal. Generate a fresh proposal.",
        );
      const allocation = p.alternatives[p.selected];
      if (!allocation.sessions.length)
        fail(
          "EMPTY",
          "There are no sessions to schedule. Resolve the missing estimates, owners, or capacity.",
        );
      const owners = [...new Set(allocation.sessions.map((x) => x.assigneeId))];
      for (const owner of owners) {
        actor(s, owner);
        if (
          c.automatic &&
          (actor(s, owner).preferences.reviewRequired ||
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
            ))
        )
          fail(
            "REVIEW_REQUIRED",
            "Review was enabled. This proposal is awaiting approval.",
          );
        const constraints = (prefs: Member["preferences"]) => {
          const { reviewRequired, quietStart, quietEnd, ...rest } = prefs;
          return rest;
        };
        const prior = p.inputs?.preferences[owner];
        if (
          prior &&
          JSON.stringify(constraints(prior)) !==
            JSON.stringify(constraints(actor(s, owner).preferences))
        )
          fail(
            "STALE",
            "Planning preferences changed. Generate a fresh proposal before scheduling.",
          );
      }
      if (c.automatic) p.automatic = true;
      if (!c.automatic) {
        if (!owners.includes(c.actorId))
          fail(
            "FORBIDDEN",
            "Only an affected calendar owner can approve sessions.",
          );
        if (!p.approvedBy.includes(c.actorId)) p.approvedBy.push(c.actorId);
      }
      if (!c.automatic && owners.some((id) => !p.approvedBy.includes(id))) {
        result = "Awaiting approval from other calendar owners";
        break;
      }
      for (const session of allocation.sessions) {
        const cal = s.calendars.find((x) => x.ownerId === session.assigneeId);
        if (
          p.inputs?.calendarDestinations?.[session.assigneeId] &&
          p.inputs.calendarDestinations[session.assigneeId] !==
            cal?.destinationId
        )
          fail(
            "STALE",
            "Calendar selection changed. Generate a fresh proposal before scheduling.",
          );
        if (
          !cal ||
          !["connected", "demo", "native"].includes(cal.status) ||
          !cal.destinationId
        )
          fail(
            "CALENDAR",
            "A calendar owner must reconnect and choose a writable destination.",
          );
        if (
          calendarReservations(s).some(
            (reserved) =>
              reserved.assigneeId === session.assigneeId &&
              reserved.start < session.end &&
              reserved.end > session.start,
          ) ||
          s.busy.some(
            (b) =>
              b.ownerId === session.assigneeId &&
              b.start < session.end &&
              b.end > session.start,
          )
        )
          fail(
            "CONFLICT",
            "A new calendar event conflicts with this proposal. Generate a fresh plan.",
          );
      }
      // A new manual reservation can consume capacity after a preview was made.
      // Recheck the complete batch atomically, including working hours, buffers,
      // dependent tasks, and each owner's shared cross-team focus limit.
      const checked = structuredClone(s);
      if (p.recoveryTarget)
        for (const task of checked.tasks)
          if (p.taskRevisions[task.id] !== undefined)
            task.deadline = p.recoveryTarget;
      for (const session of allocation.sessions) {
        const issues = calendarSessionIssues(
          checked,
          { taskId: session.taskId, start: session.start, end: session.end },
          session.assigneeId,
          c.now,
        );
        if (issues.length)
          fail("CONFLICT", "Review a fresh plan: " + issues[0]);
        (checked.calendarSessions ??= []).push({
          id: "validation:" + session.id,
          taskId: session.taskId,
          assigneeId: session.assigneeId,
          start: session.start,
          end: session.end,
          status: "scheduled",
          revision: 1,
          createdAt: c.now,
          updatedAt: c.now,
          createdBy: c.actorId,
          timezone: actor(s, session.assigneeId).preferences.timezone,
          originalStart: session.start,
          originalEnd: session.end,
          history: [],
        });
      }
      const lineageVersions = s.versions.filter(
        (v) =>
          v.projectId === p.projectId &&
          v.sprintId === p.sprintId &&
          (v.projectId || v.sprintId || v.createdBy === p.createdBy),
      );
      const latest = lineageVersions.sort((a, b) => b.number - a.number)[0];
      if (latest?.id !== p.parentVersionId)
        fail(
          "STALE",
          "Another plan was accepted first. Review a fresh proposal.",
        );
      const versionId = c.id(),
        sessions = allocation.sessions.map((x) => ({
          ...x,
          id: stableId("accepted-session", versionId, x.id),
          updatedAt: c.now,
          status: (s.calendars.find((cal) => cal.ownerId === x.assigneeId)
            ?.destinationId === "kazi"
            ? "scheduled"
            : "pending") as Session["status"],
        }));
      const version: State["versions"][number] = {
        id: versionId,
        lineageId: latest?.lineageId ?? c.id(),
        number: (latest?.number ?? 0) + 1,
        projectId: p.projectId,
        sprintId: p.sprintId,
        parentId: latest?.id,
        proposalId: p.id,
        trigger: p.trigger,
        createdAt: c.now,
        createdBy: c.actorId,
        taskSnapshot: structuredClone(
          s.tasks.filter((t) => p.taskRevisions[t.id] !== undefined),
        ),
        sessions: structuredClone(sessions),
        recoveryTarget: p.recoveryTarget,
        algorithm: allocation.algorithm,
        inputs: p.inputs ? structuredClone(p.inputs) : undefined,
      };
      s.versions.push(version);
      if (p.projectId) {
        const previous = s.iterations
          .filter((i) => i.projectId === p.projectId)
          .at(-1);
        s.iterations.push({
          id: c.id(),
          projectId: p.projectId,
          versionId,
          previousId: previous?.id,
          createdAt: c.now,
        });
      }
      allocation.sessions = sessions;
      p.status = sessions.every((session) => session.status === "scheduled")
        ? "applied"
        : "applying";
      for (const task of version.taskSnapshot) {
        const previous = s.attempts.filter((a) => a.taskId === task.id).at(-1);
        s.attempts.push({
          id: c.id(),
          taskId: task.id,
          versionId,
          previousId: previous?.id,
          remainingMinutes: task.remainingMinutes ?? task.estimatedMinutes ?? 0,
        });
      }
      audit(
        s,
        c,
        `Accepted Plan ${version.number}${latest ? ` · Recovery from Plan ${latest.number}` : ""}`,
        undefined,
        p.projectId,
      );
      result = versionId;
      break;
    }
    case "notification": {
      const n = s.notifications.find(
        (n) => n.id === command.id && n.recipientId === c.actorId,
      );
      if (!n) fail("FORBIDDEN", "This notification is unavailable.");
      if (command.action === "read") n.read = true;
      else n.snoozedUntil = c.now + 24 * 60 * MINUTE;
      break;
    }
    case "invite": {
      if (!manager(s, c.actorId) || s.workspace.kind !== "team")
        fail("FORBIDDEN", "Team owners and managers can invite people.");
      if (command.role === "admin" && me.role !== "owner")
        fail("FORBIDDEN", "Only the team owner can invite a manager.");
      command.projectIds.forEach((id) => projectFor(s, id, c.actorId));
      if (command.role === "guest" && !command.projectIds.length)
        fail("PROJECT_REQUIRED", "Choose at least one project for a guest.");
      if (!c.invitationHash)
        fail("TOKEN", "A secure invitation token is required.");
      const invitation = {
        id: c.id(),
        email: command.email.toLowerCase(),
        role: command.role,
        projectIds: command.projectIds,
        expiresAt: c.now + 7 * 24 * 60 * MINUTE,
        status: "pending" as const,
        tokenHash: c.invitationHash,
      };
      s.invitations.push(invitation);
      result = invitation.id;
      audit(s, c, "Created an invitation");
      break;
    }
    case "revoke_invitation": {
      if (!manager(s, c.actorId))
        fail("FORBIDDEN", "A workspace manager must revoke invitations.");
      const i = s.invitations.find((i) => i.id === command.id);
      if (!i) fail("FORBIDDEN", "Invitation unavailable.");
      i.status = "revoked";
      break;
    }
    case "set_member_role": {
      if (me.role !== "owner" || s.workspace.kind !== "team")
        fail("FORBIDDEN", "Only the team owner can change member roles.");
      const member = actor(s, command.id);
      if (member.role === "owner" || member.id === c.actorId)
        fail("OWNER", "The team owner's role cannot be changed.");
      if (member.role === command.role) break;
      const labels = { admin: "Manager", member: "Member", guest: "Guest" };
      const previous = member.role;
      member.role = command.role;
      audit(
        s,
        c,
        `Changed ${member.name}'s role from ${labels[previous]} to ${labels[command.role]}`,
      );
      result = member.id;
      break;
    }
    case "remove_member": {
      if (!manager(s, c.actorId))
        fail("FORBIDDEN", "A workspace manager must remove members.");
      const member = actor(s, command.id);
      if (member.role === "owner" || member.id === c.actorId)
        fail("OWNER", "The workspace owner cannot be removed.");
      if (member.role === "admin" && me.role !== "owner")
        fail("FORBIDDEN", "Only the owner can remove a manager.");
      s.members = s.members.filter((m) => m.id !== command.id);
      s.projects.forEach((p) => {
        p.memberIds = p.memberIds.filter((id) => id !== command.id);
        if (p.ownerId === command.id) p.ownerId = s.workspace.ownerId;
      });
      s.tasks.forEach((t) => {
        if (t.ownerId === command.id) t.ownerId = s.workspace.ownerId;
        if (t.descriptionMentions?.some((m) => m.memberId === command.id))
          t.descriptionMentions = t.descriptionMentions.filter(
            (m) => m.memberId !== command.id,
          );
        if (t.collaborators.includes(command.id)) {
          t.collaborators = t.collaborators.filter((id) => id !== command.id);
          t.revision++;
          t.updatedAt = c.now;
        }
        if (t.assigneeId === command.id) {
          delete t.assigneeId;
          t.revision++;
          t.updatedAt = c.now;
        }
      });
      audit(s, c, "Removed member and unassigned their open work");
      break;
    }
    case "release_sessions": {
      if (!c.verifiedCalendar)
        fail(
          "CALENDAR",
          "The calendar release workflow must verify these events.",
        );
      const version = s.versions.find((v) => v.id === command.versionId);
      if (!version) fail("FORBIDDEN", "This version is unavailable.");
      if (version.projectId) projectFor(s, version.projectId, c.actorId);
      else if (version.sprintId) sprintFor(s, version.sprintId, c.actorId);
      else if (version.createdBy !== c.actorId)
        fail("FORBIDDEN", "This plan is private.");
      const proposal = s.proposals.find((p) => p.id === version.proposalId);
      if (!proposal)
        fail("STATE", "This plan has no active future reservations.");
      for (const id of command.sessionIds) {
        const session = proposal.alternatives[proposal.selected].sessions.find(
          (s) => s.id === id,
        );
        if (
          !session ||
          session.assigneeId !== c.actorId ||
          session.start <= c.now
        )
          fail(
            "FORBIDDEN",
            "Only your own future focus sessions may be released.",
          );
        session.status = "released";
        session.updatedAt = c.now;
        const overlay = s.calendarSessions?.find(
          (row) => row.id === session.id,
        );
        if (overlay && overlay.status === "scheduled") {
          overlay.status = "released";
          overlay.updatedAt = c.now;
          overlay.revision++;
          overlay.history.push({
            at: c.now,
            actorId: c.actorId,
            action: "released",
            fromStart: overlay.start,
            fromEnd: overlay.end,
          });
        }
      }
      proposal.status = "partial";
      audit(
        s,
        c,
        "Released selected future reservations; original plan snapshot preserved",
        undefined,
        version.projectId,
      );
      break;
    }
  }
  if (command.type === "create_task" || command.type === "update_task")
    for (const sprint of s.sprints ?? [])
      if (
        isOpenSprint(sprint) &&
        sprint.taskIds.some((id) =>
          s.tasks.some((task) => task.parentId === id),
        )
      )
        fail(
          "TASKS",
          "Remove the parent from its sprint before adding subtasks; select the subtasks individually.",
        );
  for (const session of calendarSessions(s)) {
    if (!calendarSessionIsNative(s, session.id)) continue;
    const task = s.tasks.find((task) => task.id === session.taskId),
      project =
        task && s.projects.find((project) => project.id === task.projectId);
    const previousTask = state.tasks.find((task) => task.id === session.taskId),
      previousProject =
        project && state.projects.find((item) => item.id === project.id);
    if (
      task?.status === previousTask?.status &&
      task?.assigneeId === previousTask?.assigneeId &&
      task?.projectId === previousTask?.projectId &&
      project?.archived === previousProject?.archived
    )
      continue;
    if (
      session.status !== "scheduled" ||
      session.start < c.now ||
      (task &&
        isSchedulableTask(task) &&
        task.assigneeId === session.assigneeId &&
        project &&
        !project.archived)
    )
      continue;
    if (!s.calendarSessions?.some((row) => row.id === session.id))
      (s.calendarSessions ??= []).push(session);
    session.status = "released";
    session.updatedAt = c.now;
    session.revision++;
    session.history.push({
      at: c.now,
      actorId: c.actorId,
      action: "released",
      fromStart: session.start,
      fromEnd: session.end,
    });
    if (task) {
      audit(
        s,
        c,
        "Released future focus time after the task changed",
        task.id,
        task.projectId,
      );
      notify(
        s,
        c,
        session.assigneeId,
        `calendar-release:${session.id}:${session.revision}`,
        "Focus time released",
        task.title,
        "system",
        task.id,
      );
    }
  }
  const priorTasks = new Map(state.tasks.map((task) => [task.id, task]));
  const priorProjects = new Map(
    state.projects.map((project) => [project.id, project]),
  );
  for (const entityType of ["task", "project"] as const)
    for (const entity of entityType === "task" ? s.tasks : s.projects) {
      const old =
        entityType === "task"
          ? priorTasks.get(entity.id)
          : priorProjects.get(entity.id);
      const changes = [
        ...new Set([...Object.keys(old ?? {}), ...Object.keys(entity)]),
      ].filter(
        (key) =>
          JSON.stringify((old as any)?.[key]) !==
          JSON.stringify((entity as any)[key]),
      );
      if (!changes.length) continue;
      const task = entityType === "task" ? (entity as Task) : undefined;
      if (task) {
        const priorActivityIds = new Set(
          state.activities.map((event) => event.id),
        );
        const activity = s.activities.find(
          (event) =>
            event.taskId === task.id &&
            event.kind === "change" &&
            !priorActivityIds.has(event.id),
        );
        if (activity) {
          activity.changes = changes.filter(
            (field) =>
              ![
                "updatedAt",
                "revision",
                "lastProgress",
                "statusChangedAt",
              ].includes(field),
          );
          if (!old || old.status !== entity.status) {
            activity.fromStatus = old?.status as Task["status"] | undefined;
            activity.toStatus = task.status;
          }
        }
      }
      (s.lifecycleEvents ??= []).push({
        id: c.id(),
        entityType,
        entityId: entity.id,
        projectId: task?.projectId ?? entity.id,
        actorId: c.actorId,
        assigneeId: task?.assigneeId,
        ownerId: task?.ownerId ?? (entity as Project).ownerId,
        at: c.now,
        revision: task?.revision,
        note: requested.type === "review_task" ? requested.reason : undefined,
        action: requested.type,
        changes,
        ...(!old || old.status !== entity.status
          ? { fromStatus: old?.status, toStatus: entity.status }
          : {}),
      });
    }
  if (requested.type === "comment") {
    const task = taskFor(s, requested.id, c.actorId);
    (s.lifecycleEvents ??= []).push({
      id: c.id(),
      entityType: "task",
      entityId: task.id,
      projectId: task.projectId,
      actorId: c.actorId,
      assigneeId: task.assigneeId,
      ownerId: task.ownerId,
      at: c.now,
      action: "comment",
      note: requested.body,
      changes: ["comment"],
    });
  }
  if ((s.calendarSessions?.length ?? 0) > 1000)
    fail(
      "CALENDAR_LIMIT",
      "This team reached its initial calendar history limit. Export your agenda and contact the team owner before adding more reservations.",
    );
  return { state: s, result };
}

function workingDaysSince(
  start: number,
  end: number,
  zone: string,
  days: number[],
): number {
  let day = addDays(dateInZone(start, zone), 1),
    count = 0;
  const last = dateInZone(end, zone);
  for (let i = 0; i < 366 && day <= last; i++, day = addDays(day, 1)) {
    const weekday = new Date(day + "T12:00:00Z").getUTCDay() || 7;
    if (days.includes(weekday)) count++;
  }
  return count;
}

export function evaluateRisks(state: State, c: Context): State {
  const s = structuredClone(state);
  activateDueSprintBacklogs(s, c);
  for (const task of s.tasks) {
    if (task.status === "backlog") {
      const owner = s.members.find(
        (member) =>
          member.id ===
          (task.ownerId ??
            s.projects.find((p) => p.id === task.projectId)?.ownerId),
      );
      if (owner) {
        const today = dateInZone(c.now, owner.preferences.timezone),
          age = (c.now - (task.statusChangedAt ?? task.createdAt)) / 86400000,
          threshold =
            owner.preferences.agingDays?.backlog ?? defaultAgingDays.backlog;
        if (
          task.brainstorm
            ? !!task.reviewDate && task.reviewDate <= today
            : age >= threshold
        )
          notify(
            s,
            c,
            owner.id,
            `${task.id}:backlog-review:${task.statusChangedAt ?? task.createdAt}:${task.reviewDate ?? threshold}`,
            task.brainstorm
              ? "Brainstorm review is due"
              : "Backlog idea needs a review",
            task.title +
              " — promote it to To do, archive it, or set a To Brainstorm review date.",
            "review",
            task.id,
          );
      }
      continue;
    }
    if (!isCommittedTask(task) || !task.assigneeId) continue;
    const member = s.members.find((m) => m.id === task.assigneeId);
    if (!member) continue;
    const p = s.projects.find((p) => p.id === task.projectId);
    if (!p || p.archived || !canSeeProject(s, p, member.id)) continue;
    const cutoff = deadlineAt(task.deadline, member.preferences.timezone),
      hours = (cutoff - c.now) / (60 * MINUTE);
    const overdue = hours < 0,
      stale =
        workingDaysSince(
          task.lastProgress,
          c.now,
          member.preferences.timezone,
          member.preferences.workingDays,
        ) >= 2;
    if (task.status === "to_validate") {
      const reviewer = s.members.find(
        (person) => person.id === (task.ownerId ?? p.ownerId),
      );
      const threshold = reviewer?.preferences.agingDays?.to_validate ?? 2;
      if (
        reviewer &&
        (overdue ||
          c.now - (task.statusChangedAt ?? task.updatedAt) >=
            threshold * 86400000)
      )
        notify(
          s,
          c,
          reviewer.id,
          `${task.id}:validation:${dateInZone(c.now, reviewer.preferences.timezone)}`,
          "Validation is waiting",
          "Review the finished work: approve to complete, or return to In progress with a reason for the worker.",
          "review",
          task.id,
        );
      continue;
    }
    let shortfall = 0,
      confirmedMinutes: number | undefined;
    const connection = s.calendars.find((cal) => cal.ownerId === member.id);
    if (
      !overdue &&
      Number.isFinite(cutoff) &&
      task.remainingMinutes !== undefined &&
      connection &&
      (connection.status === "demo" ||
        (connection.status === "native" &&
          (!connection.selectedIds.length ||
            (connection.lastSync !== undefined &&
              c.now - connection.lastSync < 5 * MINUTE))) ||
        (connection.status === "connected" &&
          connection.lastSync !== undefined &&
          c.now - connection.lastSync < 5 * MINUTE))
    ) {
      const reservations = calendarReservations(s).filter(
        (session) =>
          session.status === "scheduled" &&
          session.taskId === task.id &&
          session.assigneeId === member.id &&
          session.start >= c.now &&
          session.end <= cutoff,
      );
      const committed = Math.min(
        task.remainingMinutes,
        reservations.reduce((n, s) => n + (s.end - s.start) / MINUTE, 0),
      );
      const available = allocate({
        tasks: [
          { ...task, remainingMinutes: task.remainingMinutes - committed },
        ],
        allTasks: s.tasks,
        busy: s.busy,
        preferences: { [member.id]: member.preferences },
        startDate: dateInZone(c.now, member.preferences.timezone),
        days: member.preferences.horizonDays,
        now: c.now,
      });
      confirmedMinutes = available.scheduledMinutes + committed;
      shortfall = Math.max(0, task.remainingMinutes - confirmedMinutes);
    }
    const kind = overdue
      ? "overdue"
      : hours <= 72 || task.status === "blocked" || shortfall > 0
        ? "capacity"
        : stale
          ? "stale"
          : undefined;
    if (!kind) continue;
    const window = overdue
      ? "initial"
      : kind === "stale"
        ? dateInZone(c.now, member.preferences.timezone)
        : hours <= 24
          ? "24h"
          : "72h";
    notify(
      s,
      c,
      member.id,
      `${task.id}:${kind}:${window}`,
      overdue
        ? `${task.title} needs a new plan`
        : kind === "stale"
          ? `${task.title} is ready for a workflow review`
          : `${task.title} is approaching its deadline`,
      overdue
        ? "The original deadline has passed. Review the task status or a recovery proposal."
        : kind === "stale"
          ? "This task has had no recent status change. Review its status, dependencies, or next step."
          : `Review the task status and upcoming deadline.${shortfall > 0 ? " Available planning capacity may not cover the remaining scope. Consider a recovery proposal." : ""}`,
      kind,
      task.id,
    );
  }
  for (const member of s.members) {
    const day = dateInZone(c.now, member.preferences.timezone);
    const overdue = s.tasks.filter(
      (t) =>
        t.assigneeId === member.id &&
        isCommittedTask(t) &&
        deadlineAt(t.deadline, member.preferences.timezone) < c.now &&
        s.projects.some(
          (p) =>
            p.id === t.projectId &&
            !p.archived &&
            canSeeProject(s, p, member.id),
        ),
    );
    const previousAlert = s.notifications.some(
      (n) =>
        n.recipientId === member.id &&
        n.kind === "overdue" &&
        dateInZone(n.createdAt, member.preferences.timezone) < day,
    );
    if (overdue.length && previousAlert)
      notify(
        s,
        c,
        member.id,
        "overdue-digest:" + day,
        "Overdue task summary",
        `${overdue.length} unfinished ${overdue.length === 1 ? "task has" : "tasks have"} passed the original deadline. Review the task status or a recovery proposal.`,
        "system",
        overdue[0].id,
      );
  }
  // Keep review outcomes after completion, while removing obsolete action alerts.
  s.notifications = s.notifications.filter((n) => {
    if (!s.members.some((m) => m.id === n.recipientId)) return false;
    if (!n.taskId) return true;
    const task = s.tasks.find((t) => t.id === n.taskId);
    if (!task || isArchivedTask(task)) return false;
    if (n.kind === "review") {
      if (n.key.includes(":backlog-review:")) return task.status === "backlog";
      if (n.key.includes(":validation:")) return task.status === "to_validate";
      if (n.key.includes(":review:")) return true;
    }
    return isCommittedTask(task);
  });
  return s;
}
/** Event-driven checkpoints; the cron is a due-index reconciler, not a task poller. */
export function nextRiskEvaluation(s: State, now: number): number {
  const candidates = [now + 86400000];
  for (const sprint of s.sprints ?? [])
    if (
      sprint.status === "active" &&
      sprint.backlogPromotedAt === undefined &&
      now < localInstant(sprint.endDate, 24, sprint.timezone)
    )
      candidates.push(localInstant(sprint.startDate, 0, sprint.timezone));
  for (const member of s.members) {
    const p = member.preferences,
      day = dateInZone(now, p.timezone),
      digest = localInstant(day, p.quietEnd, p.timezone);
    candidates.push(
      digest > now
        ? digest
        : localInstant(addDays(day, 1), p.quietEnd, p.timezone),
    );
    for (const task of s.tasks.filter(
      (t) => t.assigneeId === member.id && isCommittedTask(t),
    )) {
      const cutoff = deadlineAt(task.deadline, p.timezone);
      if (Number.isFinite(cutoff))
        for (const threshold of [
          cutoff - 72 * 3600000,
          cutoff - 24 * 3600000,
          cutoff + 1,
        ])
          if (threshold > now) candidates.push(threshold);
      let date = addDays(dateInZone(task.lastProgress, p.timezone), 1),
        working = 0;
      for (let i = 0; i < 14; i++, date = addDays(date, 1)) {
        if (
          p.workingDays.includes(new Date(date + "T12:00:00Z").getUTCDay() || 7)
        )
          working++;
        if (working === 2) {
          const checkpoint = localInstant(date, p.startHour, p.timezone);
          if (checkpoint > now) candidates.push(checkpoint);
          break;
        }
      }
    }
  }
  for (const project of s.projects.filter((p) => !p.archived && p.deadline)) {
    const zone =
        s.members.find((m) => m.id === project.ownerId)?.preferences.timezone ??
        "UTC",
      cutoff = deadlineAt(project.deadline, zone) + 1;
    if (cutoff > now) candidates.push(cutoff);
  }
  for (const version of s.versions.filter((v) => v.recoveryTarget)) {
    const zone =
        s.members.find((m) => m.id === version.createdBy)?.preferences
          .timezone ?? "UTC",
      cutoff = deadlineAt(version.recoveryTarget, zone) + 1;
    if (cutoff > now) candidates.push(cutoff);
  }
  return Math.max(now + 1000, Math.min(...candidates));
}

export function completeDemoWrites(s: State): State {
  const state = structuredClone(s);
  for (const p of state.proposals.filter((p) => p.status === "applying")) {
    p.alternatives[p.selected].sessions.forEach((x) => {
      x.status = "scheduled";
      x.eventId = "fixture-" + x.id;
    });
    p.status = p.alternatives[p.selected].remainingMinutes
      ? "partial"
      : "applied";
    const key = "demo-receipt:" + p.id;
    if (!state.notifications.some((n) => n.key === key))
      state.notifications.unshift({
        id: stableId("demo-receipt", p.id),
        key,
        recipientId: p.createdBy,
        proposalId: p.id,
        title: p.automatic
          ? "Your recovery plan was scheduled automatically"
          : "Your demo scheduling receipt",
        body: `${p.alternatives[p.selected].sessions.length} focus sessions confirmed in the synthetic calendar. Earlier plans remain preserved.`,
        kind: "system",
        createdAt: Date.now(),
        deliveryAt: Date.now(),
        read: false,
      });
    state.notifications
      .filter((n) => n.proposalId === p.id && n.kind === "review")
      .forEach((n) => (n.read = true));
  }
  return state;
}
