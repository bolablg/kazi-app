// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AgendaSettings } from "../src/AgendaSettings";
import { ConvexError } from "convex/values";
import { seedState, DEMO_USER } from "../shared/fixtures";
const data = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../src/data", () => ({ useData: () => data.current }));
vi.mock("../src/components", () => ({
  useUI: () => ({
    run: async (operation: () => Promise<unknown>) =>
      operation().catch(() => undefined),
  }),
}));
afterEach(cleanup);
it("keeps a readable Google setup error visible and permits retry", async () => {
  const state = seedState();
  const message =
    "Google Calendar setup is incomplete. The app administrator needs to configure Google Calendar before you can connect.";
  const calendar = vi.fn().mockRejectedValue(new ConvexError(message));
  data.current = {
    state,
    actorId: DEMO_USER,
    teamId: "all",
    teams: [state.workspace],
    online: true,
    demo: false,
    feeds: [],
    calendar,
  };
  render(
    <MemoryRouter>
      <AgendaSettings view="availability" />
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Connect Google availability" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(
    screen.getByRole("button", { name: "Connect Google availability" }),
  ).toBeEnabled();
  expect(calendar).toHaveBeenCalledWith("connect");
});

it.each(["connected", "error"])(
  "explains Google callback result %s in the availability tab",
  (result) => {
    const state = seedState();
    data.current = {
      state,
      actorId: DEMO_USER,
      teamId: "all",
      teams: [state.workspace],
      online: true,
      demo: false,
      feeds: [],
      calendar: vi.fn(),
    };
    render(
      <MemoryRouter
        initialEntries={[`/connections?tab=calendar&calendar=${result}`]}
      >
        <AgendaSettings view="availability" />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole(result === "connected" ? "status" : "alert"),
    ).toHaveTextContent(
      result === "connected"
        ? "Google Calendar connected"
        : "Google Calendar could not connect",
    );
  },
);
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
