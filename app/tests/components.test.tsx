// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider } from "../src/data";
import { UIProvider, TaskForm } from "../src/components";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});
it("accessible capture needs no calendar, project creation or AI key", async () => {
  render(
    <MemoryRouter>
      <DemoProvider>
        <UIProvider>
          <TaskForm open onClose={() => {}} />
        </UIProvider>
      </DemoProvider>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("What needs to get done?"), {
    target: { value: "First meaningful step" },
  });
  expect(screen.getByRole("button", { name: "Create task" })).toBeTruthy();
  expect(screen.getByLabelText("Project")).toBeTruthy();
  expect(
    (screen.getByLabelText("Initial stage") as HTMLSelectElement).value,
  ).toBe("backlog");
  expect(
    screen.getByRole("dialog").getAttribute("aria-describedby"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  expect(
    await screen.findByText("Task captured. One less thing to remember."),
  ).toBeTruthy();
});
