import { test, expect } from "@playwright/test";
import { choosePriority, chooseStatus } from "./task-fields";

test("task activity, subtask navigation, tag tokens, and keyboard menus work together", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await page
    .getByRole("button", { name: "Refine the homepage direction", exact: true })
    .click();
  const task = page.getByRole("article", { name: "Task details" });
  const priority = page.getByRole("combobox", {
    name: "Priority",
    exact: true,
  });
  await expect(priority).toBeEnabled();
  await priority.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("listbox", { name: "Priority options", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Low", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(priority).toHaveText("Low");
  await priority.click();
  await page.keyboard.press("Escape");
  await expect(task).toBeVisible();
  await expect(priority).toHaveAttribute("aria-expanded", "false");
  const labels = task.getByLabel("Task tags", { exact: true });
  await labels.fill("Research,Design,");
  await expect(task.locator(".label-token")).toHaveText(["Research", "Design"]);
  await task
    .getByRole("button", { name: "Remove Research tag", exact: true })
    .click();
  await labels.fill("Review");
  await labels.press("Enter");
  await expect(task.locator(".label-token")).toHaveText(["Design", "Review"]);
  await task.getByRole("button", { name: "Save changes", exact: true }).click();
  await task.getByRole("button", { name: "Add subtask", exact: true }).click();
  const form = page.getByRole("dialog");
  await choosePriority(page, "high");
  await form
    .getByLabel("What needs to get done?")
    .fill("Verify the acceptance checks");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  const child = task
    .locator(".subtask-row")
    .filter({ hasText: "Verify the acceptance checks" });
  await expect(child).toBeVisible();
  expect(
    await task
      .locator(".task-description")
      .evaluate((description) =>
        Boolean(
          description.compareDocumentPosition(
            document.querySelector(".task-subtasks")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  await child.click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "Verify the acceptance checks",
  );
  await page
    .getByRole("button", { name: "Open parent task", exact: true })
    .click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    "Refine the homepage direction",
  );
  await expect(task.locator(".label-token")).toHaveText(["Design", "Review"]);
  const activity = task.getByRole("region", {
    name: "Task activity",
    exact: true,
  });
  await activity
    .getByLabel("Add a comment")
    .fill("Please review the acceptance checks.");
  await activity
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await chooseStatus(page, "to_validate");
  await task.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    activity
      .locator(".activity-status-update")
      .filter({ hasText: "To validate" }),
  ).toHaveCount(1);
  await expect(
    activity.getByText("Please review the acceptance checks.", { exact: true }),
  ).toHaveCount(1);
  await expect(task.getByRole("tab")).toHaveCount(0);
  await expect(
    task.getByText("Progress check-in", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Task status", exact: true }),
  ).toHaveText("To validate");
  await expect(
    page
      .getByRole("region", { name: "Task activity" })
      .getByText("Please review the acceptance checks.", { exact: true }),
  ).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('14px "Atlassian Sans"')),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".task-title-input").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/task-refined-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("region", { name: "Task activity" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/task-refined-activity-phone.png",
    animations: "disabled",
  });
});

test("workflow reports switch between calendar and working-period durations", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-26T18:00:00Z") });
  await page.goto("/insights");
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  const calendar = page.getByRole("button", {
    name: "Calendar time",
    exact: true,
  });
  const working = page.getByRole("button", {
    name: "Working time",
    exact: true,
  });
  await expect(calendar).toHaveAttribute("aria-pressed", "true");
  await working.click();
  await expect(working).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(/Only time within your working calendar:/),
  ).toContainText("America/Chicago");
  await expect(
    page.getByRole("columnheader", { name: "Average duration", exact: true }),
  ).toBeVisible();
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-pressed", "true");
});
