import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { UserProfile } from "@clerk/react";
import {
  AccountSummary,
  accountTheme,
  type AccountState,
} from "@iyanju/account-ui";
import {
  ChevronDown,
  Users,
  Settings,
  Plug,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { AccountIdentityContext, useAccountIdentity } from "./IdentityScreens";
import { identityConfig } from "./identityConfig";
import {
  centralManagementLinks,
  kaziAccountService,
  kaziRole,
} from "./accountAdapter";
import { ClerkAccountMenu, ClerkAccountSummary } from "./ClerkAccountSurface";
import { useData } from "./data";
import type { Member } from "../shared/model";

function localIdentity(me: Member, local: boolean): AccountState {
  return {
    status: "legacy",
    label: local ? "Kazi local development" : "Kazi demo account",
    identity: { name: me.name, email: me.email },
  };
}
const localActionIcons = {
  account: UserRound,
  settings: Settings,
  connections: Plug,
  people: Users,
  privacy: ShieldCheck,
} as const;
/** These modes have no Clerk session. Only service navigation is offered. */
function LocalAccountNavigation({ me, local }: { me: Member; local: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const service = kaziAccountService(me.role, true);
  return (
    <details className="account-menu kazi-local-navigation" ref={menu}>
      <summary aria-label="User menu">
        <AccountSummary state={localIdentity(me, Boolean(local))} compact />
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="account-popover">
        <AccountSummary state={localIdentity(me, Boolean(local))} />
        <div className="kazi-local-role">
          <span>Kazi role</span>
          <strong>{kaziRole(me.role)}</strong>
        </div>
        <nav aria-label="Kazi settings">
          {service.actions.map((action) => {
            const Icon =
              localActionIcons[action.id as keyof typeof localActionIcons] ??
              Settings;
            return (
              <Link
                key={action.id}
                to={action.href!}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {action.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </details>
  );
}
export function AccountMenu() {
  const { state, actorId, demo, local } = useData();
  const identity = useAccountIdentity();
  const me = state.members.find((member) => member.id === actorId)!;
  return (
    <div className="kazi-account-slot">
      {demo || local ? (
        <LocalAccountNavigation me={me} local={Boolean(local)} />
      ) : (
        <ClerkAccountMenu
          config={identity?.config ?? identityConfig}
          service={kaziAccountService(me.role)}
        />
      )}
    </div>
  );
}
function LiveAccountSettings({ role }: { role: string }) {
  const identity = useAccountIdentity();
  const config = identity?.config ?? identityConfig;
  const links = centralManagementLinks(config, location.origin);
  return (
    <section
      className="kazi-account-settings"
      aria-label="Account profile and security"
    >
      <h2>My account</h2>
      <ClerkAccountSummary config={config} />
      {config.provider === "central" ? (
        links ? (
          <div className="kazi-profile-actions">
            <a className="button primary" href={links.profile}>
              Profile &amp; security
            </a>
            <a className="button secondary" href={links.services}>
              Your services
            </a>
          </div>
        ) : (
          <p role="status">
            Account settings are unavailable for this address.
          </p>
        )
      ) : (
        <>
          <AccountIdentityContext />
          <div className="iy-account-theme kazi-legacy-profile">
            <h3>Legacy Kazi profile &amp; security</h3>
            <UserProfile
              routing="hash"
              fallback={<p role="status">Loading your account…</p>}
              appearance={accountTheme}
            />
          </div>
        </>
      )}
      <dl className="account-identity-details">
        <div>
          <dt>Kazi role</dt>
          <dd>{kaziRole(role)}</dd>
        </div>
      </dl>
    </section>
  );
}
export function AccountSettings() {
  const { state, actorId, demo, local } = useData();
  const me = state.members.find((member) => member.id === actorId)!;
  if (!demo && !local) return <LiveAccountSettings role={me.role} />;
  return (
    <div className="settings-form account-settings">
      <section className="settings-section">
        <h2>My account</h2>
        <AccountSummary state={localIdentity(me, Boolean(local))} />
        <dl className="account-identity-details">
          <div>
            <dt>Email</dt>
            <dd>{me.email}</dd>
          </div>
          <div>
            <dt>Kazi role</dt>
            <dd>{kaziRole(me.role)}</dd>
          </div>
        </dl>
        <p className="inline-info">
          {local ? "This local development session" : "This demo"} uses a sample
          account. Profile and security settings are available when you sign in
          to Kazi.
        </p>
      </section>
    </div>
  );
}
