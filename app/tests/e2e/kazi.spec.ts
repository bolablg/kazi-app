import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});
const nav = async (page: import("@playwright/test").Page, name: string) => {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: name === "Inbox" ? "Tasks" : name, exact: true })
    .click();
  if (name === "Inbox")
    await page
      .getByLabel("Filter by project")
      .selectOption({ label: "Personal planning · No project" });
};
test("captures, persists, completes and reopens an Inbox task", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What needs to get done?").fill("Renew my passport");
  await dialog.getByLabel("Estimated minutes").fill("45");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
  await nav(page, "Inbox");
  await expect(
    page.getByRole("button", { name: /^Renew my passport/ }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Complete Renew my passport", exact: true })
    .click();
  await page.getByLabel("Filter by status").selectOption("all");
  await page
    .getByRole("button", { name: "Reopen Renew my passport", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete Renew my passport" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/02-inbox.png",
  });
});
test("creates a project and assigns work on its board", async ({ page }) => {
  await nav(page, "Projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Launch our newsletter");
  await dialog
    .getByLabel("Description")
    .fill("A useful weekly note for our community.");
  await dialog.getByRole("button", { name: /Create project/ }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("link", { name: "Launch our newsletter", exact: true })
    .click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("What needs to get done?")
    .fill("Draft the welcome issue");
  await dialog.getByLabel("Worker").selectOption("demo-amira");
  await dialog.getByLabel("Estimated minutes").fill("90");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Draft the welcome issue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Worker: Amira Chen", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/03-team-board.png",
  });
});
test("reviews Plan 2, preserves Plan 1 and compares history", async ({
  page,
}) => {
  await nav(page, "Plans");
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).versions[0],
  );
  await page
    .getByRole("button", { name: "Review Plan 2", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("ORIGINAL DEADLINE", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("RECOVERY TARGET", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/04-plan-review.png",
  });
  await dialog
    .getByRole("button", { name: "Approve available sessions" })
    .click();
  await expect(
    dialog.getByText("Partially scheduled", { exact: false }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(stored.versions).toHaveLength(2);
  expect(stored.versions[0]).toEqual(original);
  expect(stored.versions[1].parentId).toBe(original.id);
  await dialog.getByRole("button", { name: "Back to my plans" }).click();
  await nav(page, "Plans");
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(
    page.getByRole("heading", { name: "Compare plan versions" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/05-plan-comparison.png",
  });
});
test("previews a weekly plan without accepting or scheduling it", async ({
  page,
}) => {
  await nav(page, "Plans");
  await page.getByRole("button", { name: "New proposal", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Preview my plan" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Review weekly plan" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Approve/ })).toBeEnabled();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(state.versions).toHaveLength(1);
  expect(state.proposals.at(-1).status).toBe("awaiting_review");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/06-plan-proposals.png",
  });
});
test("comments and system status changes share one activity feed without time reporting", async ({
  page,
}) => {
  await nav(page, "Tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Refine the homepage direction/ })
    .click();
  const task = page.getByRole("article", { name: "Task details" });
  const priorLogs = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("kazi.synthetic-demo.v2")!,
      ).reportEvents.filter(
        (event: { type: string }) => event.type === "time_logged",
      ).length,
  );
  await expect(
    task.getByRole("heading", { name: "Activity", exact: true }),
  ).toHaveCount(1);
  await expect(task.getByRole("tab")).toHaveCount(0);
  await expect(
    task.getByText("Progress check-in", { exact: true }),
  ).toHaveCount(0);
  await expect(task.getByLabel("Remaining minutes")).toHaveCount(0);
  await task
    .getByLabel("Add a comment")
    .fill("The first draft is ready for review.");
  await task.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    task
      .getByRole("region", { name: "Task activity" })
      .getByText("The first draft is ready for review.", { exact: true }),
  ).toHaveCount(1);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(
    stored.tasks.find(
      (t: { id: string }) => t.id === stored.legacyResourceIds.tasks.t1,
    ).status,
  ).toBe("in_progress");
  expect(
    stored.reportEvents.filter(
      (event: { type: string }) => event.type === "time_logged",
    ),
  ).toHaveLength(priorLogs);
});
test("review setting needs a deliberate save and records an audit trail", async ({
  page,
}) => {
  await page.getByLabel("User menu").click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const control = page.getByRole("switch", {
    name: "Review new plans before scheduling",
  });
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(
    page.getByText("Automatic recovery · your calendar only."),
  ).toBeVisible();
  let stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(stored.members[0].preferences.reviewRequired).toBe(true);
  await page.getByRole("button", { name: "Save preferences" }).click();
  stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(stored.members[0].preferences.reviewRequired).toBe(false);
  expect(
    stored.activities.some(
      (a: { kind: string; message: string }) =>
        a.kind === "policy" && a.message.includes("OFF"),
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/07-automatic-policy.png",
  });
});
test("notification acknowledgement is not task completion", async ({
  page,
}) => {
  // 08:00 local is outside quiet hours, so overdue alerts are visible.
  await nav(page, "Notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).tasks,
  );
  await page.getByRole("button", { name: "Mark as read" }).first().click();
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).tasks,
  );
  expect(after).toEqual(before);
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/08-reminders.png",
  });
});
test("mobile navigation and offline view stay usable without layout overflow", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await nav(page, "Inbox");
  await expect(
    page.getByRole("tabpanel", { name: "List", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByText(/You’re offline. This is a read-only view/),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Create task" }),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("keyboard search opens authorized tasks and Escape closes dialogs", async ({
  page,
}) => {
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search Kazi" }).fill("networking");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Practice networking fundamentals/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(
    "Practice networking fundamentals",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeHidden();
  await expect(page).toHaveURL(/\/tasks/);
});

test("profile menu opens inline account settings without a profile-launch button", async ({
  page,
}) => {
  await page.getByLabel("User menu").click();
  await expect(
    page.locator(".account-popover").getByText("Owner", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Owner · administrator access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Profile and security settings are available", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Manage profile & password",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/12-account.png",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My account", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Application details" }),
  ).toBeVisible();
});
test("Connections shows truthful statuses, MCP setup, and empty client activity", async ({
  page,
}) => {
  await page.getByLabel("User menu").click();
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(page.getByText("Demo calendar", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No agents connected yet", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/11-connections.png",
  });
  await page.getByRole("button", { name: "MCP & agents", exact: true }).click();
  await expect(
    page.getByText("No MCP credentials", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy MCP endpoint" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/MCP is not configured/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Create credential" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("No MCP activity", { exact: true }),
  ).toBeVisible();
});
test("Tasks preserves assigned-task bookmarks and mobile settings", async ({
  page,
}) => {
  await page.goto("/my-tasks");
  await expect(page).toHaveURL(/\/tasks\?assignee=/);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Assigned to me", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Filter tasks" }).fill("homepage");
  await expect(
    page.getByRole("button", {
      name: "Refine the homepage direction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write our brand story", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Complete Refine the homepage direction",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Filter by status" })
    .selectOption("all");
  await expect(
    page.getByRole("button", {
      name: "Reopen Refine the homepage direction",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Reopen Refine the homepage direction",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Refine the homepage direction",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Filter tasks" }).fill("");
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/10-height-tasks.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByLabel("User menu")).toBeVisible();
  await page.getByLabel("User menu").click();
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "MCP & agents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add connection", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Overview opens the daily dashboard and Calendar owns both date views", async ({
  page,
}) => {
  await nav(page, "Overview");
  await expect(
    page.getByRole("region", { name: /^Needs attention/ }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await nav(page, "Calendar");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  await expect(
    page.getByRole("table", { name: "Monthly work calendar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "List", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Private calendar event",
  );
  await expect(page.getByRole("tabpanel")).toContainText("Due");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "October 2026", exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(after.versions).toEqual(before.versions);
  expect(after.proposals).toEqual(before.proposals);
});

test("phone calendar opens the consolidated Plans workflow with persistent tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar?view=calendar");
  await page.getByRole("button", { name: /Monday, Oct 26, \d+ items/ }).click();
  await expect(page.locator(".selected-day-agenda")).toContainText(
    "Refine the homepage direction",
  );
  await page
    .getByRole("main")
    .getByRole("link", { name: "Create a plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Plan work sessions", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plans", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".calendar-grid")).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel", { name: "Proposals", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page
    .getByLabel("Filter plans by project")
    .selectOption({ label: "Website launch" });
  await page.reload();
  await expect(
    page.getByRole("tabpanel", { name: "History", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Filter plans by project").locator("option:checked"),
  ).toHaveText("Website launch");
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/plans-tabs-phone.png",
  });
  await page.getByRole("link", { name: "Open calendar", exact: true }).click();
  await expect(page).toHaveURL(/view=calendar&range=week/);
  await expect(
    page.getByRole("button", { name: "Week", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  test(`full-width readable layouts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1080 });
    for (const route of [
      "/",
      "/calendar?view=calendar",
      "/calendar?view=schedule",
      "/insights",
      "/my-tasks",
      "/tasks?tab=inbox",
      "/settings",
      "/settings?tab=account",
      "/calendar/subscriptions",
      "/teams",
      "/connections",
      "/plans",
      "/plans?tab=history",
      "/projects",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const content = page.locator("main .page");
      const sizes = await content.evaluate((e) => ({
        page: e.getBoundingClientRect().width,
        main: e.closest("main")!.clientWidth,
      }));
      expect(sizes.page).toBeGreaterThan(sizes.main - 20);
      expect(
        await page
          .getByRole("heading", { level: 1 })
          .evaluate((e) => getComputedStyle(e).color),
      ).toBe("rgb(17, 17, 17)");
      if (route === "/settings") {
        const form = page.locator(".settings-form");
        expect(
          await form.evaluate((e) => e.getBoundingClientRect().width),
        ).toBeGreaterThan(sizes.page - (width < 701 ? 40 : 75));
      }
      if (route === "/") {
        await expect(page.getByRole("tablist")).toHaveCount(0);
        for (const name of [
          "Needs attention",
          "My focus",
          "Projects",
          "Recent activity",
        ])
          await expect(
            page.getByRole("region", { name: new RegExp("^" + name) }),
          ).toBeVisible();
        if ([390, 768, 1440, 1920].includes(width))
          await page.screenshot({
            animations: "disabled",
            path: `../docs/screenshots/today-${width}.png`,
          });
      }
    }
    if (width <= 1023) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByLabel("User menu")).toBeVisible();
    }
    if ([390, 768, 1440, 1920].includes(width)) {
      await page.goto("/calendar?view=calendar");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        animations: "disabled",
        path: `../docs/screenshots/overview-${width}.png`,
      });
    }
  });
}

test("calendar switches month, week, and day with matching navigation and task details", async ({
  page,
}) => {
  await page.goto("/calendar?view=calendar");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  const range = page.getByRole("group", { name: "Calendar range" });
  await expect(
    range.getByRole("button", { name: "Month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await range.getByRole("button", { name: "Week", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Weekly work calendar" }),
  ).toBeVisible();
  await expect(page.locator(".time-calendar-day")).toHaveCount(7);
  await expect(
    page.getByRole("heading", { name: "Oct 26 – Nov 1, 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nov 2 – Nov 8, 2026", exact: true }),
  ).toBeVisible();
  await range.getByRole("button", { name: "Day", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Daily work calendar" }),
  ).toBeVisible();
  await expect(page.locator(".time-calendar-day")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Monday, Nov 2, 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tuesday, Nov 3, 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Monday, Oct 26, 2026", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Include proposals").check();
  const calendarUrl = page.url();
  await page.locator(".time-calendar-event.proposed").first().click();
  await expect(page.getByRole("textbox", { name: "Task title" })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await page.goto(calendarUrl);
  await page.getByRole("tab", { name: "Schedule", exact: true }).click();
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    range.getByRole("button", { name: "Day", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Daily work calendar" }),
  ).toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
  expect(after.proposals).toEqual(before.proposals);
  expect(after.versions).toEqual(before.versions);
});

test("weekly and daily calendar fit phones and retain the selected cross-month date", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar?view=calendar");
  const range = page.getByRole("group", { name: "Calendar range" });
  await range.getByRole("button", { name: "Week", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".overview-time-calendar")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
  await page
    .getByRole("button", { name: "View Sunday, Nov 1", exact: true })
    .click();
  await range.getByRole("button", { name: "Day", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sunday, Nov 1, 2026", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".time-calendar-day")).toHaveCount(1);
  await expect(page.locator(".day-due-items")).toContainText(
    "Book a dentist appointment",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/overview-calendar-day-phone.png",
  });
});
