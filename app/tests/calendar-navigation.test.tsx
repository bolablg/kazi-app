// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarPage } from "../src/CalendarPage";
import { fixtureState, DEMO_USER } from "../shared/fixtures";

const navigation = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  // Keep the URL unchanged to model keys arriving before navigation commits.
  useSearchParams: () => [
    new URLSearchParams(
      "view=calendar&range=week&date=2026-10-26&project=website",
    ),
    navigation.set,
  ],
}));
vi.mock("../src/data", () => ({
  useData: () => ({ state: fixtureState(), actorId: DEMO_USER, demo: true }),
}));
vi.mock("../src/WorkViewScope", () => ({
  WorkViewFilters: () => null,
  useWorkViewScope: () => ({ person: "all", project: "all" }),
  useCurrentMinute: () => Date.parse("2026-10-26T13:00:00Z"),
}));
vi.mock("../src/CalendarTimeGrid", () => ({ CalendarTimeGrid: () => null }));
afterEach(cleanup);

it("uses one view switcher and retains the date and filters while navigation is pending", () => {
  render(
    <MemoryRouter>
      <CalendarPage
        openTask={vi.fn()}
        addTask={vi.fn()}
        addProject={vi.fn()}
        openPlan={vi.fn()}
      />
    </MemoryRouter>,
  );
  const view = screen.getByRole("combobox", { name: "Calendar view" });
  expect(screen.queryByRole("tab", { name: "Calendar" })).toBeNull();
  fireEvent.change(view, { target: { value: "schedule" } });
  fireEvent.change(view, { target: { value: "workweek" } });
  fireEvent.change(view, { target: { value: "day" } });
  const requests = navigation.set.mock.calls.map(([update]) =>
    update(new URLSearchParams("range=week&date=2026-10-26&project=website")),
  );
  expect(requests.map((params) => params.get("view"))).toEqual([
    "schedule",
    "calendar",
    "calendar",
  ]);
  expect(requests.map((params) => params.get("range"))).toEqual([
    "week",
    "workweek",
    "day",
  ]);
  expect(
    requests.every(
      (params) =>
        params.get("project") === "website" &&
        params.get("date") === "2026-10-26",
    ),
  ).toBe(true);
});
