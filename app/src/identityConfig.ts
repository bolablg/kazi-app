export type IdentityMode = "legacy" | "shared";
export type IdentityProvider = "legacy" | "central";
export type IdentityConfig = {
  mode: IdentityMode;
  provider: IdentityProvider;
  publishableKey?: string;
  legacyKey?: string;
  central?: { publishableKey: string; accountOrigin: string };
  error?: string;
};
type IdentityEnvironment = {
  VITE_KAZI_IDENTITY_MODE?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  VITE_IYANJU_CLERK_PUBLISHABLE_KEY?: string;
  VITE_IYANJU_ACCOUNT_ORIGIN?: string;
};

export const identityPaths = {
  returned: "/account/return",
  legacyLink: "/account/link/legacy",
  centralLink: "/account/link/central",
} as const;

export function resolveIdentityConfig(
  env: IdentityEnvironment,
  pathname: string,
  preferredProvider?: IdentityProvider | null,
): IdentityConfig {
  const mode = env.VITE_KAZI_IDENTITY_MODE || "legacy";
  const config: IdentityConfig = {
    mode: mode === "shared" ? "shared" : "legacy",
    provider: "legacy",
    legacyKey: env.VITE_CLERK_PUBLISHABLE_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  };
  if (mode !== "shared" && mode !== "legacy")
    return {
      ...config,
      error: "Kazi identity mode is not configured correctly.",
    };
  const key = env.VITE_IYANJU_CLERK_PUBLISHABLE_KEY;
  const origin = env.VITE_IYANJU_ACCOUNT_ORIGIN;
  if (key || origin || mode === "shared") {
    const production = origin === "https://iyanju.com";
    const development = origin === "http://127.0.0.1:49569";
    if (
      !key ||
      !(production || development) ||
      !key.startsWith(production ? "pk_live_" : "pk_test_")
    )
      return {
        ...config,
        error: "The iYANJU account connection is incomplete.",
      };
    config.central = { publishableKey: key, accountOrigin: origin! };
  }
  const centralRoute =
    pathname === identityPaths.centralLink ||
    pathname === identityPaths.returned;
  const legacyRoute = pathname === identityPaths.legacyLink;
  if ((centralRoute || legacyRoute) && !config.central)
    return {
      ...config,
      error: "Account linking is not enabled in this environment.",
    };
  if (legacyRoute && !config.legacyKey)
    return {
      ...config,
      error: "The existing Kazi account connection is unavailable.",
    };
  config.provider = legacyRoute
    ? "legacy"
    : mode === "shared" ||
        centralRoute ||
        (config.central && preferredProvider === "central")
      ? "central"
      : "legacy";
  config.publishableKey =
    config.provider === "central"
      ? config.central?.publishableKey
      : config.legacyKey;
  return config;
}

// Provider selection is fixed for this document. Switching issuers always uses
// a complete same-origin navigation, so private query caches cannot cross users.
const PROVIDER_KEY = "kazi.identity.provider.v1";
function browserProviderPreference() {
  try {
    return readProviderPreference(sessionStorage);
  } catch {
    return null;
  }
}
export const identityConfig = resolveIdentityConfig(
  {
    VITE_KAZI_IDENTITY_MODE: import.meta.env.VITE_KAZI_IDENTITY_MODE,
    VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    VITE_IYANJU_CLERK_PUBLISHABLE_KEY: import.meta.env
      .VITE_IYANJU_CLERK_PUBLISHABLE_KEY,
    VITE_IYANJU_ACCOUNT_ORIGIN: import.meta.env.VITE_IYANJU_ACCOUNT_ORIGIN,
  },
  typeof location === "undefined" ? "/" : location.pathname,
  browserProviderPreference(),
);
if (
  typeof location !== "undefined" &&
  !identityConfig.error &&
  identityConfig.central &&
  [
    identityPaths.returned,
    identityPaths.legacyLink,
    identityPaths.centralLink,
  ].some((path) => path === location.pathname)
)
  try {
    saveProviderPreference(sessionStorage, identityConfig.provider);
  } catch {
    identityConfig.error =
      "Browser storage is required to continue account linking safely.";
  }

export function readProviderPreference(
  storage: Storage,
): IdentityProvider | null {
  try {
    const provider = storage.getItem(PROVIDER_KEY);
    return provider === "central" || provider === "legacy" ? provider : null;
  } catch {
    return null;
  }
}
export function saveProviderPreference(
  storage: Storage,
  provider: IdentityProvider,
) {
  storage.setItem(PROVIDER_KEY, provider);
}
export function clearProviderPreference(storage: Storage) {
  storage.removeItem(PROVIDER_KEY);
}

const RETURN_KEY = "kazi.identity.return.v1";
const LINK_KEY = "kazi.identity.link.v1";
const unsafeCharacters =
  /[\\\s\u0000-\u001f\u007f]|%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i;
export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacters.test(value)
  )
    return "/";
  try {
    const parsed = new URL(value, "https://kazi.iyanju.com");
    if (
      parsed.origin !== "https://kazi.iyanju.com" ||
      parsed.pathname === "/account" ||
      parsed.pathname.startsWith("/account/")
    )
      return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

export function rememberReturn(
  storage: Storage,
  pathname: string,
  search = "",
) {
  if (pathname === "/account" || pathname.startsWith("/account/")) return;
  storage.setItem(RETURN_KEY, safeReturnPath(pathname + search));
}
export function readReturn(storage: Storage) {
  return safeReturnPath(storage.getItem(RETURN_KEY));
}
export function consumeReturn(storage: Storage) {
  const path = readReturn(storage);
  storage.removeItem(RETURN_KEY);
  return path;
}

export type PendingIdentityLink = {
  id: string;
  secret: string;
  expiresAt: number;
};
export function savePendingLink(storage: Storage, link: PendingIdentityLink) {
  // Do not persist names, email addresses, bearer tokens, or proof in URLs.
  storage.setItem(
    LINK_KEY,
    JSON.stringify({
      id: link.id,
      secret: link.secret,
      expiresAt: link.expiresAt,
    }),
  );
}
export function readPendingLink(storage: Storage, now = Date.now()) {
  try {
    const raw = storage.getItem(LINK_KEY);
    if (!raw) return null;
    const link = JSON.parse(raw) as PendingIdentityLink;
    if (
      typeof link.id !== "string" ||
      !link.id ||
      typeof link.secret !== "string" ||
      !link.secret ||
      !Number.isFinite(link.expiresAt) ||
      link.expiresAt <= now
    ) {
      clearPendingLink(storage);
      return null;
    }
    return { id: link.id, secret: link.secret, expiresAt: link.expiresAt };
  } catch {
    clearPendingLink(storage);
    return null;
  }
}
export function clearPendingLink(storage: Storage) {
  storage.removeItem(LINK_KEY);
}
export function prepareIdentitySignOut(storage?: Storage) {
  // Cleanup is best effort: a blocked browser store must never prevent logout.
  try {
    clearPendingLink(storage ?? sessionStorage);
  } catch {
    /* No secret is logged. */
  }
  // The chosen directory is a nonsecret UI preference. Keep it so logging out
  // cannot silently reopen an unrelated active session from another directory.
}

export function centralAccountUrl(
  config: IdentityConfig,
  appOrigin: string,
  signUp = false,
  callback:
    | typeof identityPaths.returned
    | typeof identityPaths.centralLink = identityPaths.returned,
) {
  if (!config.central) throw new Error("iYANJU accounts are not configured.");
  const origin = new URL(appOrigin);
  if (
    origin.origin !== appOrigin ||
    !(
      origin.origin === "https://kazi.iyanju.com" ||
      (origin.origin === "http://127.0.0.1:5192" &&
        config.central.accountOrigin === "http://127.0.0.1:49569")
    )
  )
    throw new Error("This Kazi address is not allowed to return from sign-in.");
  const destination = new URL(
    signUp ? "/account/sign-up" : "/account",
    config.central.accountOrigin,
  );
  destination.searchParams.set("redirect_url", origin.origin + callback);
  return destination.href;
}
