// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:5192"}
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { accountTheme } from "@iyanju/account-ui";
import { AccountMenu, AccountSettings } from "../src/AccountPages";
import { resolveIdentityConfig } from "../src/identityConfig";
const model = vi.hoisted(() => ({
  session: {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: "Central Identity",
      username: "central",
      primaryEmailAddress: { emailAddress: "central@example.test" },
      hasImage: false,
      imageUrl: "https://img.example.test/default.png",
    } as object | null,
  },
  identity: null as object | null,
  demo: false,
  local: false,
  signOut: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useUser: () => model.session,
  useClerk: () => ({ signOut: model.signOut }),
  UserProfile: (props: unknown) => {
    model.profile(props);
    return <div>Legacy editor</div>;
  },
}));
vi.mock("../src/IdentityScreens", () => ({
  useAccountIdentity: () => model.identity,
  AccountIdentityContext: () => null,
}));
vi.mock("../src/data", () => ({
  useData: () => ({
    demo: model.demo,
    local: model.local,
    actorId: "local-actor",
    state: {
      members: [
        {
          id: "local-actor",
          name: "Local membership alias",
          email: "membership@example.test",
          role: "owner",
        },
      ],
    },
  }),
}));
const config = resolveIdentityConfig(
  {
    VITE_KAZI_IDENTITY_MODE: "shared",
    VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_test_central",
    VITE_IYANJU_ACCOUNT_ORIGIN: "http://127.0.0.1:49569",
  },
  "/",
);
function CurrentPath() {
  const route = useLocation();
  return <span data-testid="path">{route.pathname + route.search}</span>;
}
function open(node = <AccountMenu />) {
  return render(
    <MemoryRouter>
      <CurrentPath />
      {node}
    </MemoryRouter>,
  );
}
beforeEach(() => {
  model.session = {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: "Central Identity",
      username: "central",
      primaryEmailAddress: { emailAddress: "central@example.test" },
      hasImage: false,
      imageUrl: "https://img.example.test/default.png",
    },
  };
  model.identity = { config };
  model.demo = false;
  model.local = false;
  model.signOut.mockReset();
  model.profile.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows central Clerk identity and exact central actions, with Kazi role kept separate", () => {
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "iYANJU account: Central Identity" }),
  );
  const menu = screen.getByRole("menu", { name: "iYANJU account" });
  expect(screen.getByText("central@example.test")).toBeTruthy();
  expect(screen.queryByText("Local membership alias")).toBeNull();
  expect(screen.queryByText("membership@example.test")).toBeNull();
  expect(
    within(menu)
      .getByRole("menuitem", { name: "Profile & security" })
      .getAttribute("href"),
  ).toBe("http://127.0.0.1:49569/account?view=profile");
  expect(
    within(menu)
      .getByRole("menuitem", { name: "Your services" })
      .getAttribute("href"),
  ).toBe("http://127.0.0.1:49569/account");
  expect(
    within(menu).getByRole("group", {
      name: "Kazi settings, Kazi role: Owner",
    }),
  ).toBeTruthy();
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((el) => el.textContent),
  ).toEqual([
    "Profile & security",
    "Your services",
    "Settings",
    "Connections",
    "Team & people",
    "Privacy policy",
    "Sign out",
  ]);
});
it("retains router navigation and common Escape focus return", () => {
  open();
  const trigger = screen.getByRole("button", {
    name: "iYANJU account: Central Identity",
  });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Connections" }));
  expect(screen.getByTestId("path").textContent).toBe("/connections");
  expect(screen.queryByRole("menu")).toBeNull();
});
it("prevents duplicate sign-out, exposes failure/retry, and preserves service data and provider preference", async () => {
  let reject!: (error: Error) => void;
  model.signOut
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    )
    .mockResolvedValueOnce(undefined);
  sessionStorage.setItem("kazi.identity.link.v1", "synthetic-pending-proof");
  sessionStorage.setItem("kazi.identity.provider.v1", "central");
  localStorage.setItem("kazi.test.service-data", "unchanged");
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "iYANJU account: Central Identity" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  const pending = screen.getByRole("menuitem", { name: "Signing out…" });
  expect(pending.hasAttribute("disabled")).toBe(true);
  fireEvent.click(pending);
  expect(model.signOut).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Synthetic failure")));
  expect(screen.getByRole("alert").textContent).toContain(
    "couldn’t sign you out",
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy(),
  );
  expect(model.signOut).toHaveBeenLastCalledWith({ redirectUrl: "/" });
  expect(sessionStorage.getItem("kazi.identity.link.v1")).toBeNull();
  expect(sessionStorage.getItem("kazi.identity.provider.v1")).toBe("central");
  expect(localStorage.getItem("kazi.test.service-data")).toBe("unchanged");
});
it("does not flash local membership details in loading, signed-out or unavailable states", () => {
  model.session.isLoaded = false;
  const view = open();
  expect(screen.getByRole("status").textContent).toContain(
    "Loading your account",
  );
  expect(screen.queryByText("Local membership alias")).toBeNull();
  model.session = { isLoaded: true, isSignedIn: false, user: null };
  view.rerender(
    <MemoryRouter>
      <AccountMenu />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
  ).toContain("http://127.0.0.1:49569/account?");
  model.session = { isLoaded: true, isSignedIn: true, user: null };
  view.rerender(
    <MemoryRouter>
      <AccountMenu />
    </MemoryRouter>,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Account unavailable",
  );
  expect(screen.queryByText("Local membership alias")).toBeNull();
});
it("labels legacy identities honestly and keeps their profile editor with the shared theme", () => {
  model.identity = { config: { ...config, provider: "legacy" } };
  open(
    <>
      <AccountMenu />
      <AccountSettings />
    </>,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Legacy Kazi account: Central Identity",
    }),
  );
  expect(
    screen.queryByRole("menuitem", { name: "Profile & security" }),
  ).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Your services" })).toBeNull();
  expect(screen.getByText("Legacy editor")).toBeTruthy();
  expect(model.profile).toHaveBeenCalledWith(
    expect.objectContaining({ appearance: accountTheme, routing: "hash" }),
  );
});
it("central account settings use the shared summary and canonical entry instead of an embedded editor", () => {
  open(<AccountSettings />);
  expect(screen.getByText("Central Identity")).toBeTruthy();
  expect(screen.getByText("central@example.test")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Profile & security" })
      .getAttribute("href"),
  ).toBe("http://127.0.0.1:49569/account?view=profile");
  expect(model.profile).not.toHaveBeenCalled();
  expect(screen.getByText("Kazi role")).toBeTruthy();
});
it("demo navigation uses the shared summary but offers no fake Clerk sign-out or central profile", () => {
  model.demo = true;
  open(
    <>
      <AccountMenu />
      <AccountSettings />
    </>,
  );
  fireEvent.click(screen.getByLabelText("User menu"));
  expect(screen.getAllByText("Kazi demo account").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Profile & security" })).toBeNull();
  expect(model.profile).not.toHaveBeenCalled();
});
