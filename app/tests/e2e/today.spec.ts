import { test, expect } from "@playwright/test";
import { chooseStatus } from "./task-fields";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/");
});

test("Today is the default and keyboard tabs preserve explicit calendar and schedule views", async ({
  page,
}) => {
  const today = page.getByRole("tab", { name: "Today", exact: true });
  const calendar = page.getByRole("tab", { name: "Calendar", exact: true });
  const schedule = page.getByRole("tab", { name: "Schedule", exact: true });
  await expect(today).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Calendar range" })).toHaveCount(
    0,
  );
  await today.press("ArrowRight");
  await expect(calendar).toBeFocused();
  await expect(
    page.getByRole("table", { name: "Monthly work calendar" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Calendar range" })
    .getByRole("button", { name: "Week", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Weekly work calendar" }),
  ).toBeVisible();
  await calendar.press("End");
  await expect(schedule).toBeFocused();
  await expect(page).toHaveURL(/view=schedule/);
  await page.reload();
  await expect(schedule).toHaveAttribute("aria-selected", "true");
  await schedule.press("Home");
  await expect(today).toBeFocused();
  await page.reload();
  await expect(today).toHaveAttribute("aria-selected", "true");
  await calendar.click();
  await expect(
    page.getByRole("region", { name: "Weekly work calendar" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(today).toHaveAttribute("aria-selected", "true");
});

test("owner validation appears with My work even for another worker and recent activity links to the same task", async ({
  page,
}) => {
  const title = "Review the launch handoff";
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("What needs to get done?").fill(title);
  await form
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Website launch" });
  await form.getByLabel("Worker", { exact: true }).selectOption("demo-amira");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form).toBeHidden();
  await page.goto("/tasks");
  await page.getByRole("button", { name: title, exact: true }).click();
  await chooseStatus(page, "to_validate");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  const taskUrl = page.url();
  const message = "The handoff is ready for the owner's decision.";
  await page.getByLabel("Add a comment", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Task activity" })
      .getByText(message, { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Overview assignee")).toHaveValue("demo-you");
  const attention = page.getByRole("region", { name: /^Needs attention/ });
  await page
    .getByRole("group", { name: "Attention filters" })
    .getByRole("button", { name: "To validate", exact: true })
    .click();
  await expect(
    attention.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: /^My focus/ })
      .getByRole("button", { name: title, exact: true }),
  ).toHaveCount(0);
  const activity = page.getByRole("region", {
    name: "Recent activity",
    exact: true,
  });
  await expect(activity.getByText(message, { exact: true })).toBeVisible();
  await activity.getByRole("button").filter({ hasText: message }).click();
  await expect(page).toHaveURL(taskUrl);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    title,
  );
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Today", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("Today favorites share existing stars and project filters scope the daily snapshot", async ({
  page,
}) => {
  const projects = page.getByRole("region", { name: "Projects", exact: true });
  const shortcuts = page.getByRole("group", { name: "Project shortcuts" });
  await shortcuts
    .getByRole("button", { name: "Favorites", exact: true })
    .click();
  await expect(
    projects.getByText("Keep your favorites close.", { exact: true }),
  ).toBeVisible();
  await shortcuts.getByRole("button", { name: "Recent", exact: true }).click();
  await projects
    .getByRole("button", { name: "Favorite Website launch", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page
      .locator("#favorite-projects")
      .getByRole("link", { name: "Website launch", exact: true }),
  ).toBeVisible();
  await shortcuts
    .getByRole("button", { name: "Favorites", exact: true })
    .click();
  const website = projects.getByRole("link", {
    name: "Website launch",
    exact: true,
  });
  await expect(website).toHaveAttribute("href", /\/project\/[a-f0-9]{32}$/);
  await expect(
    projects.getByRole("link", { name: "Brand handbook", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    shortcuts.getByRole("button", { name: "Favorites", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await projects
    .getByRole("button", { name: "Unfavorite Website launch", exact: true })
    .click();
  await expect(
    projects.getByText("Keep your favorites close.", { exact: true }),
  ).toBeVisible();
  await shortcuts.getByRole("button", { name: "Recent", exact: true }).click();
  await page
    .getByLabel("Overview project", { exact: true })
    .selectOption({ label: "Cloud certification" });
  await expect(
    projects.getByRole("link", { name: "Cloud certification", exact: true }),
  ).toBeVisible();
  await expect(
    projects.getByRole("link", { name: "Website launch", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: /^Needs attention/ }).getByRole("button", {
      name: "Refine the homepage direction",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^My focus/ })).toContainText(
    "Practice networking fundamentals",
  );
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    page
      .getByLabel("Overview project", { exact: true })
      .locator("option:checked"),
  ).toHaveText("Cloud certification");
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await website.waitFor({ state: "hidden" });
  await projects
    .getByRole("link", { name: "Cloud certification", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9]{32}$/);
  await expect(
    page.getByRole("heading", { name: "Cloud certification", exact: true }),
  ).toBeVisible();
});
