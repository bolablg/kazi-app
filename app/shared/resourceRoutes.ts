import type { State } from "./model";
import { planPath, projectPath, taskPath } from "./ids";

/** Resolve IDs only against the caller's authorized projection, never names. */
export function resourceRoute(state: State, pathname: string, search = "") {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return "";
      }
    });
  const params = new URLSearchParams(search);
  const find = <T extends { id: string }>(
    rows: T[],
    raw?: string,
    aliases?: Record<string, string>,
  ) =>
    rows.find((v) => v.id === raw) ??
    rows.find((v) => !!raw && v.id === aliases?.[raw]);
  const aliases = state.legacyResourceIds;
  const projectFilter = params.get("project");
  const filteredProject = find(
    state.projects,
    projectFilter ?? undefined,
    aliases?.projects,
  );
  if (projectFilter && filteredProject)
    params.set("project", filteredProject.id);
  let path = pathname;
  const projectUrl = ["project", "projects"].includes(parts[0]);
  const taskUrl =
    (projectUrl &&
      parts.length === 4 &&
      ["task", "tasks"].includes(parts[2])) ||
    (["task", "tasks"].includes(parts[0]) && parts.length === 2);
  const planUrl =
    (parts[0] === "plan" && parts.length === 2) ||
    (pathname === "/plans" && params.has("proposal"));
  const project = projectUrl
    ? find(state.projects, parts[1], aliases?.projects)
    : undefined;
  const task = taskUrl
    ? find(state.tasks, projectUrl ? parts[3] : parts[1], aliases?.tasks)
    : undefined;
  const plan = planUrl
    ? find(
        state.proposals,
        parts[0] === "plan" ? parts[1] : (params.get("proposal") ?? undefined),
        aliases?.plans,
      )
    : undefined;
  const kind = taskUrl
    ? "task"
    : planUrl
      ? "plan"
      : projectUrl && parts.length === 2
        ? "project"
        : undefined;
  if (task) path = taskPath(task);
  else if (plan) {
    path = planPath(plan.id);
    params.delete("proposal");
    if (!params.has("revision")) params.set("revision", String(plan.revision));
  } else if (kind === "project" && project) path = projectPath(project.id);
  const next = path + (params.size ? "?" + params.toString() : "");
  const staleRevision =
    !!plan && params.get("revision") !== String(plan.revision);
  return {
    kind,
    task,
    project,
    plan,
    staleRevision,
    redirect: next !== pathname + search ? next : undefined,
  };
}
