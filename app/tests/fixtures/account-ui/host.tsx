import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useLocation } from "react-router-dom";
import { AccountMenu, AccountSettings } from "../../../src/AccountPages";
import { AccountIdentityProvider } from "../../../src/IdentityScreens";
import { resolveIdentityConfig } from "../../../src/identityConfig";
import { Brand } from "../../../src/Brand";
import { FixtureIdentity, scenario, useUser } from "./identity-fixture";
import "../../../src/style.css";
import "../../../src/height.css";
import "../../../src/workspace.css";
import "../../../src/collaboration.css";
import "../../../src/task-refinement.css";
import "../../../src/typography.css";
import "../../../src/theme.css";
import "../../../src/today.css";
import "../../../src/account-navigation.css";
import "../../../src/interface.css";
import "../../../src/settings.css";
import "../../../src/work-polish.css";
import "../../../src/insights-connections.css";
import "../../../src/daily-calendar.css";
import "../../../src/sprints.css";
import "../../../src/identity.css";
import "../../../src/privacy.css";
import "@iyanju/account-ui/styles.css";
import "./host.css";
const config = resolveIdentityConfig(
  {
    VITE_KAZI_IDENTITY_MODE: scenario === "legacy" ? "legacy" : "shared",
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_legacy",
    VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_test_central",
    VITE_IYANJU_ACCOUNT_ORIGIN: "http://127.0.0.1:49569",
  },
  "/",
);
const status = {
  mode: "shared",
  provider: config.provider,
  state: "ready",
  actorId: "local-actor",
  canLinkLegacy: config.provider === "legacy",
  hasCentralIdentity: config.provider === "central",
  activation: null,
  accountCreatedAt: null,
} as const;
function Host() {
  const route = useLocation();
  const session = useUser();
  return (
    <AccountIdentityProvider value={{ config, status }}>
      <div className="app-shell">
        <aside className="sidebar mobile-open account-fixture-sidebar">
          <Link className="wordmark" to="/" aria-label="Kazi home">
            <Brand />
          </Link>
          <div className="sidebar-scroll">
            <p>Kazi navigation</p>
          </div>
          <AccountMenu />
        </aside>
        <div className="main-area">
          <main className="main-scroll">
            <div className="page account-fixture-main">
              <h1>Account UI integration preview</h1>
              <p>Synthetic identities only</p>
              <span data-testid="current-route">
                {route.pathname + route.search}
              </span>
              <p className="host-font-probe">Kazi typography</p>
              {(scenario === "demo" ||
                scenario === "local" ||
                (session.isLoaded && session.isSignedIn && session.user)) && (
                <AccountSettings />
              )}
            </div>
          </main>
        </div>
      </div>
    </AccountIdentityProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <FixtureIdentity>
      <Host />
    </FixtureIdentity>
  </BrowserRouter>,
);
