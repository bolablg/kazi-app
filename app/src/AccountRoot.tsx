import { useEffect, useMemo } from "react";
import { SignIn, useAuth } from "@clerk/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { LiveProvider } from "./data";
import App from "./App";
import { LoadingScreen } from "./LoadingScreen";
import { Brand } from "./Brand";

const pendingClose = new WeakMap<
  ConvexReactClient,
  ReturnType<typeof setTimeout>
>();
export function AccountRoot({ url }: { url: string }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    localStorage.removeItem("kazi.private");
    return () => {
      localStorage.removeItem("kazi.private");
    };
  }, [userId]);
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn || !userId)
    return (
      <div className="auth-page">
        <div className="auth-story">
          <span className="wordmark">
            <Brand />
          </span>
          <h1>Welcome to Kazi</h1>
          <p>Manage your tasks, projects, and connected tools.</p>
        </div>
        <SignIn
          routing="hash"
          withSignUp
          fallbackRedirectUrl={location.origin}
          signUpFallbackRedirectUrl={location.origin}
          forceRedirectUrl={
            location.pathname === "/join"
              ? location.origin + location.pathname + location.search
              : undefined
          }
          signUpForceRedirectUrl={
            location.pathname === "/join"
              ? location.origin + location.pathname + location.search
              : undefined
          }
        />
      </div>
    );
  return <ConnectedAccount key={userId} url={url} actorId={userId} />;
}
function ConnectedAccount({ url, actorId }: { url: string; actorId: string }) {
  // Mount only after Clerk loads. Every identity gets a fresh private query cache.
  const client = useMemo(() => new ConvexReactClient(url), [url]);
  useEffect(() => {
    const pending = pendingClose.get(client);
    if (pending) clearTimeout(pending);
    return () => {
      pendingClose.set(
        client,
        setTimeout(() => {
          void client.close();
        }, 0),
      );
    };
  }, [client]);
  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <VerifiedAccount actorId={actorId} />
    </ConvexProviderWithClerk>
  );
}
function VerifiedAccount({ actorId }: { actorId: string }) {
  const auth = useConvexAuth();
  if (auth.isLoading) return <LoadingScreen />;
  if (!auth.isAuthenticated)
    return (
      <div className="startup">
        <h1>Your secure session needs attention.</h1>
        <p>Reconnect to verify access to Kazi.</p>
        <button onClick={() => location.reload()}>Reconnect</button>
      </div>
    );
  return (
    <LiveProvider key={actorId} actorId={actorId}>
      <App />
    </LiveProvider>
  );
}
