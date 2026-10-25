import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
});

test("consolidated navigation keeps one calendar, URL-backed plan tabs, project filtering, and old bookmarks", async ({
  page,
}) => {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(7);
  for (const name of ["Inbox", "All tasks", "My week", "Planning"])
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.goto("/week?project=website");
  await expect(page).toHaveURL(/\/plans\?project=[a-f0-9]{32}$/);
  await expect(
    page.getByRole("tabpanel", { name: "Proposals", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Filter plans by project").locator("option:checked"),
  ).toHaveText("Website launch");
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your plan history", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "History", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(
    page.getByRole("tabpanel", { name: "Proposals", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open calendar", exact: true }).click();
  await expect(page).toHaveURL(/view=calendar&range=week/);
  await page.goto("/projects");
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await page
    .getByRole("link", { name: "Plan this project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByLabel("What would you like to plan?").locator("option:checked"),
  ).toHaveText("Website launch");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/tasks\?project=[a-f0-9]{32}$/);
  await expect(page.getByLabel("Quick capture a task")).toBeVisible();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await page
    .getByLabel("Filter by project")
    .selectOption({ label: "Website launch" });
  await page.getByLabel("Filter by deadline").selectOption("today");
  await page.reload();
  await expect(
    page.getByRole("tabpanel", { name: "Board", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Filter by project").locator("option:checked"),
  ).toHaveText("Website launch");
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
});

test("project favorites persist, show only starred projects, collapse, and can be removed from details", async ({
  page,
}) => {
  const favorites = page.locator("#favorite-items");
  await expect(favorites.getByRole("link")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Projects", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Favorite Website launch", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    favorites.getByRole("link", {
      name: "Website launch Project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    favorites.getByRole("link", {
      name: "Brand handbook Project",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Favorite Brand handbook", exact: true })
    .click();
  await expect(favorites.getByRole("link")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Unfavorite Website launch",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(favorites.getByRole("link")).toHaveCount(2);
  const toggle = page.getByRole("button", { name: "Favorites", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(favorites).toBeHidden();
  await toggle.click();
  await expect(favorites).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/project-favorites-desktop.png",
  });
  await favorites
    .getByRole("link", { name: "Website launch Project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unfavorite Website launch", exact: true })
    .click();
  await expect(
    favorites.getByRole("link", {
      name: "Website launch Project",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Website launch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px projects`,
    ).toBe(true);
    const offset = await page
      .getByRole("button", { name: "Favorite Website launch", exact: true })
      .evaluate((element) => {
        const icon = element.querySelector("svg")!.getBoundingClientRect(),
          row = element.getBoundingClientRect();
        return Math.abs(icon.y + icon.height / 2 - row.y - row.height / 2);
      });
    expect(offset).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(favorites.getByRole("link")).toHaveCount(1);
  await expect(
    favorites.getByRole("link", {
      name: "Brand handbook Project",
      exact: true,
    }),
  ).toBeVisible();
  await toggle.click();
  await expect(favorites).toBeHidden();
  await toggle.click();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/project-favorites-phone.png",
  });
});

test("projects and teams share five typed shortcuts and a complete Favorites page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Project name").fill("Community launch");
  await form.getByRole("button", { name: /Create project/ }).click();
  await expect(form).toBeHidden();
  for (const title of [
    "Personal planning",
    "Website launch",
    "Brand handbook",
    "Cloud certification",
    "Community launch",
  ])
    await page
      .getByRole("button", { name: `Favorite ${title}`, exact: true })
      .click();
  await page.goto("/teams");
  await page
    .getByRole("button", { name: "Favorite team Kazi", exact: true })
    .click();
  const favorites = page.locator("#favorite-items");
  await expect(favorites.locator(".sidebar-favorite")).toHaveCount(5);
  await expect(
    favorites.locator('.favorite-kind[data-kind="team"]'),
  ).toHaveCount(1);
  await expect(
    favorites.locator('.favorite-kind[data-kind="project"]'),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page.screenshot({
    path: "../docs/screenshots/favorites-mixed-desktop.png",
    animations: "disabled",
  });
  await favorites
    .getByRole("link", { name: "More favorites", exact: true })
    .click();
  await expect(page).toHaveURL(/\/favorites$/);
  await expect(page.locator(".favorites-directory > li")).toHaveCount(6);
  await page
    .getByRole("button", {
      name: "Unfavorite project Community launch",
      exact: true,
    })
    .click();
  await expect(page.locator(".favorites-directory > li")).toHaveCount(5);
  await expect(favorites.locator(".sidebar-favorite")).toHaveCount(5);
  await expect(
    favorites.getByRole("link", { name: "More favorites", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.getByLabel("User menu")).toBeInViewport();
  await page.screenshot({
    path: "../docs/screenshots/favorites-mixed-phone.png",
    animations: "disabled",
  });
  await favorites
    .getByRole("button", { name: "Kazi Team", exact: true })
    .click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
  await expect(page.locator(".team-scope-label")).toHaveText("Kazi");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("teams are favorited in Team & people, persist, open scoped work, and can be removed", async ({
  page,
}) => {
  await expect(
    page.getByRole("navigation", { name: "Team filters" }),
  ).toHaveCount(0);
  await page.goto("/teams");
  const star = page.getByRole("button", {
    name: "Favorite team Kazi",
    exact: true,
  });
  await star.click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unfavorite team Kazi", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const favorites = page.locator("#favorite-items");
  await favorites
    .getByRole("button", { name: "Kazi Team", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".team-scope-label")).toHaveText("Kazi");
  await page.goto("/teams");
  await page
    .getByRole("button", { name: "People & access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "People & access", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "All teams", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Teams & people", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../docs/screenshots/favorites-teams-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Unfavorite team Kazi", exact: true })
    .click();
  await expect(
    favorites.getByRole("button", { name: "Kazi Team", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".team-scope-label")).toHaveText("Kazi");
  await page
    .getByRole("button", { name: "Clear team filter", exact: true })
    .click();
  await expect(page.locator(".team-scope-label")).toHaveText("All teams");
  await page
    .getByRole("button", { name: "View all work", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});
