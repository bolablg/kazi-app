import type { State, Project } from "./model";
import { canSeeProject } from "./domain";

export type FavoriteItem = {
  id: string;
  name: string;
  at: number;
  teamId: string;
} & ({ kind: "project"; project: Project } | { kind: "team" });

export function favoriteItems(state: State, actorId: string): FavoriteItem[] {
  const me = state.members.find((member) => member.id === actorId);
  if (!me) return [];
  const items: FavoriteItem[] = state.projects.flatMap((project) => {
    const teamId = state.resourceTeams?.[project.id] ?? state.workspace.id;
    const members = state.teamMemberships?.[teamId] ?? state.members;
    const member = members.find((m) => m.id === actorId);
    if (
      project.archived ||
      !member?.favoriteProjectIds?.includes(project.id) ||
      !canSeeProject({ ...state, members }, project, actorId)
    )
      return [];
    return [
      {
        id: project.id,
        name: project.title,
        kind: "project" as const,
        teamId,
        project,
        at: member.favoriteProjectAt?.[project.id] ?? 0,
      },
    ];
  });
  for (const team of state.teams ?? [
    { ...state.workspace, favoriteAt: me.favoriteTeamAt },
  ])
    if (team.kind === "team" && team.favoriteAt !== undefined)
      items.push({
        kind: "team",
        id: team.id,
        teamId: team.id,
        name: team.name,
        at: team.favoriteAt,
      });
  return items.sort(
    (a, b) =>
      b.at - a.at ||
      a.name.localeCompare(b.name) ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
}
