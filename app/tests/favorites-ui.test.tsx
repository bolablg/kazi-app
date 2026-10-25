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
import {
  SidebarFavorites,
  TeamScope,
  TeamFavoriteButton,
} from "../src/Favorites";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
const data = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../src/data", () => ({ useData: () => data.current }));
vi.mock("../src/components", () => ({
  cx: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
  useUI: () => ({ run: (operation: () => Promise<unknown>) => operation() }),
}));
function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}
function show(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarFavorites />
      <TeamScope />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  const state = fixtureState();
  state.members[0].favoriteProjectIds = state.projects.map((p) => p.id);
  state.members[0].favoriteProjectAt = Object.fromEntries(
    state.projects.map((p, i) => [p.id, 1000 + i]),
  );
  state.teams = [
    {
      ...state.workspace,
      id: "team-a",
      key: "a",
      name: "Team A",
      role: "owner",
      favoriteAt: 5000,
    },
    {
      ...state.workspace,
      id: "team-b",
      key: "b",
      name: "Team B",
      role: "member",
      favoriteAt: 4000,
    },
  ];
  data.current = {
    state,
    actorId: DEMO_USER,
    teamId: "team-a",
    teams: state.teams,
    setTeam: vi.fn(),
    dispatch: vi.fn().mockResolvedValue("done"),
    online: true,
  };
});
afterEach(cleanup);
it("caps the combined list at five with type tags, a complete list link and collapse", () => {
  show();
  const favorites = screen.getByRole("navigation", {
    name: "Favorite shortcuts",
  });
  expect(
    within(favorites).getAllByRole("link").length +
      within(favorites).getAllByRole("button").length,
  ).toBe(5);
  expect(within(favorites).getAllByText("Team")).toHaveLength(2);
  expect(within(favorites).getAllByText("Project")).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: "More favorites" }).getAttribute("href"),
  ).toBe("/favorites");
  fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
  expect(
    screen.queryByRole("navigation", { name: "Favorite shortcuts" }),
  ).toBeNull();
});
it("team favorites scope Overview and keep project shortcuts available across scopes", () => {
  data.current.captureState = data.current.state;
  data.current.state = { ...data.current.state, projects: [] };
  show("/task/example");
  fireEvent.click(screen.getByRole("button", { name: "Team B Team" }));
  expect(data.current.setTeam).toHaveBeenCalledWith("team-b");
  expect(screen.getByLabelText("Current route").textContent).toBe("/");
  expect(
    screen.getByRole("link", { name: "Website launch Project" }),
  ).toBeTruthy();
});
it("opens a project favorite in its own team when another team is selected", () => {
  data.current.state.resourceTeams = { website: "team-b" };
  data.current.state.teamMemberships = {
    "team-b": data.current.state.members,
  };
  show();
  fireEvent.click(screen.getByRole("link", { name: "Website launch Project" }));
  expect(data.current.setTeam).toHaveBeenCalledWith("team-b");
  expect(screen.getByLabelText("Current route").textContent).toBe(
    "/project/website",
  );
});
it.each([
  ["/project/example", "/projects"],
  ["/task/example", "/tasks"],
  ["/plan/example", "/plans"],
])(
  "clearing a team filter safely leaves the scoped resource %s",
  (path, target) => {
    show(path);
    fireEvent.click(screen.getByRole("button", { name: "Clear team filter" }));
    expect(data.current.setTeam).toHaveBeenCalledWith("all");
    expect(screen.getByLabelText("Current route").textContent).toBe(target);
  },
);
it("stars the chosen team through its own scope rather than the active filter", () => {
  render(
    <TeamFavoriteButton
      team={{ id: "team-b", name: "Team B", kind: "team" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Favorite team Team B" }));
  expect(data.current.dispatch).toHaveBeenCalledWith(
    { type: "favorite_team", favorite: true },
    { teamId: "team-b" },
  );
});
