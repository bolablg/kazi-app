// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { InfoTip } from "../src/InfoTip";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("opens on hover or keyboard focus and closes without swallowing unrelated keys", () => {
  vi.useFakeTimers();
  render(
    <InfoTip label="About cycle time">
      Elapsed time, including waiting.
    </InfoTip>,
  );
  const button = screen.getByRole("button", { name: "About cycle time" });
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip").textContent).toContain(
    "including waiting",
  );
  fireEvent.mouseLeave(button);
  act(() => vi.advanceTimersByTime(150));
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip").id).toBe(
    button.getAttribute("aria-describedby"),
  );
  fireEvent.keyDown(button, { key: "ArrowDown" });
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("pins by click for touch, dismisses outside, and never submits a containing form", () => {
  const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <form onSubmit={submit}>
      <InfoTip label="About filters">Filters apply to all views.</InfoTip>
      <input aria-label="Name" />
    </form>,
  );
  const button = screen.getByRole("button", { name: "About filters" });
  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  fireEvent.mouseLeave(button);
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.pointerDown(screen.getByRole("textbox"));
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
