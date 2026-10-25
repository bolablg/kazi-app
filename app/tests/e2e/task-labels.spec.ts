import { test, expect } from "@playwright/test";

test("colored task tags persist across lists, boards, details, and calendar agendas without a project legend", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/projects");
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const title = "Map customer research";
  await dialog.getByLabel("What needs to get done?").fill(title);
  await dialog
    .getByLabel("Task tags", { exact: true })
    .fill("Research, Design, research");
  await expect(dialog.locator(".label-token")).toHaveCount(2);
  await dialog.getByLabel(/^Deadline/).fill("2026-10-26");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const task = page.getByRole("button", { name: title, exact: true });
  await expect(task.locator(".task-label", { hasText: "Research" })).toHaveCSS(
    "background-color",
    "rgb(210, 227, 252)",
  );
  await expect(task.locator(".task-label", { hasText: "Design" })).toHaveCSS(
    "background-color",
    "rgb(231, 215, 250)",
  );
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "To do column", exact: true }),
  ).toBeVisible();
  await expect(task.locator(".task-label", { hasText: "Research" })).toHaveCSS(
    "background-color",
    "rgb(210, 227, 252)",
  );
  await task.scrollIntoViewIfNeeded();
  await expect(
    task.locator(".task-label", { hasText: "Research" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/task-labels-board.png",
  });
  await task.click();
  dialog = page.getByRole("article", { name: "Task details" });
  await expect(dialog.locator(".label-token")).toHaveText([
    "Research",
    "Design",
  ]);
  await dialog
    .getByRole("button", { name: "Remove Research tag", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remove Design tag", exact: true })
    .click();
  await dialog.getByLabel("Task tags", { exact: true }).fill("Meeting, Admin");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await page.reload();
  await expect(task.locator(".task-label", { hasText: "Admin" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Tasks", exact: true })
    .click();
  await page.getByLabel("Filter by tag").selectOption({ label: "Admin" });
  await expect(page).toHaveURL(/tag=admin/);
  const legacy = new URL(page.url());
  legacy.searchParams.delete("tag");
  legacy.searchParams.set("label", "admin");
  await page.goto(legacy.toString());
  await expect(page.getByLabel("Filter by tag")).toHaveValue("admin");
  await expect(task).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Refine the homepage direction",
      exact: true,
    }),
  ).toHaveCount(0);
  await task.click();
  await page
    .getByRole("button", { name: "Remove Meeting tag", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Admin tag", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(page.getByLabel("Filter by tag")).toHaveValue("all");
  await expect(task.locator(".task-label")).toHaveCount(0);
  await task.click();
  await page
    .getByRole("article", { name: "Task details" })
    .getByLabel("Task tags", { exact: true })
    .fill("Research");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  for (const range of ["month", "week", "day"]) {
    await page.goto(`/calendar?view=calendar&range=${range}`);
    await expect(
      page.getByLabel("Project colors", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Calendar project", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.locator(".selected-day-agenda .task-label", { hasText: "Research" }),
  ).toHaveCSS("background-color", "rgb(210, 227, 252)");
  await page
    .getByLabel("Calendar project", { exact: true })
    .selectOption({ label: "Cloud certification" });
  await expect(page.locator(".selected-day-agenda")).not.toContainText(title);
  await page
    .getByLabel("Calendar project", { exact: true })
    .selectOption({ label: "Website launch" });
  await expect(page.locator(".selected-day-agenda")).toContainText(title);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".selected-day-agenda").scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/task-labels-calendar-phone.png",
  });
});
