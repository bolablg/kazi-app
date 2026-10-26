import { LocalDevelopment } from "./LocalDevelopment";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import { DemoProvider } from "./data";
import { AccountRoot } from "./AccountRoot";
import App from "./App";
import { PublicPages } from "./PublicPages";
import {
  centralAccountUrl,
  identityConfig,
  identityPaths,
} from "./identityConfig";
import { IdentityConfigurationError } from "./IdentityScreens";
import "./style.css";
import "./height.css";
import "./workspace.css";
import "./collaboration.css";
import "./task-refinement.css";
import "./typography.css";
import "./theme.css";
import "./today.css";
import "./account-navigation.css";
import "./interface.css";
import "./settings.css";
import "./work-polish.css";
import "./insights-connections.css";
import "./daily-calendar.css";
import "./sprints.css";
import "./identity.css";
import "./privacy.css";
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
const key = identityConfig.publishableKey,
  url = import.meta.env.VITE_CONVEX_URL;
const local =
  import.meta.env.DEV &&
  import.meta.env.VITE_KAZI_LOCAL_DEV === "true" &&
  location.hostname === "127.0.0.1" &&
  /^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? "");
const configured = Boolean(key && url),
  partial = Boolean(key) !== Boolean(url);
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
function PrivateApplication() {
  return local ? (
    <LocalDevelopment url={url} />
  ) : identityConfig.error ? (
    <IdentityConfigurationError />
  ) : partial ? (
    <div className="startup">
      <h1>Finish connecting Kazi.</h1>
      <p>
        Configure both VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY. A partial
        connection cannot open a secure workspace.
      </p>
    </div>
  ) : configured ? (
    <ClerkProvider
      publishableKey={key}
      appearance={{
        variables: {
          fontFamily: '"Atlassian Sans", sans-serif',
          colorPrimary: "#8a3c0c",
          colorForeground: "#111111",
        },
        elements: {
          formButtonPrimary: {
            backgroundColor: "#ff8a32",
            color: "#111111",
            boxShadow: "none",
            "&[data-variant='solid'][data-color='primary']": {
              border: "1px solid #8a3c0c",
              boxShadow: "none",
              "&::after": { background: "none" },
              "&:focus, &:focus-visible, &:focus:not(:focus-visible)": {
                boxShadow: "none",
              },
              "&:focus-visible": {
                outline: "2px solid #8a3c0c",
                outlineOffset: "-3px",
              },
            },
            "&:hover": { backgroundColor: "#f57b24" },
          },
        },
      }}
      signInUrl={
        identityConfig.provider === "central"
          ? centralAccountUrl(identityConfig, location.origin)
          : identityConfig.central
            ? location.origin + identityPaths.legacyLink
            : location.origin
      }
      signUpUrl={
        identityConfig.central
          ? centralAccountUrl(identityConfig, location.origin, true)
          : location.origin
      }
      signInFallbackRedirectUrl={location.origin}
      signUpFallbackRedirectUrl={location.origin}
      allowedRedirectOrigins={
        identityConfig.central
          ? [location.origin, identityConfig.central.accountOrigin]
          : undefined
      }
      allowedRedirectProtocols={
        identityConfig.central
          ? identityConfig.central.accountOrigin.startsWith("http:")
            ? ["https", "http"]
            : ["https"]
          : undefined
      }
    >
      <AccountRoot url={url} config={identityConfig} />
    </ClerkProvider>
  ) : (
    <DemoProvider>
      <App />
    </DemoProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <PublicPages>
          <PrivateApplication />
        </PublicPages>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
