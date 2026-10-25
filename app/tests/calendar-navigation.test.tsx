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
    new URLSearchParams("view=calendar&range=week"),
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

it("uses the focused Calendar tab for consecutive keys while the URL update is pending", () => {
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
  const calendar = screen.getByRole("tab", { name: "Calendar" });
  const schedule = screen.getByRole("tab", { name: "Schedule" });
  calendar.focus();
  fireEvent.keyDown(calendar, { key: "End" });
  expect(document.activeElement).toBe(schedule);
  fireEvent.keyDown(schedule, { key: "ArrowRight" });
  expect(document.activeElement).toBe(calendar);
  fireEvent.keyDown(calendar, { key: "Home" });
  fireEvent.keyDown(calendar, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(schedule);
  expect(
    navigation.set.mock.calls.map(([update]) =>
      update(new URLSearchParams("range=week")).get("view"),
    ),
  ).toEqual(["schedule", "calendar", "calendar", "schedule"]);
});
