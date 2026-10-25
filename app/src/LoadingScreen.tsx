/** Identity-free placeholders: private data is never cached for the loading UI. */
export function PageLoading() {
  return (
    <div className="loading-content" aria-hidden="true">
      <div className="loading-bar loading-title" />
      <div className="loading-tiles">
        {[0, 1, 2].map((n) => (
          <div className="loading-tile" key={n}>
            <span className="loading-bar" />
            <span className="loading-bar" />
          </div>
        ))}
      </div>
      <div className="loading-panels">
        {[0, 1].map((n) => (
          <div className="loading-panel" key={n}>
            <div className="loading-bar loading-title" />
            {[0, 1, 2, 3].map((row) => (
              <div className="loading-row" key={row}>
                <span className="loading-dot" />
                <span className="loading-bar" />
              </div>
            ))}
          </div>
        ))}
      </div>
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
      aria-label="Opening Kazi"
      aria-busy="true"
    >
      <div className="loading-brand">
        <span className="loading-mark">k</span>
        <strong>Kazi</strong>
      </div>
      <div className="loading-sidebar" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((n) => (
          <span className="loading-bar" key={n} />
        ))}
      </div>
      <div className="loading-header" aria-hidden="true">
        <span className="loading-bar" />
      </div>
      <PageLoading />
      {!online && (
        <p className="loading-offline">
          You’re offline. Reconnect to load your private data.
        </p>
      )}
    </div>
  );
}
