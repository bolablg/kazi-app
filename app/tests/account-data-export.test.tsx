// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AccountDataExportButton } from "../src/AccountDataExport";
const model = vi.hoisted(() => ({
  identity: null as object | null,
  data: { workspaceId: "synthetic-workspace", demo: false, local: false },
  query: vi.fn(),
}));
vi.mock("../src/IdentityScreens", () => ({
  useAccountIdentity: () => model.identity,
}));
vi.mock("../src/data", () => ({ useData: () => model.data }));
vi.mock("convex/react", () => ({ useConvex: () => ({ query: model.query }) }));
beforeEach(() => {
  model.identity = null;
  model.data = {
    workspaceId: "synthetic-workspace",
    demo: false,
    local: false,
  };
  model.query.mockReset();
});
afterEach(cleanup);
it.each(["legacy", "demo", "local"])(
  "preserves %s export without querying shared-account APIs",
  (mode) => {
    model.identity = mode === "legacy" ? null : {};
    model.data.demo = mode === "demo";
    model.data.local = mode === "local";
    const onExport = vi.fn();
    render(<AccountDataExportButton onExport={onExport} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Export my data" }));
    expect(onExport).toHaveBeenCalledWith();
    expect(model.query).not.toHaveBeenCalled();
  },
);
it("requests only the authenticated owner's metadata on explicit export, preserving client team data", async () => {
  model.identity = {};
  const accountIdentity = {
    canonicalActorId: "canonical-owner",
    environment: "development",
    identities: [],
    serviceActivations: [],
  };
  model.query.mockResolvedValue({
    accountIdentity,
    data: { serverWorkspace: "not-used-to-replace-current-team-state" },
  });
  const onExport = vi.fn();
  render(<AccountDataExportButton onExport={onExport} onError={vi.fn()} />);
  expect(model.query).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Export my data" }));
  await waitFor(() => expect(onExport).toHaveBeenCalledWith(accountIdentity));
  expect(model.query.mock.calls[0][1]).toEqual({
    workspaceId: "synthetic-workspace",
  });
});
it("fails an incomplete shared-account export instead of silently dropping metadata", async () => {
  model.identity = {};
  model.query.mockResolvedValue({});
  const onExport = vi.fn(),
    onError = vi.fn();
  render(<AccountDataExportButton onExport={onExport} onError={onError} />);
  fireEvent.click(screen.getByRole("button", { name: "Export my data" }));
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
  expect(onExport).not.toHaveBeenCalled();
});
