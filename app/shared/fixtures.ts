import { type State, type Task, type Member, defaults } from "./model";
import {
  addDays,
  dateInZone,
  localInstant,
  deadlineAt,
  MINUTE,
} from "./scheduler";
import { evaluateRisks, execute } from "./domain";
export const DEMO_USER = "demo-you";
import { migrateDemoIds } from "./demoIds";
export function seedState(now = Date.now()): State {
  return migrateDemoIds(fixtureState(now));
}
/** Readable identities are confined to internal test fixture construction. */
export function fixtureState(now = Date.now()): State {
  const day = dateInZone(now, "America/Chicago"),
    yesterday = addDays(day, -1),
    week = addDays(day, 6);
  const members: Member[] = [
    {
      id: DEMO_USER,
      name: "Alex Morgan",
      email: "alex@example.test",
      role: "owner",
      color: "olive",
      preferences: { ...defaults, workingDays: [1, 2, 3, 4, 5, 6] },
    },
    {
      id: "demo-amira",
      name: "Amira Chen",
      email: "amira@example.test",
      role: "member",
      color: "clay",
      preferences: { ...defaults },
    },
    {
      id: "demo-daniel",
      name: "Daniel Okafor",
      email: "daniel@example.test",
      role: "member",
      color: "blue",
      preferences: { ...defaults },
    },
  ];
  const base = {
    description: "",
    collaborators: [],
    loggedMinutes: 0,
    dependencies: [],
    labels: [],
    revision: 1,
    lastProgress: now - 3 * 24 * 60 * MINUTE,
    createdAt: now - 6 * 24 * 60 * MINUTE,
    updatedAt: now - 3 * 24 * 60 * MINUTE,
  };
  const task = (
    id: string,
    title: string,
    projectId: string,
    minutes: number,
    status: Task["status"] = "todo",
    priority: Task["priority"] = "medium",
    deadline = day,
    assigneeId = DEMO_USER,
  ): Task => ({
    ...base,
    id,
    title,
    projectId,
    estimatedMinutes: minutes,
    remainingMinutes: minutes,
    status,
    statusChangedAt: now - 3 * 86400000,
    ...(status === "in_progress" ? { startedAt: now - 3 * 86400000 } : {}),
    milestone: id === "t5" || id === "t11",
    priority,
    deadline,
    assigneeId,
  });
  let s: State = {
    workspace: {
      id: "demo-workspace",
      name: "Kazi",
      kind: "team",
      inboxId: "inbox",
      ownerId: DEMO_USER,
    },
    members,
    projects: [
      {
        id: "inbox",
        title: "Team Inbox",
        description: "Shared capture for the Kazi.",
        ownerId: DEMO_USER,
        memberIds: members.map((m) => m.id),
        color: "olive",
        icon: "inbox",
        private: false,
        archived: false,
      },
      {
        id: "website",
        title: "Website launch",
        description: "Design, build, and launch the new website.",
        ownerId: DEMO_USER,
        memberIds: members.map((m) => m.id),
        color: "olive",
        icon: "globe",
        deadline: yesterday,
        private: false,
        archived: false,
      },
      {
        id: "brand",
        title: "Brand handbook",
        description: "Bring our voice, visuals, and values together.",
        ownerId: "demo-amira",
        memberIds: members.map((m) => m.id),
        color: "clay",
        icon: "pen",
        deadline: week,
        private: false,
        archived: false,
      },
      {
        id: "learning",
        title: "Cloud certification",
        description: "Study plan and practice for the cloud certification.",
        ownerId: DEMO_USER,
        memberIds: [DEMO_USER],
        color: "blue",
        icon: "book",
        deadline: addDays(day, 21),
        private: true,
        archived: false,
      },
    ],
    tasks: [
      task(
        "t1",
        "Refine the homepage direction",
        "website",
        90,
        "in_progress",
        "high",
      ),
      task("t2", "Review the onboarding flow", "website", 60, "todo", "medium"),
      task(
        "t3",
        "Write our brand story",
        "brand",
        120,
        "in_progress",
        "medium",
      ),
      task(
        "t4",
        "Practice networking fundamentals",
        "learning",
        60,
        "todo",
        "low",
      ),
      task(
        "t5",
        "Finalize the component library",
        "website",
        180,
        "todo",
        "high",
        yesterday,
      ),
      task(
        "t6",
        "Review the visual identity",
        "brand",
        45,
        "todo",
        "medium",
        week,
        "demo-amira",
      ),
      task(
        "t7",
        "Test the mobile experience",
        "website",
        90,
        "todo",
        "medium",
        week,
        "demo-daniel",
      ),
      task(
        "t8",
        "Book a dentist appointment",
        "inbox",
        30,
        "todo",
        "low",
        week,
      ),
      task(
        "t9",
        "Collect launch inspiration",
        "website",
        30,
        "done",
        "low",
        yesterday,
      ),
      task(
        "t10",
        "Set up the project workspace",
        "website",
        30,
        "done",
        "low",
        yesterday,
      ),
      task(
        "t11",
        "Define our brand principles",
        "brand",
        60,
        "done",
        "medium",
        yesterday,
      ),
    ],
    proposals: [],
    versions: [],
    attempts: [],
    iterations: [
      {
        id: "iteration-1",
        projectId: "website",
        versionId: "version-1",
        createdAt: now - 5 * 86400000,
      },
    ],
    notifications: [],
    activities: [],
    invitations: [],
    calendars: members.map((m) => ({
      ownerId: m.id,
      status: m.id === DEMO_USER ? "demo" : "disconnected",
      selectedIds: m.id === DEMO_USER ? ["fixture"] : [],
      destinationId: m.id === DEMO_USER ? "fixture" : undefined,
      lastSync: m.id === DEMO_USER ? now : undefined,
    })),
    busy: [
      {
        ownerId: DEMO_USER,
        start: localInstant(day, 12, "America/Chicago"),
        end: localInstant(day, 13, "America/Chicago"),
      },
    ],
  };
  // Explicitly synthetic dated history for the Reports demo. Existing saved
  // demos are left intact; undated user totals are never backfilled.
  s.reportEvents = [];
  for (const [index, taskId, daysAgo, minutes] of [
    [1, "t9", 5, 40],
    [2, "t10", 4, 30],
    [3, "t11", 2, 80],
    [4, "t3", 1, 50],
    [5, "t4", 3, 60],
  ] as const) {
    const t = s.tasks.find((t) => t.id === taskId)!;
    t.loggedMinutes += minutes;
    s.reportEvents.push({
      id: `demo-log-${index}`,
      taskId,
      projectId: t.projectId,
      actorId: DEMO_USER,
      assigneeId: DEMO_USER,
      at: localInstant(addDays(day, -daysAgo), 11, "America/Chicago"),
      type: "time_logged",
      minutes,
      leaf: true,
    });
  }
  for (const [index, taskId, at] of [
    [1, "t9", localInstant(addDays(day, -2), 15, "America/Chicago")],
    [2, "t10", localInstant(yesterday, 10, "America/Chicago")],
    [3, "t11", now - 60 * MINUTE],
  ] as const) {
    const t = s.tasks.find((t) => t.id === taskId)!;
    s.reportEvents.push({
      id: `demo-completion-${index}`,
      taskId,
      projectId: t.projectId,
      actorId: DEMO_USER,
      assigneeId: DEMO_USER,
      at,
      type: "completed",
      minutes: 0,
      taskCreatedAt: t.createdAt,
      startedAt: at - 2 * 3600000,
      dueAt: deadlineAt(t.deadline, "America/Chicago"),
      deadline: t.deadline,
      leaf: true,
    });
  }
  const oldSessions = [
    {
      id: "old-s1",
      taskId: "t9",
      assigneeId: DEMO_USER,
      start: localInstant(yesterday, 9, "America/Chicago"),
      end: localInstant(yesterday, 10, "America/Chicago"),
      status: "scheduled" as const,
      eventId: "fixture-old-s1",
    },
  ];
  s.versions.push({
    id: "version-1",
    lineageId: "website-lineage",
    number: 1,
    projectId: "website",
    proposalId: "initial-proposal",
    trigger: "weekly",
    createdAt: now - 5 * 24 * 60 * MINUTE,
    createdBy: DEMO_USER,
    taskSnapshot: structuredClone(
      s.tasks.filter((t) => t.projectId === "website"),
    ),
    sessions: oldSessions,
    algorithm: "kazi-allocator/1.0",
  });
  let n = 0;
  const ctx = { actorId: DEMO_USER, now, id: () => `seed-${++n}` };
  s = execute(
    s,
    {
      type: "propose",
      projectId: "website",
      startDate: day,
      days: 7,
      trigger: "recovery",
      recoveryTarget: addDays(day, 6),
    },
    ctx,
  ).state;
  s = evaluateRisks(s, ctx);
  s.activities.push({
    id: "welcome",
    actorId: DEMO_USER,
    message: "Created Kazi",
    at: now - 6 * 24 * 60 * MINUTE,
    kind: "change",
  });
  return s;
}
