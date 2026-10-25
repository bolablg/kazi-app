import { useCallback, useMemo } from "react";
import {
  ConvexReactClient,
  ConvexProviderWithAuth,
  useConvexAuth,
} from "convex/react";
import { LiveProvider } from "./data";
import App from "./App";
import { LoadingScreen } from "./LoadingScreen";
function useLocalAuth() {
  const fetchAccessToken = useCallback(async () => {
    const response = await fetch("/__kazi_local_session", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Local development session is unavailable. Run npm run dev:local.",
      );
    return (await response.json()).token as string;
  }, []);
  return { isLoading: false, isAuthenticated: true, fetchAccessToken };
}
function LocalSession() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated)
    return (
      <div className="startup">
        <h1>Local Convex needs setup</h1>
        <p>
          Run npm run dev:local to start the development backend and session.
        </p>
      </div>
    );
  return (
    <LiveProvider actorId="local-kazi-owner" local>
      <App />
    </LiveProvider>
  );
}
export function LocalDevelopment({ url }: { url: string }) {
  const client = useMemo(() => new ConvexReactClient(url), [url]);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useLocalAuth}>
      <LocalSession />
    </ConvexProviderWithAuth>
  );
}
