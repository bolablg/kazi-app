// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AccountRoot } from "../src/AccountRoot";
import { LoadingScreen } from "../src/LoadingScreen";
import { MemoryRouter } from "react-router-dom";

const session = vi.hoisted(() => ({
  clerk: { isLoaded: false, isSignedIn: false, userId: null as string | null },
  convex: { isLoading: true, isAuthenticated: false },
  clients: [] as { close: ReturnType<typeof vi.fn> }[],
  statusQuery: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => session.clerk,
  useUser: () => ({
    ...session.clerk,
    user: session.clerk.isSignedIn
      ? {
          fullName: "Test identity",
          primaryEmailAddress: { emailAddress: "test@example.test" },
        }
      : null,
  }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: () => <div>Sign in</div>,
  useReverification: (request: unknown) => request,
}));
vi.mock("convex/react", () => ({
  ConvexReactClient: class {
    close = vi.fn();
    constructor() {
      session.clients.push(this);
    }
  },
  useConvexAuth: () => session.convex,
  useQuery: session.statusQuery,
}));
vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: ({ children }: { children: React.ReactNode }) =>
    children,
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
vi.mock("../src/App", () => ({ default: () => <div>Private tasks</div> }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  session.clients.length = 0;
  session.clerk = { isLoaded: false, isSignedIn: false, userId: null };
  session.convex = { isLoading: true, isAuthenticated: false };
  localStorage.clear();
  session.statusQuery.mockReset();
});

it("keeps one identity-free loading screen through Clerk and Convex, and never mounts private content before verification", () => {
  vi.useFakeTimers();
  localStorage.setItem("kazi.private", "stale private data");
  const view = render(<AccountRoot url="https://example.convex.cloud" />, {
    wrapper: MemoryRouter,
  });
  expect(screen.getByRole("status", { name: "Opening Kazi" })).toBeTruthy();
  expect(session.clients).toHaveLength(0);
  expect(localStorage.getItem("kazi.private")).toBeNull();
  session.clerk = { isLoaded: true, isSignedIn: true, userId: "alice" };
  view.rerender(<AccountRoot url="https://example.convex.cloud" />);
  expect(session.clients).toHaveLength(1);
  expect(screen.getByRole("status", { name: "Opening Kazi" })).toBeTruthy();
  expect(screen.queryByText("Private tasks")).toBeNull();
  session.convex = { isLoading: false, isAuthenticated: true };
  view.rerender(<AccountRoot url="https://example.convex.cloud" />);
  expect(screen.getByTestId("private-account").textContent).toContain("alice");
  expect(session.statusQuery).not.toHaveBeenCalled();
  session.clerk.userId = "bob";
  session.convex = { isLoading: true, isAuthenticated: false };
  view.rerender(<AccountRoot url="https://example.convex.cloud" />);
  expect(screen.queryByTestId("private-account")).toBeNull();
  expect(session.clients).toHaveLength(2);
  act(() => {
    vi.runAllTimers();
  });
  expect(session.clients[0].close).toHaveBeenCalledOnce();
  session.clerk = { isLoaded: true, isSignedIn: false, userId: null };
  view.rerender(<AccountRoot url="https://example.convex.cloud" />);
  expect(screen.getByText("Sign in")).toBeTruthy();
  expect(screen.queryByText("Private tasks")).toBeNull();
});
it("shows actionable offline and failed verification states", () => {
  const view = render(<LoadingScreen online={false} />, {
    wrapper: MemoryRouter,
  });
  expect(screen.getByText(/Reconnect to load your private data/)).toBeTruthy();
  session.clerk = { isLoaded: true, isSignedIn: true, userId: "alice" };
  session.convex = { isLoading: false, isAuthenticated: false };
  view.rerender(<AccountRoot url="https://example.convex.cloud" />);
  expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
  expect(screen.queryByText("Private tasks")).toBeNull();
});
