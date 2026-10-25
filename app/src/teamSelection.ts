import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "./data";

export function useTeamSelection() {
  const { setTeam } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  return (id: string, destination?: string) => {
    setTeam(id);
    if (destination) navigate(destination);
    else if (/^\/projects?\//.test(location.pathname)) navigate("/projects");
    else if (/^\/tasks?\//.test(location.pathname)) navigate("/tasks");
    else if (location.pathname.startsWith("/plan/")) navigate("/plans");
  };
}
