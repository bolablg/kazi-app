import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { LifecycleEvent } from "../shared/model";
import { statusLabels } from "../shared/model";
import { useData } from "./data";
export function TaskHistory({ taskId }: { taskId: string }) {
  const { demo, state } = useData();
  return demo ? (
    <HistoryRows
      events={(state.lifecycleEvents ?? []).filter(
        (event) => event.entityId === taskId,
      )}
    />
  ) : (
    <LiveHistory taskId={taskId} />
  );
}
function LiveHistory({ taskId }: { taskId: string }) {
  const { state, workspaceId } = useData(),
    team = (state.resourceTeams?.[taskId] ?? workspaceId) as Id<"workspaces">;
  const { results, status, loadMore } = usePaginatedQuery(
    api.reports.lifecycle,
    { workspaceId: team, entityId: taskId },
    { initialNumItems: 50 },
  );
  return (
    <>
      <HistoryRows events={results} />
      {status === "CanLoadMore" && (
        <button className="text-button" onClick={() => loadMore(50)}>
          Load more history
        </button>
      )}
    </>
  );
}
function HistoryRows({ events }: { events: LifecycleEvent[] }) {
  const { state } = useData();
  return (
    <section className="detail-section task-history">
      <h3>Timestamped history</h3>
      {events.length ? (
        <ol>
          {[...events]
            .sort(
              (a, b) => b.at - a.at || (b.revision ?? 0) - (a.revision ?? 0),
            )
            .map((event) => (
              <li key={event.id}>
                <div>
                  <strong>
                    {event.toStatus
                      ? `${event.fromStatus ? (statusLabels[event.fromStatus as keyof typeof statusLabels] ?? event.fromStatus) + " → " : ""}${statusLabels[event.toStatus as keyof typeof statusLabels] ?? event.toStatus}`
                      : event.action.replaceAll("_", " ")}
                  </strong>
                  <time dateTime={new Date(event.at).toISOString()}>
                    {new Date(event.at).toLocaleString()}
                  </time>
                </div>
                <small>
                  {state.members.find((member) => member.id === event.actorId)
                    ?.name ?? "Former teammate"}{" "}
                  ·{" "}
                  {event.changes
                    .filter(
                      (field) =>
                        ![
                          "updatedAt",
                          "revision",
                          "lastProgress",
                          "statusChangedAt",
                        ].includes(field),
                    )
                    .join(", ")}
                </small>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
        </ol>
      ) : (
        <p>
          New task and status changes will appear here. Earlier history is not
          reconstructed.
        </p>
      )}
    </section>
  );
}
