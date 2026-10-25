// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TaskForm, UIProvider } from "../src/components";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { mergeTeamStates } from "../shared/teams";
const data = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../src/data", () => ({ useData: () => data.current }));
afterEach(cleanup);
it("creates personal work in its own team even while the page is filtered to a shared team", async () => {
  const team = fixtureState(),
    personal = fixtureState();
  personal.workspace = {
    ...personal.workspace,
    id: "personal",
    kind: "personal",
    inboxId: "personal-inbox",
  };
  personal.members = [personal.members[0]];
  personal.projects = [
    { ...personal.projects[0], id: "personal-inbox", memberIds: [DEMO_USER] },
  ];
  personal.tasks = [];
  const entries = [
    { id: "shared", state: team },
    { id: "personal", state: personal },
  ];
  const dispatch = vi.fn().mockResolvedValue("new-task"),
    onClose = vi.fn();
  data.current = {
    state: mergeTeamStates(entries.slice(0, 1), DEMO_USER),
    captureState: mergeTeamStates(entries, DEMO_USER),
    actorId: DEMO_USER,
    teams: entries.map(({ id, state }) => ({ ...state.workspace, id })),
    teamId: "shared",
    online: true,
    dispatch,
  };
  render(
    <UIProvider>
      <TaskForm open onClose={onClose} />
    </UIProvider>,
  );
  const scope = screen.getByLabelText("Task belongs to") as HTMLSelectElement;
  expect(scope.value).toBe("shared");
  fireEvent.change(screen.getByRole("combobox", { name: "Owner" }), {
    target: { value: "amira" },
  });
  fireEvent.click(screen.getByRole("option", { name: /Amira Chen/ }));
  fireEvent.change(scope, { target: { value: "personal" } });
  const owner = screen.getByRole("combobox", {
    name: "Owner",
  }) as HTMLInputElement;
  expect(owner.value).toBe("Alex Morgan");
  fireEvent.change(owner, { target: { value: "amira" } });
  expect(screen.queryByRole("option", { name: /Amira Chen/ })).toBeNull();
  fireEvent.blur(owner);
  fireEvent.change(screen.getByLabelText("What needs to get done?"), {
    target: { value: "Personal capture" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "create_task",
      projectId: "personal-inbox",
      ownerId: DEMO_USER,
      assigneeId: DEMO_USER,
      collaborators: [],
    }),
    { teamId: "personal" },
  );
});
