import type { Member, State } from "./model";

export interface TeamState {
  id: string;
  state: State;
}
export function mergeTeamStates(entries: TeamState[], actorId: string): State {
  if (!entries.length) throw new Error("No accessible team.");
  const primary = entries[0].state;
  const members = new Map<string, Member>();
  for (const { state } of entries)
    for (const member of state.members) {
      const prior = members.get(member.id);
      if (!prior) members.set(member.id, structuredClone(member));
      else if (member.id === actorId) {
        prior.favoriteProjectIds = [
          ...new Set([
            ...(prior.favoriteProjectIds ?? []),
            ...(member.favoriteProjectIds ?? []),
          ]),
        ];
        prior.favoriteProjectAt = {
          ...prior.favoriteProjectAt,
          ...member.favoriteProjectAt,
        };
      }
    }
  const resourceTeams: Record<string, string> = {},
    teamMemberships: Record<string, Member[]> = {};
  for (const { id, state } of entries) {
    teamMemberships[id] = state.members;
    for (const sprint of state.sprints ?? []) resourceTeams[sprint.id] = id;
    for (const field of [
      "projects",
      "tasks",
      "proposals",
      "calendarSessions",
      "versions",
      "notifications",
      "invitations",
      "iterations",
      "attempts",
    ] as const)
      for (const entity of state[field] ?? []) resourceTeams[entity.id] = id;
  }
  const collect = <
    K extends
      | "projects"
      | "tasks"
      | "proposals"
      | "versions"
      | "attempts"
      | "iterations"
      | "notifications"
      | "activities"
      | "invitations",
  >(
    key: K,
  ) =>
    entries.reduce(
      (all, { state }) => all.concat(state[key] as unknown[]),
      [] as unknown[],
    ) as State[K];
  return {
    ...primary,
    members: [...members.values()],
    projects: collect("projects"),
    tasks: collect("tasks"),
    sprints: entries.flatMap(({ state }) => state.sprints ?? []),
    proposals: collect("proposals"),
    calendarSessions: entries.flatMap(
      ({ state }) => state.calendarSessions ?? [],
    ),
    versions: collect("versions"),
    attempts: collect("attempts"),
    iterations: collect("iterations"),
    notifications: collect("notifications"),
    activities: collect("activities"),
    artifacts: entries.flatMap(({ state }) => state.artifacts ?? []),
    invitations: collect("invitations"),
    reportEvents: entries.flatMap(({ state }) => state.reportEvents ?? []),
    lifecycleEvents: entries.flatMap(
      ({ state }) => state.lifecycleEvents ?? [],
    ),
    resourceTeams,
    teamMemberships,
    teams: entries.map(({ id, state }) => ({
      ...state.workspace,
      id: id,
      key: state.workspace.id,
      role: state.members.find((m) => m.id === actorId)?.role ?? "guest",
      favoriteAt: state.members.find((m) => m.id === actorId)?.favoriteTeamAt,
    })),
    taskDueAt: Object.assign(
      {},
      ...entries.map(({ state }) => state.taskDueAt ?? {}),
    ),
    busy: [
      ...new Map(
        entries
          .flatMap(({ state }) =>
            state.busy.filter((span) => span.source !== "kazi"),
          )
          .map((span) => [`${span.ownerId}:${span.start}:${span.end}`, span]),
      ).values(),
    ],
    legacyResourceIds: {
      projects: Object.assign(
        {},
        ...entries.map(({ state }) => state.legacyResourceIds?.projects ?? {}),
      ),
      tasks: Object.assign(
        {},
        ...entries.map(({ state }) => state.legacyResourceIds?.tasks ?? {}),
      ),
      plans: Object.assign(
        {},
        ...entries.map(({ state }) => state.legacyResourceIds?.plans ?? {}),
      ),
    },
  };
}
export function resourceRole(
  state: State,
  resourceId: string,
  actorId: string,
) {
  const team = state.resourceTeams?.[resourceId];
  return (team ? state.teamMemberships?.[team] : state.members)?.find(
    (member) => member.id === actorId,
  )?.role;
}
