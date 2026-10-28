import {
  Component,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { SignIn, useUser } from "@clerk/react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Link2 } from "lucide-react";
import { Brand } from "./Brand";
import { BrandAttribution } from "./BrandAttribution";
import { LoadingScreen } from "./LoadingScreen";
import { WelcomeLayout } from "./WelcomeLayout";
import { AccountSummary } from "@iyanju/account-ui";
import { ClerkAccountSummary, ClerkSignOut } from "./ClerkAccountSurface";
import { centralManagementLinks, clerkIdentity } from "./accountAdapter";
import { identityApi } from "./identityApi";
import type { IdentityStatus } from "./identityApi";
import {
  centralAccountUrl,
  clearPendingLink,
  consumeReturn,
  identityPaths,
  readPendingLink,
  rememberReturn,
  savePendingLink,
} from "./identityConfig";
import type { IdentityConfig, PendingIdentityLink } from "./identityConfig";
import { identityErrorMessage, useIdentityRequest } from "./identityTransport";

const AccountIdentity = createContext<{
  config: IdentityConfig;
  status: IdentityStatus;
} | null>(null);
export const AccountIdentityProvider = AccountIdentity.Provider;
export function useAccountIdentity() {
  return useContext(AccountIdentity);
}

export function IdentityFrame({ children }: { children: ReactNode }) {
  return (
    <main className="identity-page">
      <section className="identity-panel">
        <span className="wordmark">
          <Brand />
        </span>
        {children}
        <a className="identity-privacy-link" href="/privacy">
          Privacy policy
        </a>
      </section>
      <BrandAttribution />
    </main>
  );
}
export function IdentityConfigurationError({
  account,
}: {
  account?: ReactNode;
}) {
  return (
    <IdentityFrame>
      <h1>The account connection needs attention</h1>
      <p role="alert">
        Kazi cannot safely open this account with its current configuration.
      </p>
      {account}
      <div className="identity-actions">
        <button className="button secondary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </IdentityFrame>
  );
}

export function CentralSignIn({ config }: { config: IdentityConfig }) {
  const callback =
    location.pathname === identityPaths.centralLink
      ? identityPaths.centralLink
      : identityPaths.returned;
  const prepare = () =>
    rememberReturn(sessionStorage, location.pathname, location.search);
  return (
    <WelcomeLayout>
      <h1>Welcome to Kazi</h1>
      <p className="welcome-intro">Continue with your iYANJU account.</p>
      <div className="identity-actions">
        <a
          className="button primary"
          href={centralAccountUrl(config, location.origin, false, callback)}
          onClick={prepare}
        >
          Sign in <ArrowRight size={16} aria-hidden="true" />
        </a>
        <a
          className="button secondary"
          href={centralAccountUrl(config, location.origin, true, callback)}
          onClick={prepare}
        >
          Create account
        </a>
      </div>
    </WelcomeLayout>
  );
}

export function LegacyLinkSignIn({ config }: { config: IdentityConfig }) {
  return (
    <IdentityFrame>
      <h1>Sign in to your existing Kazi account</h1>
      <p>This confirms which Kazi tasks and projects to keep.</p>
      <SignIn
        routing="hash"
        withSignUp={false}
        transferable={false}
        signUpUrl={centralAccountUrl(config, location.origin, true)}
        forceRedirectUrl={location.origin + identityPaths.legacyLink}
        appearance={{
          elements: {
            socialButtons: { display: "none" },
            dividerRow: { display: "none" },
            footerAction: { display: "none" },
            card: { boxShadow: "none", border: "0", padding: "0" },
            cardBox: { boxShadow: "none", width: "100%" },
            rootBox: { width: "100%" },
          },
        }}
      />
    </IdentityFrame>
  );
}

function ProviderSwitch({
  children,
  target,
}: {
  children: ReactNode;
  target: string;
}) {
  return (
    <a className="button secondary" href={target}>
      {children}
    </a>
  );
}
function RestartLink() {
  return (
    <ProviderSwitch target={identityPaths.legacyLink}>
      Start again
    </ProviderSwitch>
  );
}
function SwitchAccount() {
  return (
    <ClerkSignOut redirectUrl={location.origin + identityPaths.legacyLink} />
  );
}

export function LegacyLink({
  config,
  status,
  url,
}: {
  config: IdentityConfig;
  status: IdentityStatus;
  url: string;
}) {
  const begin = useIdentityRequest(url, "action", identityApi.beginLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user } = useUser();
  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await begin({});
      if (!result || !("id" in result))
        throw new Error("Verification was not completed.");
      savePendingLink(sessionStorage, result);
      location.assign(identityPaths.centralLink);
    } catch (cause) {
      setError(identityErrorMessage(cause));
      setBusy(false);
    }
  };
  if (!status.canLinkLegacy || status.hasCentralIdentity)
    return (
      <IdentityFrame>
        <h1>
          {status.hasCentralIdentity
            ? "This Kazi account is already linked"
            : "An existing Kazi account is required"}
        </h1>
        <p>
          {status.hasCentralIdentity
            ? "Continue with your iYANJU account to open your tasks and projects."
            : "Sign in with the email you previously used for Kazi."}
        </p>
        <div className="identity-actions">
          {status.hasCentralIdentity ? (
            <ProviderSwitch target={identityPaths.returned}>
              Continue to iYANJU
            </ProviderSwitch>
          ) : (
            <SwitchAccount />
          )}
          <a
            className="button secondary"
            href={centralAccountUrl(config, location.origin, true)}
          >
            Create an iYANJU account
          </a>
        </div>
      </IdentityFrame>
    );
  return (
    <IdentityFrame>
      <h1>Keep your Kazi work</h1>
      <p>
        Next, sign in with iYANJU. You’ll confirm both accounts before they are
        linked.
      </p>
      <div className="identity-link-account">
        <AccountSummary
          state={{
            status: "legacy",
            label: "Existing Kazi account",
            identity: clerkIdentity(user ?? {}),
          }}
        />
      </div>
      {error && (
        <p className="identity-error" role="alert">
          {error}
        </p>
      )}
      <div className="identity-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void start()}
        >
          {busy ? "Verifying…" : "Continue with iYANJU"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <SwitchAccount />
      </div>
    </IdentityFrame>
  );
}

export function ReturnToKazi() {
  const navigate = useNavigate();
  useEffect(() => {
    clearPendingLink(sessionStorage);
    navigate(consumeReturn(sessionStorage), { replace: true });
  }, [navigate]);
  return <LoadingScreen />;
}

export function UnlinkedAccount({
  config,
  url,
}: {
  config: IdentityConfig;
  url: string;
}) {
  const create = useIdentityRequest(
    url,
    "mutation",
    identityApi.startNewAccount,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startNew = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await create({});
      if (!result || !("actorId" in result))
        throw new Error("Verification was not completed.");
      clearPendingLink(sessionStorage);
      // The reactive status query opens this account only after the server's
      // canonical identity is visible; no optimistic empty workspace bootstrap.
    } catch (cause) {
      setError(identityErrorMessage(cause));
      setBusy(false);
    }
  };
  const preserve = () => {
    rememberReturn(sessionStorage, location.pathname, location.search);
    clearPendingLink(sessionStorage);
  };
  return (
    <WelcomeLayout>
      <h1>Welcome to Kazi</h1>
      <p className="welcome-intro">
        Already use Kazi? Link your existing account to keep your tasks and
        projects.
      </p>
      {error && (
        <p className="identity-error" role="alert">
          {error}
        </p>
      )}
      <div className="identity-actions">
        <a
          className="button primary"
          href={identityPaths.legacyLink}
          onClick={preserve}
        >
          <Link2 size={16} aria-hidden="true" />
          Link existing Kazi account
        </a>
        {config.mode === "shared" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void startNew()}
          >
            {busy ? "Opening…" : "Start a new personal workspace"}
          </button>
        )}
      </div>
    </WelcomeLayout>
  );
}

class LinkPreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <IdentityFrame>
        <h1>Start account linking again</h1>
        <p>
          This request has expired, was already used, or is unavailable for this
          account.
        </p>
        <div className="identity-actions">
          <RestartLink />
        </div>
      </IdentityFrame>
    ) : (
      this.props.children
    );
  }
}
export function CentralLink({ url, ready }: { url: string; ready: boolean }) {
  const [proof] = useState(() => readPendingLink(sessionStorage));
  if (!proof)
    return (
      <IdentityFrame>
        <h1>Start account linking again</h1>
        <p>For your security, linking must finish in the same browser tab.</p>
        <div className="identity-actions">
          <RestartLink />
        </div>
      </IdentityFrame>
    );
  return (
    <LinkPreviewBoundary>
      <ConfirmLink url={url} proof={proof} ready={ready} />
    </LinkPreviewBoundary>
  );
}
function ConfirmLink({
  url,
  proof,
  ready,
}: {
  url: string;
  proof: PendingIdentityLink;
  ready: boolean;
}) {
  const preview = useQuery(identityApi.linkPreview, {
    id: proof.id,
    secret: proof.secret,
  });
  const complete = useIdentityRequest(
    url,
    "mutation",
    identityApi.completeLink,
  );
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(proof.expiresAt <= Date.now());
  useEffect(() => {
    const timer = setTimeout(
      () => {
        clearPendingLink(sessionStorage);
        setExpired(true);
      },
      Math.max(0, proof.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proof.expiresAt]);
  if (expired)
    return (
      <IdentityFrame>
        <h1>This link request has expired</h1>
        <div className="identity-actions">
          <RestartLink />
        </div>
      </IdentityFrame>
    );
  if (!preview || !user) return <LoadingScreen />;
  if (preview.completed) return ready ? <ReturnToKazi /> : <LoadingScreen />;
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await complete({ id: proof.id, secret: proof.secret });
      if (!result || !("actorId" in result))
        throw new Error("Verification was not completed.");
      // Keep the proof until the authoritative preview reports completion and
      // identity.status is ready, including a successful request with a lost response.
    } catch (cause) {
      setError(identityErrorMessage(cause));
      setBusy(false);
    }
  };
  return (
    <IdentityFrame>
      <h1>Link these accounts?</h1>
      <p>Your existing Kazi tasks, projects, and team access stay together.</p>
      <div className="identity-link-accounts">
        <div className="identity-link-account">
          <AccountSummary
            state={{
              status: "legacy",
              label: "Existing Kazi account",
              identity: preview.legacyDisplay,
            }}
          />
        </div>
        <div className="identity-link-account">
          <AccountSummary
            state={{ status: "signed-in", identity: clerkIdentity(user) }}
          />
        </div>
      </div>
      {error && (
        <p className="identity-error" role="alert">
          {error}
        </p>
      )}
      <div className="identity-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Linking…" : "Link accounts"}
        </button>
        <a
          className="button secondary"
          href="/"
          onClick={() => clearPendingLink(sessionStorage)}
        >
          Cancel
        </a>
      </div>
    </IdentityFrame>
  );
}

export function AccountIdentityContext() {
  const identity = useContext(AccountIdentity);
  if (!identity?.config.central) return null;
  const { config, status } = identity;
  const links = centralManagementLinks(config, location.origin);
  const preserve = () =>
    rememberReturn(sessionStorage, "/settings", "?tab=account");
  if (config.provider === "central")
    return (
      <aside className="identity-account-context">
        <ClerkAccountSummary config={config} />
        {links && <a href={links.profile}>Profile &amp; security</a>}
      </aside>
    );
  if (status.hasCentralIdentity) return null;
  return (
    <aside className="identity-account-context">
      <p>Use one iYANJU account across your apps.</p>
      <a href={identityPaths.legacyLink} onClick={preserve}>
        Link your iYANJU account
      </a>
    </aside>
  );
}
