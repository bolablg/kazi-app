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
import { JoinPage } from "../src/SettingsPages";

const commands = vi.hoisted(() => ({ acceptInvite: vi.fn() }));
vi.mock("../src/data", () => ({ useData: () => commands }));
vi.mock("../src/components", async (load) => ({
  ...(await load<typeof import("../src/components")>()),
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
      {location.pathname + location.search}
    </output>
  );
}
function join(url = "/join?token=example-test-invitation") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Location />
      <JoinPage />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  commands.acceptInvite.mockReset();
});

it("does not offer an acceptance action without an invitation token", () => {
  join("/join");
  expect(
    screen.getByRole("heading", { name: "Invitation link missing" }),
  ).toBeDefined();
  expect(
    screen.queryByRole("button", { name: "Accept invitation" }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Back to overview" }).getAttribute("href"),
  ).toBe("/");
  expect(commands.acceptInvite).not.toHaveBeenCalled();
});
it("removes the invitation token from the URL after successful acceptance", async () => {
  commands.acceptInvite.mockResolvedValueOnce(undefined);
  join();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toBe("/"),
  );
  expect(commands.acceptInvite).toHaveBeenCalledWith("example-test-invitation");
});
it("keeps a failed invitation open for retry", async () => {
  commands.acceptInvite.mockRejectedValueOnce(
    new Error("Invitation has expired"),
  );
  join();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Accept invitation" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(screen.getByTestId("location").textContent).toBe(
    "/join?token=example-test-invitation",
  );
});
