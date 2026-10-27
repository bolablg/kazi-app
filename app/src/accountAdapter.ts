import type {
  AccountIdentity,
  AccountLinks,
  AccountService,
  AccountState,
} from "@iyanju/account-ui";
import { centralAccountUrl, type IdentityConfig } from "./identityConfig";

export type ClerkProfile = {
  fullName?: string | null;
  username?: string | null;
  hasImage?: boolean;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
};
export function clerkIdentity(user: ClerkProfile): AccountIdentity {
  return {
    name: user.fullName || user.username,
    email: user.primaryEmailAddress?.emailAddress,
    imageUrl: user.hasImage ? user.imageUrl : null,
  };
}

/** Reuse the existing exact-origin sign-in boundary for management links too. */
export function centralManagementLinks(
  config: IdentityConfig,
  appOrigin: string,
): AccountLinks | null {
  if (config.error || !config.central) return null;
  const origin = config.central.accountOrigin;
  const production =
    appOrigin === "https://kazi.iyanju.com" && origin === "https://iyanju.com";
  const development =
    appOrigin === "http://127.0.0.1:5192" &&
    origin === "http://127.0.0.1:49569";
  if (
    !(production || development) ||
    !config.central.publishableKey.startsWith(
      production ? "pk_live_" : "pk_test_",
    )
  )
    return null;
  try {
    return {
      profile: new URL("/account?view=profile", origin).href,
      services: new URL("/account", origin).href,
      signIn: centralAccountUrl(config, appOrigin),
      signUp: centralAccountUrl(config, appOrigin, true),
    };
  } catch {
    return null;
  }
}
export function accountLinks(
  config: IdentityConfig,
  appOrigin: string,
): AccountLinks {
  const central = centralManagementLinks(config, appOrigin);
  return config.provider === "central"
    ? (central ?? { profile: "", services: "", signIn: "", signUp: "" })
    : {
        profile: "",
        services: "",
        signIn: "/",
        signUp: central?.signUp ?? "/",
      };
}
export function clerkAccountState(
  config: IdentityConfig,
  appOrigin: string,
  session: {
    isLoaded: boolean;
    isSignedIn?: boolean;
    user?: ClerkProfile | null;
  },
): AccountState {
  if (!session.isLoaded) return { status: "loading" };
  if (session.isSignedIn === false) return { status: "signed-out" };
  if (
    !session.user ||
    session.isSignedIn !== true ||
    config.error ||
    (config.provider === "central" &&
      !centralManagementLinks(config, appOrigin))
  )
    return { status: "unavailable" };
  const identity = clerkIdentity(session.user);
  return config.provider === "central"
    ? { status: "signed-in", identity }
    : { status: "legacy", identity, label: "Legacy Kazi account" };
}
export function kaziRole(role: string) {
  return role === "owner"
    ? "Owner"
    : role === "admin"
      ? "Manager"
      : role === "member"
        ? "Member"
        : role;
}
export function kaziAccountService(
  role: string,
  local = false,
): AccountService {
  return {
    name: "Kazi",
    role: kaziRole(role),
    actions: [
      ...(local
        ? [
            {
              id: "account",
              label: "My account",
              href: "/settings?tab=account",
            },
          ]
        : []),
      { id: "settings", label: "Settings", href: "/settings" },
      { id: "connections", label: "Connections", href: "/connections" },
      { id: "people", label: "Team & people", href: "/teams" },
      { id: "privacy", label: "Privacy policy", href: "/privacy" },
    ],
  };
}
