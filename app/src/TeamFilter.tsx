import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "./data";
export function TeamFilter() {
  const { teams, teamId, setTeam } = useData();
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <label className="team-filter">
      Team
      <select
        aria-label="Filter by team"
        value={teamId}
        onChange={(e) => {
          setTeam(e.target.value);
          if (location.pathname.startsWith("/project")) navigate("/projects");
          else if (location.pathname.includes("/task/")) navigate("/tasks");
          else if (location.pathname.startsWith("/plan/")) navigate("/plans");
        }}
      >
        <option value="all">All teams</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.kind === "personal" ? "Personal" : team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
