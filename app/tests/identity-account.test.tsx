// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:5192"}
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { AccountRoot } from "../src/AccountRoot";
import { AccountIdentityContext } from "../src/IdentityScreens";
import {
  resolveIdentityConfig,
  rememberReturn,
  savePendingLink,
  readPendingLink,
} from "../src/identityConfig";
import type { IdentityStatus } from "../src/identityApi";

const model = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: "central-clerk-user" as string | null,
  },
  status: undefined as IdentityStatus | undefined,
  preview: {
    completed: false,
    expiresAt: Date.now() + 60000,
    legacyDisplay: {
      name: "Existing Kazi User",
      email: "existing@example.test",
    },
  },
  query: vi.fn(),
  signIn: vi.fn(),
  create: vi.fn(async () => ({
    actorId: "new-canonical-actor",
    workspaceId: "new-workspace",
  })),
  complete: vi.fn(async () => ({ actorId: "old-canonical-actor" })),
  begin: vi.fn(),
  previewError: null as Error | null,
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => model.auth,
  useUser: () => ({
    user: {
      fullName: "Central User",
      username: "central-user",
      primaryEmailAddress: { emailAddress: "central@example.test" },
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: (props: unknown) => {
    model.signIn(props);
    return <div>Embedded legacy sign-in</div>;
  },
}));
vi.mock("convex/react", () => ({
  ConvexReactClient: class {
    close = vi.fn();
  },
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    model.query(getFunctionName(reference), args);
    if (
      getFunctionName(reference) === "identity:linkPreview" &&
      model.previewError
    )
      throw model.previewError;
    return getFunctionName(reference) === "identity:linkPreview"
      ? model.preview
      : model.status;
  },
}));
vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("../src/identityTransport", () => ({
  useIdentityRequest: (
    _url: string,
    _kind: string,
    reference: Parameters<typeof getFunctionName>[0],
  ) =>
    ({
      "identity:startNewAccount": model.create,
      "identity:completeLink": model.complete,
      "identity:beginLink": model.begin,
    })[getFunctionName(reference)],
  identityErrorMessage: () => "Please try again.",
}));
vi.mock("../src/data", () => ({
  LiveProvider: ({
    actorId,
    children,
  }: {
    actorId: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="private-account">
      {actorId}
      {children}
    </div>
  ),
}));
vi.mock("../src/App", () => ({
  default: () => {
    const route = useLocation();
    return (
      <>
        <div>Private tasks</div>
        <output data-testid="current-path">
          {route.pathname + route.search}
        </output>
        <AccountIdentityContext />
      </>
    );
  },
}));

const environment = {
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_legacy",
  VITE_IYANJU_CLERK_PUBLISHABLE_KEY: "pk_test_central",
  VITE_IYANJU_ACCOUNT_ORIGIN: "http://127.0.0.1:49569",
  VITE_KAZI_IDENTITY_MODE: "shared",
};
const ready = (provider: "central" | "legacy" = "central"): IdentityStatus => ({
  mode: "shared",
  provider,
  state: "ready",
  actorId: "old-canonical-actor",
  canLinkLegacy: provider === "legacy",
  hasCentralIdentity: true,
  activation: null,
  accountCreatedAt: null,
});
const unlinked = (): IdentityStatus => ({
  ...ready(),
  state: "unlinked",
  actorId: null,
  hasCentralIdentity: false,
});
function open(path = "/tasks", mode = "shared") {
  window.history.replaceState({}, "", path);
  const config = resolveIdentityConfig(
    { ...environment, VITE_KAZI_IDENTITY_MODE: mode },
    path,
  );
  const node = (
    <AccountRoot url="https://synthetic.convex.cloud" config={config} />
  );
  const view = render(node, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    ),
  });
  return {
    ...view,
    rerenderAccount: () =>
      view.rerender(
        <AccountRoot url="https://synthetic.convex.cloud" config={config} />,
      ),
  };
}
beforeEach(() => {
  model.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: "central-clerk-user",
  };
  model.status = ready();
  model.preview.completed = false;
  model.previewError = null;
  model.query.mockClear();
  model.signIn.mockClear();
  model.create.mockClear();
  model.complete.mockClear();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(cleanup);

it("uses the server's canonical actor and keeps first-entry data out of the browser", () => {
  open();
  expect(screen.getByTestId("private-account").textContent).toContain(
    "old-canonical-actor",
  );
  expect(screen.getByTestId("private-account").textContent).not.toContain(
    "central-clerk-user",
  );
  expect(model.create).not.toHaveBeenCalled();
  expect(JSON.stringify(localStorage)).not.toContain("activatedAt");
});
it("waits for canonical identity and rejects provider/mode mismatches without private data", () => {
  model.status = undefined;
  const view = open();
  expect(screen.queryByText("Private tasks")).toBeNull();
  expect(screen.getByRole("status", { name: "Opening Kazi" })).toBeTruthy();
  model.status = { ...ready(), provider: "legacy" };
  view.rerenderAccount();
  expect(screen.getByRole("alert").textContent).toMatch(/cannot safely open/);
  expect(screen.queryByText("Private tasks")).toBeNull();
});
it("allows legacy-primary rehearsal only through the shared backend canonical resolver", () => {
  model.status = ready("legacy");
  open("/tasks", "legacy");
  expect(model.query).toHaveBeenCalledWith("identity:status", {});
  expect(screen.getByTestId("private-account").textContent).toContain(
    "old-canonical-actor",
  );
  expect(screen.queryByText("Link your iYANJU account")).toBeNull();
});
it("uses central signup and fixed callback URLs instead of a local transferable signup", () => {
  model.auth.isSignedIn = false;
  model.auth.userId = null;
  open("/join?invitation=synthetic-private-invite");
  const signIn = screen.getByRole("link", { name: "Sign in" });
  signIn.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(signIn);
  expect(signIn.getAttribute("href")).toContain(
    "http://127.0.0.1:49569/account?",
  );
  expect(signIn.getAttribute("href")).not.toContain("invitation");
  expect(
    screen.getByRole("link", { name: "Create account" }).getAttribute("href"),
  ).toContain("/account/sign-up?");
  expect(model.signIn).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("link", { name: "An idea from iYANJU" })
      .getAttribute("href"),
  ).toBe("https://iyanju.com");
});
it("legacy linking signs into an existing account without local signup or OAuth transfer", () => {
  model.auth.isSignedIn = false;
  model.auth.userId = null;
  open("/account/link/legacy");
  expect(model.signIn).toHaveBeenCalledWith(
    expect.objectContaining({ withSignUp: false, transferable: false }),
  );
  expect(screen.queryByText("Private tasks")).toBeNull();
});
it("legacy-primary rehearsal also disables local signup and transferable OAuth", () => {
  model.auth.isSignedIn = false;
  model.auth.userId = null;
  open("/tasks", "legacy");
  expect(model.signIn).toHaveBeenCalledWith(
    expect.objectContaining({
      withSignUp: false,
      transferable: false,
      signUpUrl: expect.stringContaining(
        "http://127.0.0.1:49569/account/sign-up?",
      ),
    }),
  );
  expect(
    screen.getByRole("link", { name: "Create an iYANJU account" }),
  ).toBeTruthy();
  expect(model.query).not.toHaveBeenCalled();
});
it("requires an explicit choice before creating a new personal workspace", async () => {
  model.status = unlinked();
  const view = open();
  expect(
    screen.getByRole("link", { name: "Link existing Kazi account" }),
  ).toBeTruthy();
  expect(model.create).not.toHaveBeenCalled();
  expect(screen.queryByText("Private tasks")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Start a new personal workspace" }),
  );
  await waitFor(() => expect(model.create).toHaveBeenCalledOnce());
  expect(screen.queryByText("Private tasks")).toBeNull();
  model.status = ready();
  view.rerenderAccount();
  expect(screen.getByText("Private tasks")).toBeTruthy();
});
it("shows both identities and requires final confirmation; then restores the private deep link", async () => {
  model.status = unlinked();
  rememberReturn(
    sessionStorage,
    "/project/opaque-project/task/opaque-task",
    "?view=board",
  );
  savePendingLink(sessionStorage, {
    id: "synthetic-id",
    secret: "synthetic-proof",
    expiresAt: Date.now() + 60000,
  });
  const view = open("/account/link/central");
  expect(screen.getByText("existing@example.test")).toBeTruthy();
  expect(screen.getByText("central@example.test")).toBeTruthy();
  expect(model.complete).not.toHaveBeenCalled();
  expect(location.href).not.toContain("synthetic-proof");
  fireEvent.click(screen.getByRole("button", { name: "Link accounts" }));
  await waitFor(() =>
    expect(model.complete).toHaveBeenCalledWith({
      id: "synthetic-id",
      secret: "synthetic-proof",
    }),
  );
  expect(readPendingLink(sessionStorage)).not.toBeNull();
  model.preview.completed = true;
  model.status = ready();
  view.rerenderAccount();
  await waitFor(() =>
    expect(screen.getByTestId("current-path").textContent).toBe(
      "/project/opaque-project/task/opaque-task?view=board",
    ),
  );
});
it("does not discard a pending different-account link when the central account is already ready", () => {
  model.status = ready();
  model.previewError = new Error("Synthetic identity conflict");
  savePendingLink(sessionStorage, {
    id: "other-account-id",
    secret: "other-account-proof",
    expiresAt: Date.now() + 60000,
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    open("/account/link/central");
    expect(screen.queryByText("Private tasks")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Start account linking again" }),
    ).toBeTruthy();
    expect(readPendingLink(sessionStorage)?.id).toBe("other-account-id");
  } finally {
    consoleError.mockRestore();
  }
});
it("recovers a completed same-account link after a response was lost", async () => {
  model.status = unlinked();
  rememberReturn(sessionStorage, "/join", "?invitation=synthetic-invite");
  savePendingLink(sessionStorage, {
    id: "synthetic-id",
    secret: "synthetic-proof",
    expiresAt: Date.now() + 60000,
  });
  model.complete.mockRejectedValueOnce(new Error("Synthetic connection loss"));
  const view = open("/account/link/central");
  fireEvent.click(screen.getByRole("button", { name: "Link accounts" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  model.preview.completed = true;
  model.status = ready();
  view.rerenderAccount();
  await waitFor(() =>
    expect(screen.getByTestId("current-path").textContent).toBe(
      "/join?invitation=synthetic-invite",
    ),
  );
  expect(readPendingLink(sessionStorage)).toBeNull();
});
it("does not create a blank account when link proof is missing or expired", () => {
  model.status = unlinked();
  savePendingLink(sessionStorage, {
    id: "expired-id",
    secret: "expired-secret",
    expiresAt: Date.now() - 1,
  });
  open("/account/link/central");
  expect(
    screen.getByRole("heading", { name: "Start account linking again" }),
  ).toBeTruthy();
  expect(model.create).not.toHaveBeenCalled();
  expect(screen.queryByText("Private tasks")).toBeNull();
});
