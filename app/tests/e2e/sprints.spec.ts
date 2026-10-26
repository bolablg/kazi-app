import { test, expect } from "@playwright/test";
import { seedState, DEMO_USER } from "../../shared/fixtures";

const now = Date.parse("2026-10-26T13:00:00Z");
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(now) });
  const state = seedState(now),
    template = state.tasks[0];
  state.tasks = state.tasks.slice(0, 2).map((task, index) => ({
    ...template,
    id: task.id,
    projectId: state.workspace.inboxId,
    title: index ? "Verify first shared task" : "Invite a colleague",
    ownerId: DEMO_USER,
    assigneeId: DEMO_USER,
    status: index ? "to_validate" : "todo",
    dependencies: [],
    parentId: undefined,
    startDate: undefined,
    deadline: "2026-11-08",
    estimatedMinutes: 60,
    remainingMinutes: 60,
  }));
  state.workspace.name = "Platform";
  state.proposals = [];
  state.versions = [];
  state.iterations = [];
  state.attempts = [];
  state.busy = [];
  await page.addInitScript((value) => {
    if (!localStorage.getItem("sprint-e2e-initialized")) {
      localStorage.setItem("kazi.synthetic-demo.v2", JSON.stringify(value));
      localStorage.setItem("sprint-e2e-initialized", "yes");
    }
  }, state);
  await page.goto("/sprints");
});

test("plans multiple objectives on a full page, schedules once, and preserves per-objective closeout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "New sprint", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/new$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Platform - Sprint - W44", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Objective 1", { exact: true })
    .fill("A colleague can join");
  await page
    .getByLabel("Success criteria for objective 1")
    .fill("Invitation accepted with correct access");
  await page.getByRole("checkbox", { name: /Invite a colleague/ }).check();
  await page
    .getByRole("button", { name: "Add objective", exact: true })
    .click();
  await page
    .getByLabel("Objective 2", { exact: true })
    .fill("A team can complete its first shared task");
  await page
    .getByRole("checkbox", { name: /Verify first shared task/ })
    .check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+\/edit$/);
  await page.reload();
  await expect(page.getByLabel("Objective 2", { exact: true })).toHaveValue(
    "A team can complete its first shared task",
  );
  await page.screenshot({
    path: "/tmp/kazi-sprint-planner-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Preview calendar plan", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", {
      name: "Review sprint plan: Platform - Sprint - W44",
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Approve and schedule", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Back to my plans" }).click();
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+$/);
  const sprintUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "A colleague can join", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "A team can complete its first shared task",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Filter sprint work by objective")
    .selectOption({ label: "A colleague can join" });
  await expect(
    page.getByRole("button", {
      name: /Verify first shared task/,
      exact: false,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Filter sprint work by objective").selectOption("all");
  await page.goto("/sprints/new");
  await page.getByLabel("Start date", { exact: true }).fill("2026-11-09");
  await page.getByLabel("End date", { exact: true }).fill("2026-11-22");
  await page
    .getByLabel("Objective 1", { exact: true })
    .fill("Finish accepting the invitation flow");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Platform - Sprint - W46", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sprints\/[^/]+\/edit$/);
  await page.goto(sprintUrl);
  await page.getByRole("button", { name: "Close sprint", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Outcome for objective 1").selectOption("achieved");
  await dialog.getByLabel("Outcome for objective 2").selectOption("partial");
  await dialog
    .getByLabel("Note for objective 1")
    .fill("A colleague joined successfully");
  await dialog
    .getByLabel(/Closeout note/)
    .fill("Invitation works; acceptance needs another review");
  await dialog
    .getByLabel("Next step for Invite a colleague")
    .selectOption("backlog");
  await dialog
    .getByLabel("Next step for Verify first shared task")
    .selectOption({ label: "Move to Platform - Sprint - W46" });
  await dialog
    .getByRole("button", { name: "Close sprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 objectives reviewed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Returned to Backlog", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Moved to Platform - Sprint - W46", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "2 objectives reviewed", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(stored.tasks).toHaveLength(2);
  expect(stored.versions).toHaveLength(1);
  expect(stored.versions[0].inputs.sprintObjectives).toHaveLength(2);
  expect(stored.versions[0].sessions).toHaveLength(1);
  expect(stored.sprints[0].closeout.outcome).toBeUndefined();
  expect(
    stored.sprints[0].closeout.objectives.map(
      (objective: { outcome: string }) => objective.outcome,
    ),
  ).toEqual(["achieved", "partial"]);
  expect(stored.sprints[1].taskIds).toEqual([stored.tasks[1].id]);
  expect(stored.sprints[1].objectiveAssignments).toEqual({});
  expect(stored.tasks[0].status).toBe("backlog");
  expect(stored.sprints[0].closeout.tasks[0].status).toBe("todo");
  await page.screenshot({
    path: "/tmp/kazi-sprint-closeout-desktop.png",
    fullPage: true,
  });
});

test("mobile planning saves a resumable draft and retains current-sprint task navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "New sprint", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Objective 1", { exact: true })
    .fill("Invite a colleague with confidence");
  await page.getByLabel("Find existing tasks", { exact: true }).fill("Invite");
  await page.getByRole("checkbox", { name: /Invite a colleague/ }).check();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/kazi-sprint-planner-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+\/edit$/);
  await page.reload();
  await expect(page.getByLabel("Objective 1", { exact: true })).toHaveValue(
    "Invite a colleague with confidence",
  );
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Sprint objectives" }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("link", { name: /Current sprint · Platform - Sprint - W44/ })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Invite a colleague", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to sprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Platform - Sprint - W44", exact: true }),
  ).toBeVisible();
});

test("personal sprint names follow the start ISO week across year boundaries", async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!);
    state.workspace.kind = "personal";
    state.workspace.name = "Private space";
    localStorage.setItem("kazi.synthetic-demo.v2", JSON.stringify(state));
  });
  await page.goto("/sprints/new");
  await page.getByLabel("Start date", { exact: true }).fill("2025-12-29");
  await page.getByLabel("End date", { exact: true }).fill("2026-01-11");
  await expect(
    page.getByRole("heading", { name: "Perso - Sprint - W01", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+\/edit$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Perso - Sprint - W01", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(stored.sprints[0]).toMatchObject({
    title: "Perso - Sprint - W01",
    startDate: "2025-12-29",
    automaticName: true,
    status: "planned",
  });
});

test("starting a sprint promotes selected Backlog work in the shared Tasks board", async ({
  page,
}) => {
  await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.tasks[0].status = "backlog";
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "New sprint", exact: true }).click();
  await page
    .getByLabel("Objective 1", { exact: true })
    .fill("Commit the selected backlog work");
  await page.getByRole("checkbox", { name: /Invite a colleague/ }).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+\/edit$/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).tasks[0]
          .status,
    ),
  ).toBe("backlog");
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(page).toHaveURL(/\/sprints\/[^/]+$/);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "To do column", exact: true })
      .getByRole("button", { name: "Invite a colleague", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Backlog column", exact: true })
      .getByRole("button", { name: "Invite a colleague", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "To do column", exact: true })
      .getByRole("button", { name: "Invite a colleague", exact: true }),
  ).toBeVisible();
});
