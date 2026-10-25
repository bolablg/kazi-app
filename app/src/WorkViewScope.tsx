import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "./data";

export function useCurrentMinute() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return now;
}

export function useWorkViewScope() {
  const { state, actorId } = useData();
  const [params, setParams] = useSearchParams();
  const projectFilter = params.get("project");
  const personFilter = params.get("person") ?? actorId;
  const project = state.projects.some(
    (item) => item.id === projectFilter && !item.archived,
  )
    ? projectFilter!
    : "all";
  const person =
    personFilter === "all" ||
    state.members.some((member) => member.id === personFilter)
      ? personFilter
      : actorId;
  const select = (key: "person" | "project", value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    });
  return { person, project, select };
}

export function WorkViewFilters({
  page,
  scope,
}: {
  page: "Overview" | "Calendar";
  scope: ReturnType<typeof useWorkViewScope>;
}) {
  const { state, actorId } = useData();
  return (
    <div className="overview-filters">
      <select
        aria-label={`${page} assignee`}
        value={scope.person}
        onChange={(event) => scope.select("person", event.target.value)}
      >
        <option value={actorId}>
          {page === "Overview" ? "My work" : "Assigned to me"}
        </option>
        <option value="all">Everyone</option>
        {state.members
          .filter((member) => member.id !== actorId)
          .map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
      </select>
      <select
        aria-label={`${page} project`}
        value={scope.project}
        onChange={(event) => scope.select("project", event.target.value)}
      >
        <option value="all">All projects</option>
        {state.projects
          .filter((project) => !project.archived)
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
      </select>
    </div>
  );
}
