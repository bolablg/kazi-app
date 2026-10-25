import { LocalDevelopment } from "./LocalDevelopment";
import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, SignIn, useAuth } from "@clerk/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { DemoProvider, LiveProvider } from "./data";
import App from "./App";
import "./style.css";
import "./height.css";
import "./workspace.css";
import "./collaboration.css";
import "./task-refinement.css";
import "./typography.css";
// A previously installed production worker must never serve stale files in dev.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      const controlled = Boolean(navigator.serviceWorker.controller);
      for (const registration of registrations)
        if (new URL(registration.scope).origin === location.origin)
          await registration.unregister();
      if (controlled && !sessionStorage.getItem("kazi.dev-worker-cleared")) {
        sessionStorage.setItem("kazi.dev-worker-cleared", "1");
        location.reload();
      }
    });
}
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  url = import.meta.env.VITE_CONVEX_URL;
const local =
  import.meta.env.DEV &&
  import.meta.env.VITE_KAZI_LOCAL_DEV === "true" &&
  location.hostname === "127.0.0.1" &&
  /^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "");
const configured = Boolean(key && url),
  partial = Boolean(key) !== Boolean(url);
const pendingClose = new WeakMap<
  ConvexReactClient,
  ReturnType<typeof setTimeout>
>();
function ConnectedRoot() {
  const { userId } = useAuth();
  // A new identity gets a new in-memory query cache, including same-argument queries.
  const client = useMemo(() => new ConvexReactClient(url), [userId]);
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
      <Authenticated />
    </ConvexProviderWithClerk>
  );
}
function Authenticated() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const convexAuth = useConvexAuth();
  useEffect(() => {
    localStorage.removeItem("kazi.private");
    return () => {
      localStorage.removeItem("kazi.private");
    };
  }, [userId]);
  if (!isLoaded)
    return (
      <div className="startup">
        {navigator.onLine
          ? "Loading sign-in…"
          : "You’re offline. Reconnect to sign in and load your private data."}
      </div>
    );
  if (!isSignedIn)
    return (
      <div className="auth-page">
        <div className="auth-story">
          <span className="wordmark">
            <span className="kazi-mark">k</span>
            <strong>Kazi</strong>
          </span>
          <h1>Welcome to Kazi</h1>
          <p>Manage your tasks, projects, and connected tools.</p>
          <p>Sign in or create your account below.</p>
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
  if (!convexAuth.isAuthenticated)
    return (
      <div className="startup">
        <h1>
          {convexAuth.isLoading
            ? "Verifying your session."
            : "Your secure session needs attention."}
        </h1>
        <p>
          {convexAuth.isLoading
            ? "Verifying access to Kazi…"
            : "Check the configured Clerk issuer and Convex integration, then reconnect."}
        </p>
        {!convexAuth.isLoading && (
          <button onClick={() => location.reload()}>Reconnect</button>
        )}
      </div>
    );
  return (
    <LiveProvider key={userId} actorId={userId!}>
      <App />
    </LiveProvider>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="startup">
        <h1>We could not open Kazi.</h1>
        <p role="alert">{this.state.error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {local ? (
          <LocalDevelopment url={url} />
        ) : partial ? (
          <div className="startup">
            <h1>Finish connecting Kazi.</h1>
            <p>
              Configure both VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY. A
              partial connection cannot open a secure workspace.
            </p>
          </div>
        ) : configured ? (
          <ClerkProvider
            publishableKey={key}
            appearance={{
              variables: { fontFamily: '"Atlassian Sans", sans-serif' },
            }}
            signInUrl={location.origin}
            signUpUrl={location.origin}
            signInFallbackRedirectUrl={location.origin}
            signUpFallbackRedirectUrl={location.origin}
          >
            <ConnectedRoot />
          </ClerkProvider>
        ) : (
          <DemoProvider>
            <App />
          </DemoProvider>
        )}
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
