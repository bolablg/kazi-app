import { LoadingSignal } from "./LoadingSignal";

/** The same brand motion accompanies refresh, account verification, and page loads. */
export function PageLoading() {
  return (
    <div className="loading-content loading-page" aria-hidden="true">
      <LoadingSignal />
      <p className="loading-title">Loading…</p>
    </div>
  );
}

export function LoadingScreen({
  online = navigator.onLine,
}: {
  online?: boolean;
}) {
  return (
    <div
      className="loading-shell"
      role="status"
      aria-label={online ? "Opening Kazi" : "Kazi is offline"}
      aria-busy={online}
      data-offline={!online}
    >
      <div className="loading-content">
        <LoadingSignal />
        <div className="loading-copy">
          <p className="loading-title">
            {online ? "Opening Kazi" : "You’re offline"}
          </p>
          <p className="loading-description">
            {online
              ? "Getting your workspace ready"
              : "Reconnect to load your private data."}
          </p>
        </div>
      </div>
    </div>
  );
}
