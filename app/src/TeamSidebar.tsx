import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Users,
  UserRound,
} from "lucide-react";
import { useData } from "./data";
import { cx } from "./components";

export function useTeamSelection() {
  const { setTeam } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  return (id: string) => {
    setTeam(id);
    if (/^\/projects?\//.test(location.pathname)) navigate("/projects");
    else if (/^\/tasks?\//.test(location.pathname)) navigate("/tasks");
    else if (location.pathname.startsWith("/plan/")) navigate("/plans");
  };
}

export function TeamSidebar({ onSelect }: { onSelect?: () => void }) {
  const { teams, teamId } = useData();
  const select = useTeamSelection();
  const [open, setOpen] = useState(true);
  const shortcuts = teams.slice(0, 5);
  const selected = teams.find((team) => team.id === teamId);
  if (selected && !shortcuts.some((team) => team.id === selected.id))
    shortcuts.splice(4, 1, selected);
  const choose = (id: string) => {
    select(id);
    onSelect?.();
  };
  return (
    <section className="sidebar-teams" aria-label="Teams">
      <div className="sidebar-project-heading">
        <button
          className="sidebar-favorites-toggle nav-group-label"
          aria-expanded={open}
          aria-controls="team-shortcuts"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={15} className={open ? "" : "collapsed"} />
          Teams
        </button>
      </div>
      <div id="team-shortcuts" hidden={!open}>
        <nav aria-label="Team filters">
          <button
            className={cx("sidebar-team", teamId === "all" && "active")}
            aria-pressed={teamId === "all"}
            onClick={() => choose("all")}
          >
            <Users size={16} />
            <span>All teams</span>
            {teamId === "all" && <Check size={14} />}
          </button>
          {shortcuts.map((team) => (
            <button
              key={team.id}
              className={cx("sidebar-team", teamId === team.id && "active")}
              aria-pressed={teamId === team.id}
              onClick={() => choose(team.id)}
              title={team.kind === "personal" ? "Personal work" : team.name}
            >
              <span
                className="team-shortcut-icon"
                data-personal={team.kind === "personal"}
              >
                {team.kind === "personal" ? (
                  <UserRound size={14} />
                ) : (
                  <Users size={14} />
                )}
              </span>
              <span>{team.kind === "personal" ? "Personal" : team.name}</span>
              {teamId === team.id && <Check size={14} />}
            </button>
          ))}
        </nav>
        {teams.length > 5 && (
          <Link className="sidebar-more" to="/teams" onClick={onSelect}>
            More teams
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
    </section>
  );
}
