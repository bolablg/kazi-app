import { useEffect, useMemo } from "react";
import { SignIn, useAuth } from "@clerk/react";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useLocation } from "react-router-dom";
import { LiveProvider } from "./data";
import App from "./App";
import { LoadingScreen } from "./LoadingScreen";
import { WelcomeLayout } from "./WelcomeLayout";
import { identityApi } from "./identityApi";
import {
  centralAccountUrl,
  identityConfig,
  identityPaths,
  rememberReturn,
} from "./identityConfig";
import type { IdentityConfig } from "./identityConfig";
import {
  AccountIdentityProvider,
  CentralLink,
  CentralSignIn,
  IdentityConfigurationError,
  LegacyLink,
  LegacyLinkSignIn,
  ReturnToKazi,
  UnlinkedAccount,
} from "./IdentityScreens";

const pendingClose = new WeakMap<
  ConvexReactClient,
  ReturnType<typeof setTimeout>
>();
export function AccountRoot({
  url,
  config = identityConfig,
}: {
  url: string;
  config?: IdentityConfig;
}) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const route = useLocation();
  useEffect(() => {
    localStorage.removeItem("kazi.private");
    return () => {
      localStorage.removeItem("kazi.private");
    };
  }, [userId]);
  if (!isLoaded) return <LoadingScreen />;
  if (config.error) return <IdentityConfigurationError />;
  if ((!isSignedIn || !userId) && config.provider === "central")
    return <CentralSignIn config={config} />;
  if ((!isSignedIn || !userId) && route.pathname === identityPaths.legacyLink)
    return <LegacyLinkSignIn config={config} />;
  if (!isSignedIn || !userId)
    return (
      <WelcomeLayout>
        <div className="welcome-clerk-panel">
          <SignIn
            routing="hash"
            withSignUp={!config.central}
            transferable={config.central ? false : undefined}
            signUpUrl={
              config.central
                ? centralAccountUrl(config, location.origin, true)
                : undefined
            }
            appearance={{
              elements: {
                rootBox: { width: "100%" },
                cardBox: { width: "100%", boxShadow: "none", border: "0" },
                card: { boxShadow: "none", border: "0", padding: "0" },
                ...(config.central
                  ? {
                      socialButtons: { display: "none" },
                      dividerRow: { display: "none" },
                      footerAction: { display: "none" },
                    }
                  : {}),
              },
            }}
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
        {config.central && (
          <a
            className="welcome-legacy-create"
            href={centralAccountUrl(config, location.origin, true)}
            onClick={() =>
              rememberReturn(sessionStorage, route.pathname, route.search)
            }
          >
            Create an iYANJU account
          </a>
        )}
      </WelcomeLayout>
    );
  return (
    <ConnectedAccount
      key={userId}
      url={url}
      config={config}
      legacyActorId={userId}
    />
  );
}
function ConnectedAccount({
  url,
  config,
  legacyActorId,
}: {
  url: string;
  config: IdentityConfig;
  legacyActorId: string;
}) {
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
      <VerifiedAccount
        url={url}
        config={config}
        legacyActorId={legacyActorId}
      />
    </ConvexProviderWithClerk>
  );
}
function VerifiedAccount({
  url,
  config,
  legacyActorId,
}: {
  url: string;
  config: IdentityConfig;
  legacyActorId: string;
}) {
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
  // Feature-off compatibility: the released legacy backend has no identity API.
  // Optional migration/shared mode must always resolve the canonical actor server-side.
  if (config.mode === "legacy" && !config.central)
    return (
      <LiveProvider key={legacyActorId} actorId={legacyActorId}>
        <App />
      </LiveProvider>
    );
  return <ResolvedAccount url={url} config={config} />;
}
function ResolvedAccount({
  url,
  config,
}: {
  url: string;
  config: IdentityConfig;
}) {
  const status = useQuery(identityApi.status, {});
  const route = useLocation();
  if (!status) return <LoadingScreen />;
  // Optional central configuration enables a rehearsal while legacy remains
  // the default UI provider. Both rehearsal and shared UI need the dual-issuer
  // backend resolver; the frontend mode never relaxes server identity checks.
  if (status.mode !== "shared" || status.provider !== config.provider)
    return <IdentityConfigurationError />;
  if (route.pathname === identityPaths.legacyLink)
    return <LegacyLink config={config} status={status} url={url} />;
  // Even a ready central account must validate a pending link request. It may
  // belong to a different Kazi account; never silently discard that conflict.
  if (route.pathname === identityPaths.centralLink)
    return (
      <CentralLink
        url={url}
        ready={status.state === "ready" && !!status.actorId}
      />
    );
  if (status.state === "ready" && status.actorId) {
    if (route.pathname === identityPaths.returned) return <ReturnToKazi />;
    return (
      <AccountIdentityProvider value={{ config, status }}>
        <LiveProvider key={status.actorId} actorId={status.actorId}>
          <App />
        </LiveProvider>
      </AccountIdentityProvider>
    );
  }
  if (config.provider !== "central") return <IdentityConfigurationError />;
  return <UnlinkedAccount config={config} url={url} />;
}
