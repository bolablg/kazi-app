// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { McpSettings } from "../src/ConnectionsPages";
import { UIProvider } from "../src/components";

const commands = vi.hoisted(() => ({ mintToken: vi.fn(), writeText: vi.fn() }));
vi.mock("../src/data", () => ({
  useData: () => ({
    demo: false,
    online: true,
    tokens: [],
    mcpActivity: [],
    mintToken: commands.mintToken,
  }),
}));
vi.mock("../src/components", async (load) => ({
  ...(await load<typeof import("../src/components")>()),
  Modal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: commands.writeText },
  });
  commands.writeText.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  commands.mintToken.mockReset();
  commands.writeText.mockReset();
});
function setup() {
  render(
    <MemoryRouter>
      <UIProvider>
        <McpSettings />
      </UIProvider>
    </MemoryRouter>,
  );
}

it("copies a placeholder guide without minting a key", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Copy setup guide" }));
  await waitFor(() => expect(commands.writeText).toHaveBeenCalledOnce());
  expect(commands.writeText.mock.calls[0][0]).toContain("YOUR_KAZI_TOKEN");
  expect(commands.mintToken).not.toHaveBeenCalled();
});
it("copies a newly issued setup pack and forgets its secret when closed", async () => {
  commands.mintToken.mockResolvedValueOnce("SYNTHETIC_UI_TEST_KEY");
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  fireEvent.change(screen.getByLabelText("Connection name"), {
    target: { value: "Test client" },
  });
  fireEvent.click(screen.getByLabelText(/Create, edit, move, archive/));
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  await screen.findByRole("button", { name: "Copy agent setup" });
  expect(commands.mintToken).toHaveBeenCalledWith("Test client", [
    "read",
    "tasks:write",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Copy agent setup" }));
  await waitFor(() => expect(commands.writeText).toHaveBeenCalledOnce());
  expect(commands.writeText.mock.calls[0][0]).toContain(
    "Bearer SYNTHETIC_UI_TEST_KEY",
  );
  expect(screen.getByLabelText("New MCP token").getAttribute("type")).toBe(
    "password",
  );
  fireEvent.click(screen.getByRole("button", { name: "Show token" }));
  expect(screen.getByLabelText("New MCP token").getAttribute("type")).toBe(
    "text",
  );
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByDisplayValue("SYNTHETIC_UI_TEST_KEY")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy setup guide" }));
  expect(commands.writeText.mock.calls.at(-1)![0]).not.toContain(
    "SYNTHETIC_UI_TEST_KEY",
  );
});
it("keeps the credential form usable after a failed issue request", async () => {
  commands.mintToken.mockRejectedValueOnce(
    new Error("Connection could not be created"),
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  fireEvent.change(screen.getByLabelText("Connection name"), {
    target: { value: "Retry client" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Copy agent setup" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Create credential" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(commands.writeText).not.toHaveBeenCalled();
});

it("ignores a credential response after its dialog has been closed", async () => {
  let resolve!: (value: string) => void;
  commands.mintToken.mockReturnValueOnce(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  fireEvent.change(screen.getByLabelText("Connection name"), {
    target: { value: "Slow client" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  await act(async () => resolve("SYNTHETIC_LATE_KEY"));
  expect(screen.queryByRole("button", { name: "Copy agent setup" })).toBeNull();
  expect(screen.queryByDisplayValue("SYNTHETIC_LATE_KEY")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Create credential" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

it("reports clipboard failure inline and allows retry without losing the issued key", async () => {
  commands.mintToken.mockResolvedValueOnce("SYNTHETIC_COPY_RETRY_KEY");
  commands.writeText.mockRejectedValueOnce(new Error("Permission denied"));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
  fireEvent.change(screen.getByLabelText("Connection name"), {
    target: { value: "Clipboard client" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
  const copy = await screen.findByRole("button", { name: "Copy agent setup" });
  fireEvent.click(copy);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Copy failed",
  );
  expect(screen.getByLabelText("New MCP token").getAttribute("type")).toBe(
    "password",
  );
  fireEvent.click(copy);
  expect((await screen.findByRole("status")).textContent).toContain(
    "Agent setup copied",
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(commands.writeText).toHaveBeenCalledTimes(2);
});
