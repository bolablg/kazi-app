import { Link } from "react-router-dom";
import { PageTitle } from "./InfoTip";
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
          <PageTitle help="Your daily priorities, work ready to start, projects, and recent task activity. Use the person and project filters to focus this dashboard.">
            Overview
          </PageTitle>
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
