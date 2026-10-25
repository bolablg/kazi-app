import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useData } from "./data";
import { Avatar, Empty, Modal, useUI } from "./components";
import { PageTitle, InfoTip } from "./InfoTip";
import { TeamFavoriteButton } from "./Favorites";

export const teamRoleName = (role: string) =>
  (
    ({
      owner: "Owner",
      admin: "Manager",
      member: "Member",
      guest: "Guest",
    }) as Record<string, string>
  )[role] ?? role;
function RoleBadge({ role }: { role: string }) {
  return (
    <span className="team-role" data-role={role}>
      {teamRoleName(role)}
    </span>
  );
}

export function TeamPage({ directory = false }: { directory?: boolean }) {
  const { teamId, teams, setTeam, createTeam, demo } = useData();
  const { run } = useUI();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false),
    [saving, setSaving] = useState(false);
  const sharedTeams = teams.filter((team) => team.kind === "team");
  if (!directory && sharedTeams.some((team) => team.id === teamId))
    return <TeamMembersPage />;
  return (
    <div className="page teams-page">
      <div className="page-heading">
        <PageTitle help="Create a team to work together. As its owner, you can invite people and choose who manages the team. Personal tasks stay separate.">
          Teams & people
        </PageTitle>
        <div className="integration-actions">
          <button
            className="button secondary"
            onClick={() => {
              setTeam("all");
              navigate("/");
            }}
          >
            View all work
          </button>
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Create team
          </button>
        </div>
      </div>
      {sharedTeams.length ? (
        <div className="team-directory">
          {sharedTeams.map((team, index) => (
            <article
              key={team.id}
              className="team-card"
              data-tone={["blue", "coral", "teal", "violet"][index % 4]}
            >
              <div className="team-card-heading">
                <span className="team-emblem">
                  <Users size={24} />
                </span>
                <TeamFavoriteButton team={team} />
              </div>
              <h2>{team.name}</h2>
              <RoleBadge role={team.role} />
              <div className="team-card-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setTeam(team.id);
                    navigate("/team");
                  }}
                >
                  <Users size={15} />
                  People & access
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setTeam(team.id);
                    navigate("/");
                  }}
                >
                  Open work
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="teams-empty">
          <span className="team-emblem">
            <Users size={28} />
          </span>
          <Empty
            title="Your next team starts here"
            body="Create a team, invite people, and bring your projects together."
          />
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Create your first team
          </button>
        </div>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a team"
        description="You’ll be the owner. Invite managers and members once the team is ready."
      >
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const name = String(new FormData(e.currentTarget).get("name"));
              const result = await run(async () => {
                await createTeam(name);
                return true;
              }, "Team created");
              if (result) setCreating(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Team name
            <input
              name="name"
              required
              maxLength={100}
              autoFocus
              placeholder="e.g. Product team"
            />
          </label>
          {demo && (
            <p className="inline-info">
              Team creation is available when you sign in.
            </p>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button className="button primary" disabled={demo || saving}>
              {saving ? "Creating…" : "Create team"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TeamMembersPage() {
  const { state, actorId, dispatch, inviteUrl, demo } = useData(),
    { run } = useUI();
  const [inviteOpen, setInviteOpen] = useState(false),
    [remove, setRemove] = useState<string>(),
    [role, setRole] = useState<"admin" | "member" | "guest">("member"),
    [sending, setSending] = useState(false),
    [changing, setChanging] = useState<string>();
  const me = state.members.find((m) => m.id === actorId)!;
  const owner = me.role === "owner",
    canManage = owner || me.role === "admin";
  const pending = state.invitations.filter(
    (invite) => invite.status === "pending",
  );
  const submitInvite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSending(true);
    try {
      await run(
        () =>
          dispatch({
            type: "invite",
            email: String(form.get("email")),
            role,
            projectIds: form.getAll("project").map(String),
          }),
        "Invitation created",
      );
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="page teams-page team-people-page">
      <Link className="text-button team-back" to="/teams">
        <ArrowLeft size={15} />
        All teams
      </Link>
      <div className="page-heading">
        <div className="team-title">
          <span className="team-emblem">
            <Users size={25} />
          </span>
          <div>
            <h1>People & access</h1>
            <span className="team-page-subtitle">{state.workspace.name}</span>
          </div>
        </div>
        {canManage && (
          <button
            className="button primary"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus size={16} />
            Invite a teammate
          </button>
        )}
      </div>
      <section className="people-section" aria-label="Team members">
        <div className="people-section-heading">
          <h2>
            People <span>{state.members.length}</span>
          </h2>
          <InfoTip label="About team roles">
            The owner manages roles. Managers can manage team projects and
            invite members. Members can work in shared team projects; guests
            need specific project access. Private projects retain their own
            access rules.
          </InfoTip>
        </div>
        <div className="people-list">
          {state.members.map((member) => (
            <div className="person-row" key={member.id}>
              <Avatar name={member.name} color={member.color} />
              <div className="person-identity">
                <strong>
                  {member.name}
                  {member.id === actorId && (
                    <span className="muted"> (you)</span>
                  )}
                </strong>
                <span>
                  {member.username ? `@${member.username} · ` : ""}
                  {member.email}
                </span>
              </div>
              {owner && member.id !== actorId && member.role !== "owner" ? (
                <label className="person-role-control">
                  <select
                    aria-label={`Role for ${member.name}`}
                    data-role={member.role}
                    value={member.role}
                    disabled={changing === member.id}
                    onChange={async (e) => {
                      const next = e.target.value as
                        "admin" | "member" | "guest";
                      setChanging(member.id);
                      try {
                        await run(
                          () =>
                            dispatch({
                              type: "set_member_role",
                              id: member.id,
                              role: next,
                            }),
                          `${member.name} is now a ${teamRoleName(next).toLowerCase()}`,
                        );
                      } finally {
                        setChanging(undefined);
                      }
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Manager</option>
                    <option value="guest">Guest</option>
                  </select>
                </label>
              ) : (
                <RoleBadge role={member.role} />
              )}
              <div className="person-actions">
                {canManage &&
                  member.id !== actorId &&
                  member.role !== "owner" &&
                  (owner || member.role !== "admin") && (
                    <button
                      className="icon-button danger-text"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setRemove(member.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
      </section>
      {canManage && (
        <section
          className="people-section invitations-section"
          aria-label="Pending invitations"
        >
          <div className="people-section-heading">
            <h2>
              Invitations <span>{pending.length}</span>
            </h2>
            <InfoTip label="About invitations">
              Invitations expire after seven days and can only be accepted by
              the invited verified email address. Email delivery is optional;
              you can also share the private signup link.
            </InfoTip>
          </div>
          {pending.length ? (
            <div className="people-list">
              {pending.map((invite) => (
                <div className="person-row invitation-row" key={invite.id}>
                  <span className="invite-avatar">
                    <Mail size={19} />
                  </span>
                  <div className="person-identity">
                    <strong>{invite.email}</strong>
                    <span>
                      {invite.deliveryStatus === "sent"
                        ? "Email sent"
                        : invite.deliveryStatus === "queued"
                          ? "Sending email"
                          : invite.deliveryStatus === "failed"
                            ? "Email failed · share the invitation link"
                            : "Awaiting acceptance"}{" "}
                      · Expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  </div>
                  <RoleBadge role={invite.role} />
                  <div className="person-actions">
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        run(
                          () =>
                            dispatch({
                              type: "revoke_invitation",
                              id: invite.id,
                            }),
                          "Invitation revoked",
                        )
                      }
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="invitations-empty">
              <Mail size={20} />
              <span>No pending invitations</span>
            </div>
          )}
        </section>
      )}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a teammate"
        description={`Add someone to ${state.workspace.name}.`}
      >
        <form className="form" onSubmit={submitInvite}>
          <label>
            Teammate’s email
            <input
              name="email"
              type="email"
              required
              placeholder="name@example.com"
            />
          </label>
          <label>
            Role
            <select
              name="role"
              aria-label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="member">Member</option>
              {owner && <option value="admin">Manager</option>}
              <option value="guest">Guest</option>
            </select>
          </label>
          {role === "guest" ? (
            <fieldset className="invite-project-access">
              <legend>Project access</legend>
              {state.projects.map((project) => (
                <label className="check-label" key={project.id}>
                  <input name="project" type="checkbox" value={project.id} />
                  {project.title}
                </label>
              ))}
            </fieldset>
          ) : (
            state.projects.some((project) => project.private) && (
              <details className="invite-project-access">
                <summary>Private project access</summary>
                <p>Shared team projects are included.</p>
                {state.projects
                  .filter((project) => project.private)
                  .map((project) => (
                    <label className="check-label" key={project.id}>
                      <input
                        name="project"
                        type="checkbox"
                        value={project.id}
                      />
                      {project.title}
                    </label>
                  ))}
              </details>
            )
          )}
          {inviteUrl && (
            <div className="invitation-link">
              <span>
                {demo ? "Demo invitation" : "Share this invitation link"}
              </span>
              <input aria-label="Invitation link" readOnly value={inviteUrl} />
              {!demo && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    run(
                      () => navigator.clipboard.writeText(inviteUrl),
                      "Link copied",
                    )
                  }
                >
                  <Copy size={14} />
                  Copy link
                </button>
              )}
            </div>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() => setInviteOpen(false)}
            >
              Done
            </button>
            <button className="button primary" disabled={sending}>
              {sending ? "Inviting…" : "Invite teammate"}
              <ArrowUpRight size={15} />
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(undefined)}
        title="Remove this teammate?"
        description="They will lose access to this team. Task history stays intact."
      >
        <p className="modal-prose">Their open tasks become unassigned.</p>
        <div className="modal-footer">
          <button
            className="button secondary"
            onClick={() => setRemove(undefined)}
          >
            Keep teammate
          </button>
          <button
            className="button danger"
            onClick={async () => {
              const result = await run(async () => {
                await dispatch({ type: "remove_member", id: remove! });
                return true;
              }, "Access revoked; task history preserved");
              if (result) setRemove(undefined);
            }}
          >
            Remove teammate
          </button>
        </div>
      </Modal>
    </div>
  );
}
