import { expect, it } from "vitest";
import {
  accountLinks,
  centralManagementLinks,
  clerkAccountState,
  clerkIdentity,
  kaziAccountService,
} from "../src/accountAdapter";
import { resolveIdentityConfig } from "../src/identityConfig";
const dev = resolveIdentityConfig(
  {
    VITE_KAZI_IDENTITY_MODE: "shared",
    VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_test_central",
    VITE_IYANJU_ACCOUNT_ORIGIN: "http://127.0.0.1:49569",
  },
  "/",
);
const prod = resolveIdentityConfig(
  {
    VITE_KAZI_IDENTITY_MODE: "shared",
    VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_live_central",
    VITE_IYANJU_ACCOUNT_ORIGIN: "https://iyanju.com",
  },
  "/",
);
it("uses matching central management URLs and the existing fixed sign-in return", () => {
  expect(centralManagementLinks(prod, "https://kazi.iyanju.com")).toEqual({
    profile: "https://iyanju.com/account?view=profile",
    services: "https://iyanju.com/account",
    signIn:
      "https://iyanju.com/account?redirect_url=https%3A%2F%2Fkazi.iyanju.com%2Faccount%2Freturn",
    signUp:
      "https://iyanju.com/account/sign-up?redirect_url=https%3A%2F%2Fkazi.iyanju.com%2Faccount%2Freturn",
  });
  expect(centralManagementLinks(dev, "http://127.0.0.1:5192")?.profile).toBe(
    "http://127.0.0.1:49569/account?view=profile",
  );
});
it("never sends development users to production or permits arbitrary account origins", () => {
  for (const [config, app] of [
    [prod, "http://127.0.0.1:5192"],
    [dev, "https://kazi.iyanju.com"],
    [prod, "https://kazi-preview.vercel.app"],
    [
      {
        ...dev,
        central: {
          ...dev.central!,
          accountOrigin: "https://iyanju.com.evil.test",
        },
      },
      "http://127.0.0.1:5192",
    ],
    [
      {
        ...prod,
        central: { ...prod.central!, publishableKey: "pk_test_wrong" },
      },
      "https://kazi.iyanju.com",
    ],
  ] as const)
    expect(centralManagementLinks(config, app)).toBeNull();
});
it("uses only Clerk profile data, preserving honest loading, signed-out and legacy states", () => {
  const user = {
    fullName: "Central Name",
    username: "central",
    primaryEmailAddress: { emailAddress: "central@example.test" },
    hasImage: true,
    imageUrl: "https://img.example.test/avatar.png",
  };
  expect(clerkIdentity(user)).toEqual({
    name: "Central Name",
    email: "central@example.test",
    imageUrl: user.imageUrl,
  });
  expect(
    clerkAccountState(dev, "http://127.0.0.1:5192", { isLoaded: false, user }),
  ).toEqual({ status: "loading" });
  expect(
    clerkAccountState(dev, "http://127.0.0.1:5192", {
      isLoaded: true,
      isSignedIn: false,
    }),
  ).toEqual({ status: "signed-out" });
  expect(
    clerkAccountState(dev, "http://127.0.0.1:5192", {
      isLoaded: true,
      isSignedIn: true,
    }),
  ).toEqual({ status: "unavailable" });
  expect(
    clerkAccountState(dev, "http://127.0.0.1:5192", {
      isLoaded: true,
      isSignedIn: true,
      user,
    }),
  ).toMatchObject({ status: "signed-in", identity: { name: "Central Name" } });
  const legacy = { ...dev, provider: "legacy" as const };
  expect(
    clerkAccountState(legacy, "http://127.0.0.1:5192", {
      isLoaded: true,
      isSignedIn: true,
      user,
    }),
  ).toMatchObject({ status: "legacy", label: "Legacy Kazi account" });
  expect(accountLinks(legacy, "http://127.0.0.1:5192").profile).toBe("");
});
it("keeps Kazi roles and service actions local", () => {
  expect(kaziAccountService("admin")).toEqual({
    name: "Kazi",
    role: "Manager",
    actions: [
      { id: "settings", label: "Settings", href: "/settings" },
      { id: "connections", label: "Connections", href: "/connections" },
      { id: "people", label: "Team & people", href: "/teams" },
      { id: "privacy", label: "Privacy policy", href: "/privacy" },
    ],
  });
  expect(kaziAccountService("owner", true).actions[0]).toMatchObject({
    label: "My account",
    href: "/settings?tab=account",
  });
});
