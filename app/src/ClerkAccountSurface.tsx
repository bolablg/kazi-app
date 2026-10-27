import { useClerk, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import {
  AccountMenu,
  AccountSummary,
  AccountSignOutButton,
  type AccountService,
} from "@iyanju/account-ui";
import { accountLinks, clerkAccountState } from "./accountAdapter";
import { prepareIdentitySignOut, type IdentityConfig } from "./identityConfig";

export function useClerkAccountState(config: IdentityConfig) {
  const session = useUser();
  return clerkAccountState(config, location.origin, {
    isLoaded: Boolean(session.isLoaded),
    isSignedIn: session.isSignedIn,
    user: session.user,
  });
}
export function ClerkAccountSummary({ config }: { config: IdentityConfig }) {
  return <AccountSummary state={useClerkAccountState(config)} />;
}
export function ClerkAccountMenu({
  config,
  service,
}: {
  config: IdentityConfig;
  service: AccountService;
}) {
  const state = useClerkAccountState(config);
  const clerk = useClerk();
  const navigate = useNavigate();
  return (
    <AccountMenu
      state={state}
      links={accountLinks(config, location.origin)}
      service={service}
      variant="compact"
      align="start"
      onNavigate={(href) => {
        if (href.startsWith("/") && !href.startsWith("//")) void navigate(href);
        else location.assign(href);
      }}
      onSignOut={async () => {
        prepareIdentitySignOut();
        await clerk.signOut({ redirectUrl: "/" });
      }}
    />
  );
}
export function ClerkSignOut({ redirectUrl = "/" }: { redirectUrl?: string }) {
  const clerk = useClerk();
  return (
    <AccountSignOutButton
      onSignOut={async () => {
        prepareIdentitySignOut();
        await clerk.signOut({ redirectUrl });
      }}
    />
  );
}

export function ClerkAccountRecovery({ config }: { config: IdentityConfig }) {
  return (
    <div className="kazi-account-recovery">
      <ClerkAccountSummary config={config} />
      <ClerkSignOut />
    </div>
  );
}
