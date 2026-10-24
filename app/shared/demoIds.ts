import type { Allocation, PlanningInputs, Session, State, Task } from "./model";
import { isOpaqueId, stableId } from "./ids";
import { upgradeDefaultProject } from "./workflow";

/** One-way, idempotent upgrade of the synthetic demo only. Never rewrites live history. */
export function migrateDemoIds(source: State): State {
  const s = structuredClone(source),
    scope = source.workspace.id;
  const mappings = new Map<string, string>();
  const tokens = new Map<string, string>();
  const id = (kind: string, value: string): string => {
    if (isOpaqueId(value)) return value;
    const key = `${kind}:${value}`;
    if (!mappings.has(key))
      mappings.set(key, stableId(`legacy-${kind}`, scope, value));
    const result = mappings.get(key)!;
    tokens.set(value, result);
    return result;
  };
  const optional = (kind: string, value?: string) =>
    value === undefined ? undefined : id(kind, value);
  const task = (t: Task): Task => ({
    ...t,
    id: id("task", t.id),
    projectId: id("project", t.projectId),
    parentId: optional("task", t.parentId),
    dependencies: t.dependencies.map((v) => id("task", v)),
  });
  const session = (v: Session): Session => ({
    ...v,
    id: id("session", v.id),
    taskId: id("task", v.taskId),
  });
  const allocation = (a: Allocation): Allocation => ({
    ...a,
    sessions: a.sessions.map(session),
    unscheduled: a.unscheduled.map((v) => ({
      ...v,
      taskId: id("task", v.taskId),
    })),
  });
  const inputs = (p?: PlanningInputs): PlanningInputs | undefined =>
    p ? { ...p, tasks: p.tasks.map(task) } : undefined;
  const aliases = s.legacyResourceIds ?? { projects: {}, tasks: {}, plans: {} };
  for (const [kind, rows, target] of [
    ["project", s.projects, aliases.projects],
    ["task", s.tasks, aliases.tasks],
    ["proposal", s.proposals, aliases.plans],
  ] as const)
    for (const row of rows) {
      const next = id(kind, row.id);
      if (next !== row.id) target[row.id] = next;
    }
  s.workspace = {
    ...s.workspace,
    id: id("workspace", s.workspace.id),
    inboxId: id("project", s.workspace.inboxId),
  };
  s.projects = s.projects.map((p) => ({ ...p, id: id("project", p.id) }));
  s.members = s.members.map((m) => ({
    ...m,
    favoriteProjectIds: m.favoriteProjectIds?.map((value) =>
      id("project", value),
    ),
  }));
  s.tasks = s.tasks.map(task);
  s.proposals = s.proposals.map((p) => ({
    ...p,
    id: id("proposal", p.id),
    projectId: optional("project", p.projectId),
    parentVersionId: optional("version", p.parentVersionId),
    taskRevisions: Object.fromEntries(
      Object.entries(p.taskRevisions).map(([k, v]) => [id("task", k), v]),
    ),
    alternatives: p.alternatives.map(allocation),
    inputs: inputs(p.inputs),
  }));
  s.versions = s.versions.map((v) => ({
    ...v,
    id: id("version", v.id),
    lineageId: id("lineage", v.lineageId),
    projectId: optional("project", v.projectId),
    parentId: optional("version", v.parentId),
    proposalId: id("proposal", v.proposalId),
    taskSnapshot: v.taskSnapshot.map(task),
    sessions: v.sessions.map(session),
    inputs: inputs(v.inputs),
  }));
  s.attempts = s.attempts.map((a) => ({
    ...a,
    id: id("attempt", a.id),
    taskId: id("task", a.taskId),
    versionId: id("version", a.versionId),
    previousId: optional("attempt", a.previousId),
  }));
  s.iterations = (s.iterations ?? []).map((i) => ({
    ...i,
    id: id("iteration", i.id),
    projectId: id("project", i.projectId),
    versionId: id("version", i.versionId),
    previousId: optional("iteration", i.previousId),
  }));
  s.activities = s.activities.map((a) => ({
    ...a,
    id: id("activity", a.id),
    taskId: optional("task", a.taskId),
    projectId: optional("project", a.projectId),
  }));
  s.invitations = s.invitations.map((i) => ({
    ...i,
    id: id("invitation", i.id),
    projectIds: i.projectIds.map((p) => id("project", p)),
  }));
  if (s.reportEvents)
    s.reportEvents = s.reportEvents.map((e) => ({
      ...e,
      id: id("report-event", e.id),
      taskId: id("task", e.taskId),
      projectId: id("project", e.projectId),
    }));
  if (s.taskDueAt)
    s.taskDueAt = Object.fromEntries(
      Object.entries(s.taskDueAt).map(([k, v]) => [id("task", k), v]),
    );
  // Deduplication keys have typed prefixes and colon-delimited IDs; human text
  // (titles, descriptions, comments, labels, reasons) is deliberately untouched.
  s.notifications = s.notifications.map((n) => ({
    ...n,
    id: id("notification", n.id),
    taskId: optional("task", n.taskId),
    proposalId: optional("proposal", n.proposalId),
    key: n.key
      .split(":")
      .map((part) => tokens.get(part) ?? part)
      .join(":"),
  }));
  s.legacyResourceIds = aliases;
  return upgradeDefaultProject(s);
}
