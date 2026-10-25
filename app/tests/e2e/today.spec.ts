import { choosePerson } from "./task-fields";
import { test, expect } from "@playwright/test";
import { chooseStatus } from "./task-fields";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/");
});

test("Overview is the daily dashboard and Calendar tabs preserve range, keyboard navigation, and history", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Calendar range" })).toHaveCount(
    0,
  );
  await nav.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  const calendar = page.getByRole("tab", { name: "Calendar", exact: true });
  const schedule = page.getByRole("tab", { name: "Schedule", exact: true });
  await expect(calendar).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tablist", { name: "Calendar views" }).getByRole("tab"),
  ).toHaveCount(2);
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
  await calendar.press("ArrowRight");
  await expect(schedule).toBeFocused();
  await expect(page).toHaveURL(/\/calendar\?view=schedule&range=week$/);
  await page.reload();
  await expect(schedule).toHaveAttribute("aria-selected", "true");
  await schedule.press("Home");
  await expect(calendar).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Weekly work calendar" }),
  ).toBeVisible();
  await calendar.press("End");
  await expect(schedule).toBeFocused();
  await schedule.press("ArrowRight");
  await expect(calendar).toBeFocused();
  await nav.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Weekly work calendar" }),
  ).toBeVisible();
});

test("old calendar and reports bookmarks redirect without dropping views, filters, or history", async ({
  page,
}) => {
  for (const view of ["calendar", "schedule"]) {
    await page.goto("/");
    await page.goto(`/?view=${view}&range=week&person=all#agenda`);
    await expect(page).toHaveURL(
      new RegExp(`/calendar\\?view=${view}&range=week&person=all#agenda$`),
    );
    await expect(
      page.getByRole("tab", {
        name: view === "calendar" ? "Calendar" : "Schedule",
        exact: true,
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Calendar assignee")).toHaveValue("all");
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/reports?tab=Workflow&person=all#history");
  await expect(page).toHaveURL(/\/insights\?tab=Workflow&person=all#history$/);
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Workflow", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Insights person")).toHaveValue("all");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    nav.getByRole("link", { name: "Insights", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Reports", exact: true }),
  ).toHaveCount(0);
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
  await choosePerson(page, "Worker", "Amira Chen");
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
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
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
      .locator("#favorite-items")
      .getByRole("link", { name: "Website launch Project", exact: true }),
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
  await page.reload();
  await expect(
    page.getByLabel("Overview project").locator("option:checked"),
  ).toHaveText("Cloud certification");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Calendar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Overview project").locator("option:checked"),
  ).toHaveText("Cloud certification");
  await website.waitFor({ state: "hidden" });
  await projects
    .getByRole("link", { name: "Cloud certification", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9]{32}$/);
  await expect(
    page.getByRole("heading", { name: "Cloud certification", exact: true }),
  ).toBeVisible();
});
