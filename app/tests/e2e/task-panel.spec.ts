import { choosePerson } from "./task-fields";
import { chooseStatus } from "./task-fields";
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/tasks?view=board");
  await expect(page.locator(".board-task").first()).toBeVisible();
});

test("board columns scroll independently and show worker avatars without full names", async ({
  page,
}) => {
  await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2",
      state = JSON.parse(localStorage.getItem(key)!);
    const template = state.tasks.find((task: any) => task.status === "todo");
    for (let i = 0; i < 12; i++)
      state.tasks.push({
        ...template,
        id: crypto.randomUUID().replaceAll("-", ""),
        title: `Scroll sample ${i}`,
        dependencies: [],
        parentId: undefined,
      });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const column = page.getByRole("region", {
    name: "To do column",
    exact: true,
  });
  await expect(
    column.getByRole("button", { name: "Scroll sample 11", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".board-card-actions")).toHaveCount(0);
  await expect(page.locator(".board-task select")).toHaveCount(0);
  await expect(column.locator(".board-column-cards")).toHaveCSS(
    "scrollbar-width",
    "thin",
  );
  const bounds = await column
    .locator(".board-column-cards")
    .evaluate((element) => ({
      height: element.clientHeight,
      total: element.scrollHeight,
      overflow: getComputedStyle(element).overflowY,
    }));
  expect(bounds.total).toBeGreaterThan(bounds.height * 2);
  expect(bounds.height).toBeLessThan(650);
  expect(bounds.overflow).toBe("auto");
  await expect(column.locator(".board-owner .avatar").first()).toBeVisible();
  expect(
    await column.locator(".board-owner").first().innerText(),
  ).not.toContain("Amira Chen");
  await column
    .locator(".board-column-cards")
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(column.locator(".board-task-open").last()).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("full-page task puts description before details, saves changes, and closes to Tasks", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const title = "Review the onboarding flow";
  await page.evaluate((title) => {
    const key = "kazi.synthetic-demo.v2",
      state = JSON.parse(localStorage.getItem(key)!);
    const task = state.tasks.find((task: any) => task.title === title),
      others = state.tasks
        .filter(
          (item: any) =>
            item.projectId === task.projectId && item.id !== task.id,
        )
        .slice(0, 3);
    ["done", "in_progress", "todo"].forEach(
      (status, index) => (others[index].status = status),
    );
    task.dependencies = others.map((item: any) => item.id);
    task.collaborators = [];
    localStorage.setItem(key, JSON.stringify(state));
  }, title);
  await page.reload();
  await page.getByRole("button", { name: title, exact: true }).click();
  const panel = page.getByRole("article", { name: "Task details" });
  await expect(panel).toHaveClass(/task-page/);
  await expect(page.locator(".board")).toHaveCount(0);
  const description = panel.getByLabel("Task description", { exact: true });
  await description.fill(
    "Review the first-run experience and capture any unclear steps.",
  );
  expect(
    await description.evaluate(
      (element) =>
        !!(
          element.compareDocumentPosition(
            document.querySelector('[aria-label="Task status"]')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  const box = await panel.boundingBox(),
    viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width - viewport.width)).toBeLessThanOrEqual(
    12,
  );
  expect(box!.width).toBeGreaterThan(viewport.width * 0.75);
  await expect(panel.getByLabel("Owner", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Worker", { exact: true })).toBeVisible();
  for (const signal of ["complete", "underway", "waiting"])
    await expect(panel.locator(`.dependency-node.${signal}`)).toHaveCount(1);
  await choosePerson(page, "Collaborators", "Daniel Okafor");
  await expect(panel.locator(".person-chip")).toContainText("Daniel");
  await panel
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/tasks\?view=board$/);
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(panel.locator(".person-chip")).toContainText("Daniel");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const mobile = await panel.boundingBox();
  expect(mobile!.width).toBeGreaterThan(375);
  expect(mobile!.x).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".main-scroll")
    .evaluate((element) => (element.scrollTop = 0));
  await page.screenshot({
    path: "../docs/screenshots/task-full-page.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test("review actions update the full-page status without submitting stale task fields", async ({
  page,
}) => {
  const title = "Review the onboarding flow";
  await page.evaluate((title) => {
    const key = "kazi.synthetic-demo.v2",
      state = JSON.parse(localStorage.getItem(key)!);
    const task = state.tasks.find((task: any) => task.title === title);
    task.status = "to_validate";
    task.ownerId = "demo-you";
    task.assigneeId = "demo-daniel";
    localStorage.setItem(key, JSON.stringify(state));
  }, title);
  await page.reload();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .getByLabel("Reason for returning", { exact: true })
    .fill("Check keyboard navigation before approval");
  await page
    .getByRole("button", { name: "Return for changes", exact: true })
    .click();
  await expect(page.getByLabel("Task status", { exact: true })).toHaveText(
    "In progress",
  );
  await chooseStatus(page, "to_validate");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve & complete", exact: true })
    .click();
  await expect(page.getByLabel("Task status", { exact: true })).toHaveText(
    "Completed",
  );
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Completed column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
});
