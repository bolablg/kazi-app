// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AgendaSettings } from "../src/AgendaSettings";
import { seedState, DEMO_USER } from "../shared/fixtures";
const data = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../src/data", () => ({ useData: () => data.current }));
vi.mock("../src/components", () => ({
  useUI: () => ({
    run: async (operation: () => Promise<unknown>) => operation(),
  }),
}));
afterEach(cleanup);
it("team switching clears a displayed private link and ignores a link created in the previous scope", async () => {
  const state = seedState();
  let resolve!: (value: { url: string }) => void;
  const agenda = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ url: "https://calendar.example.test/current.ics" });
  data.current = {
    state,
    actorId: DEMO_USER,
    teamId: "all",
    teams: [{ ...state.workspace }],
    online: true,
    demo: false,
    feeds: [],
    agenda,
    calendar: vi.fn(),
    dispatch: vi.fn(),
  };
  const view = () => (
    <MemoryRouter>
      <AgendaSettings />
    </MemoryRouter>
  );
  const mounted = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Create calendar link" }));
  data.current = { ...data.current, teamId: state.workspace.id };
  mounted.rerender(view());
  await act(async () => {
    resolve({ url: "https://calendar.example.test/previous.ics" });
  });
  expect(
    screen.queryByLabelText("Private calendar subscription URL"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create calendar link" }));
  const input = await screen.findByLabelText(
    "Private calendar subscription URL",
  );
  expect((input as HTMLInputElement).value).toBe(
    "https://calendar.example.test/current.ics",
  );
  data.current = { ...data.current, teamId: "all" };
  mounted.rerender(view());
  expect(
    screen.queryByLabelText("Private calendar subscription URL"),
  ).toBeNull();
});
