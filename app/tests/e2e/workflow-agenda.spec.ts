import { chooseStatus } from "./task-fields";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/tasks");
});
test("Tasks and project boards share the full workflow, collapse archives, and preserve dates in the timeline", async ({
  page,
}) => {
  const title = "Validate the release workflow";
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("What needs to get done?").fill(title);
  await form
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Website launch" });
  await expect(form.getByLabel("Initial stage")).toHaveValue("backlog");
  await form.getByLabel("Planned start", { exact: true }).fill("2026-10-27");
  await form.getByLabel(/^Deadline/).fill("2026-10-30");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Backlog column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  for (const status of [
    "todo",
    "in_progress",
    "to_validate",
    "done",
  ] as const) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await chooseStatus(page, status);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close task", exact: true }).click();
    await expect(
      page
        .getByRole("region", {
          name:
            {
              todo: "To do",
              in_progress: "In progress",
              to_validate: "To validate",
              done: "Completed",
            }[status] + " column",
          exact: true,
        })
        .getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
  }
  const projectId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).projects.find(
        (p: any) => p.title === "Website launch",
      ).id,
  );
  await page.goto(`/project/${projectId}?view=board`);
  await expect(
    page
      .getByRole("region", { name: "Completed column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: title, exact: true }).click();
  await chooseStatus(page, "archived");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await page.goto(`/project/${projectId}?view=board`);
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("details.task-archive")).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const archive = page.locator("details.task-archive");
  await expect(archive).not.toHaveAttribute("open");
  await page
    .locator(".view-toolbar")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(archive).toHaveAttribute("open");
  await expect(
    archive.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await archive
    .getByRole("button", { name: `Restore ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Gantt", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: `${title}, 2026-10-27 to 2026-10-30`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Project status", { exact: true }).selectOption("done");
  await page.reload();
  await expect(page.getByLabel("Project status", { exact: true })).toHaveValue(
    "done",
  );
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px timeline`,
    ).toBe(true);
  }
  await page.screenshot({
    path: "../docs/screenshots/project-timeline.png",
    animations: "disabled",
  });
  await page.goto("/tasks?view=board");
  await expect(
    page
      .getByRole("region", { name: "Backlog column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px task board`,
    ).toBe(true);
  }
  await page.screenshot({
    path: "../docs/screenshots/tasks-workflow-board.png",
    animations: "disabled",
  });
});
test("Personal planning replaces Inbox tabs, and Kazi agenda supports a truthful ICS download", async ({
  page,
}) => {
  await expect(
    page.getByRole("tab", { name: "Inbox", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Filter by project", { exact: true })
    .selectOption({ label: "Personal planning · No project" });
  await page.getByLabel("Quick capture a task").fill("Prepare next month");
  await page.getByLabel("Quick capture a task").press("Enter");
  await expect(
    page.getByRole("region", { name: "Backlog tasks", exact: true }),
  ).toContainText("Prepare next month");
  await page.goto("/calendar");
  await page
    .getByRole("link", { name: "Subscribe & export", exact: true })
    .click();
  await expect(page).toHaveURL(/\/calendar\/subscriptions$/);
  await expect(
    page.getByRole("heading", { name: "Calendar subscriptions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Connect Google availability",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Kazi agenda", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use Kazi agenda", exact: true })
    .click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await page.getByLabel("Include task deadlines").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ICS", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kazi-agenda.ics");
  const body = await readFile((await file.path())!, "utf8");
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("Due: Refine the homepage direction");
  expect(body).not.toContain("Private calendar event");
  await expect(
    page.getByRole("button", { name: "Create calendar link", exact: true }),
  ).toBeDisabled();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "../docs/screenshots/kazi-agenda-settings.png",
    animations: "disabled",
  });
  await page.goto("/connections?tab=calendar");
  await expect(
    page.getByRole("heading", {
      name: "External availability · optional",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create calendar link", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", {
      name: "Manage Kazi calendar subscriptions and ICS export",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendar subscriptions", exact: true }),
  ).toBeVisible();
});
