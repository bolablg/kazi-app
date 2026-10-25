import { Link } from "react-router-dom";
import { Clock3 } from "lucide-react";
import { TodayOverview } from "./TodayOverview";
import { type WorkProps } from "./WorkPages";
import {
  WorkViewFilters,
  useWorkViewScope,
  useCurrentMinute,
} from "./WorkViewScope";

export function OverviewPage(props: WorkProps) {
  const scope = useWorkViewScope();
  const now = useCurrentMinute();
  return (
    <div className="page overview-page">
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Your priorities, projects, and recent updates.</p>
        </div>
        <Link className="button secondary" to="/plans?create=true">
          <Clock3 size={16} />
          Create a plan
        </Link>
      </div>
      <div className="overview-view-bar">
        <WorkViewFilters page="Overview" scope={scope} />
      </div>
      <TodayOverview
        {...props}
        person={scope.person}
        project={scope.project}
        now={now}
      />
    </div>
  );
}
