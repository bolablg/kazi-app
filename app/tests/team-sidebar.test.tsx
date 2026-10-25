// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TeamSidebar } from "../src/TeamSidebar";

const scope = vi.hoisted(() => ({
  teamId: "team-7",
  setTeam: vi.fn(),
  teams: Array.from({ length: 7 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    kind: "team",
    role: "member",
    ownerId: "owner",
  })),
}));
vi.mock("../src/data", () => ({ useData: () => scope }));
function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}
const show = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TeamSidebar />
      <Location />
    </MemoryRouter>,
  );
afterEach(cleanup);
beforeEach(() => {
  scope.teamId = "team-7";
  scope.setTeam.mockClear();
});
it("caps shortcuts at five, retains the selected team, links to the full list, and collapses", () => {
  show();
  const filters = screen.getByRole("navigation", { name: "Team filters" });
  expect(within(filters).getAllByRole("button")).toHaveLength(6);
  expect(
    within(filters)
      .getByRole("button", { name: "Team 7" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(within(filters).queryByRole("button", { name: "Team 5" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "More teams" }).getAttribute("href"),
  ).toBe("/teams");
  fireEvent.click(within(filters).getByRole("button", { name: "All teams" }));
  expect(scope.setTeam).toHaveBeenCalledWith("all");
  fireEvent.click(screen.getByRole("button", { name: "Teams" }));
  expect(screen.queryByRole("navigation", { name: "Team filters" })).toBeNull();
});
it.each([
  [
    "/project/13997939b4a3ac52a476416fb6c6de74/task/a6db037707841568ca6db31dea4cc832",
    "/projects",
  ],
  ["/task/a6db037707841568ca6db31dea4cc832", "/tasks"],
  ["/plan/a6db037707841568ca6db31dea4cc832", "/plans"],
])(
  "switching team leaves a scoped resource at %s safely",
  (path, collection) => {
    show(path);
    fireEvent.click(screen.getByRole("button", { name: "Team 1" }));
    expect(scope.setTeam).toHaveBeenCalledWith("team-1");
    expect(screen.getByLabelText("Current route").textContent).toBe(collection);
  },
);
