// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { PlanReview } from "../src/PlanningPages";

const commands = vi.hoisted(() => ({ dispatch: vi.fn() }));
const state = fixtureState(Date.parse("2026-10-26T13:00:00Z"));
const proposal = state.proposals.find((p) => p.status === "awaiting_review")!;
vi.mock("../src/data", () => ({
  useData: () => ({
    state,
    actorId: DEMO_USER,
    dispatch: commands.dispatch,
    demo: true,
    online: true,
  }),
}));
vi.mock("../src/components", async (load) => ({
  ...(await load<typeof import("../src/components")>()),
  Modal: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  useUI: () => ({
    run: async (action: () => Promise<unknown>) => {
      try {
        return await action();
      } catch {
        return undefined;
      }
    },
  }),
}));

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {JSON.stringify({ search: location.search, state: location.state })}
    </output>
  );
}
function review() {
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/plan/${proposal.id}`,
          search: `?revision=${proposal.revision}`,
          state: { background: { pathname: "/plans" } },
        },
      ]}
    >
      <Location />
      <PlanReview id={proposal.id} onClose={() => {}} />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  commands.dispatch.mockReset();
});

it("keeps the current plan URL when an alternative edit fails", async () => {
  commands.dispatch.mockRejectedValueOnce(
    new Error("Another person updated this proposal"),
  );
  review();
  const before = screen.getByTestId("location").textContent;
  fireEvent.click(screen.getByRole("button", { name: /OPTION 2/ }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /OPTION 2/ }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(commands.dispatch).toHaveBeenCalledOnce();
  expect(screen.getByTestId("location").textContent).toBe(before);
});

it("updates only a successful local edit's revision and preserves its return location", async () => {
  commands.dispatch.mockResolvedValueOnce("");
  review();
  fireEvent.click(screen.getByRole("button", { name: /OPTION 2/ }));
  await waitFor(() =>
    expect(JSON.parse(screen.getByTestId("location").textContent!).search).toBe(
      `?revision=${proposal.revision + 1}`,
    ),
  );
  expect(JSON.parse(screen.getByTestId("location").textContent!).state).toEqual(
    { background: { pathname: "/plans" } },
  );
  expect(commands.dispatch).toHaveBeenCalledWith({
    type: "select_alternative",
    id: proposal.id,
    revision: proposal.revision,
    selected: 1,
  });
});
