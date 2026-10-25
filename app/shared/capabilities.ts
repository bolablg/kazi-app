import type { Command } from "./model";

export const tokenScopes = [
  "read",
  "tasks:write",
  "projects:write",
  "plans:propose",
  "plans:approve",
  "settings:write",
  "people:manage",
  "connections:manage",
  "agenda:write",
  "credentials:manage",
] as const;
export const scopeLabels: Record<(typeof tokenScopes)[number], string> = {
  read: "Read tasks, projects, reports, and preferences",
  "tasks:write":
    "Create, edit, move, archive, comment, and attach task files or links",
  "projects:write": "Create, edit, deliver, archive, and favorite projects",
  "plans:propose": "Propose plans, select alternatives, and reject previews",
  "plans:approve": "Approve exact plan revisions and release your sessions",
  "settings:write":
    "Change your planning preferences and personal team favorites",
  "people:manage": "Enable collaboration, invite people, and manage access",
  "connections:manage": "Connect or disconnect external calendar availability",
  "agenda:write":
    "Configure Kazi agenda and create or revoke private calendar links",
  "credentials:manage":
    "Manage MCP credentials, limited to this token’s scopes and expiry",
};
export const commandScopes: Record<
  Command["type"],
  (typeof tokenScopes)[number]
> = {
  create_task: "tasks:write",
  update_task: "tasks:write",
  progress: "tasks:write",
  review_task: "tasks:write",
  comment: "tasks:write",
  attach_link: "tasks:write",
  remove_artifact: "tasks:write",
  create_project: "projects:write",
  update_project: "projects:write",
  favorite_project: "projects:write",
  favorite_team: "settings:write",
  preferences: "settings:write",
  propose: "plans:propose",
  select_alternative: "plans:propose",
  reject: "plans:propose",
  approve: "plans:approve",
  release_sessions: "plans:approve",
  notification: "tasks:write",
  invite: "people:manage",
  revoke_invitation: "people:manage",
  remove_member: "people:manage",
  use_kazi_agenda: "agenda:write",
};
