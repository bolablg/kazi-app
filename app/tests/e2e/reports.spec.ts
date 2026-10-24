import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/reports");
  await page.waitForLoadState("networkidle");
});
test("reports track delivery, flow, planned workload and project goals without manual time logging", async ({
  page,
}) => {
  await expect(page.getByLabel("Report summary")).toContainText("67%");
  await expect(page.getByLabel("Report summary")).not.toContainText("Logged");
  await expect(
    page.getByRole("heading", { name: "Created vs completed" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Workload", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Current workload by person" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Share of planned calendar time by project",
    }),
  ).toBeVisible();
  await page
    .getByLabel("Report project")
    .selectOption({ label: "Cloud certification" });
  await expect(
    page.getByRole("heading", { name: "No confirmed calendar blocks" }),
  ).toBeVisible();
  await page.getByLabel("Report project").selectOption("all");
  await page.getByRole("tab", { name: "Performance", exact: true }).click();
  await expect(
    page.getByText("Median cycle time", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Define our brand principles", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9]{32}\/task\/[a-f0-9]{32}$/);
  await page.getByRole("button", { name: "Close task" }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await page.goto("/reports?tab=Performance");
  await page.getByRole("tab", { name: "Goals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project goals & milestones" }),
  ).toBeVisible();
  await expect(page.getByText("Achieved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Goals", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
test("completion updates analytics automatically, custom periods filter records, and daily totals export", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Performance", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Performance", exact: true })
    .getByRole("button", {
      name: "Finalize the component library",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("article", { name: "Task details" });
  await dialog.getByLabel("Task status", { exact: true }).selectOption("done");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task" }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await page.goto("/reports?tab=Performance");
  await expect(
    page.getByLabel("Report summary").locator("strong").first(),
  ).toHaveText("4");
  await page.getByLabel("Report period").selectOption("custom");
  await page.getByLabel("Report start date").fill("2026-10-26");
  await page.getByLabel("Report end date").fill("2026-10-26");
  await expect(
    page.getByLabel("Report summary").locator("strong").first(),
  ).toHaveText("2");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export daily totals" }).click();
  const download = await pending;
  expect(await readFile((await download.path())!, "utf8")).toBe(
    "Date,Created tasks,Completed tasks,Scheduled minutes\r\n2026-10-26,0,2,0",
  );
  expect(download.suggestedFilename()).toBe(
    "kazi-report-2026-10-26-2026-10-26.csv",
  );
  await page.getByLabel("Report start date").fill("2026-10-27");
  await expect(page.getByRole("alert")).toContainText("Choose a date range");
});
test("project colors agree between calendar labels and reports", async ({
  page,
}) => {
  const color = await page
    .locator(".report-goals .project-tag")
    .filter({ hasText: "Brand handbook" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).toBe("rgb(250, 210, 207)");
  await page.goto("/?view=calendar&range=day");
  await expect(
    page
      .locator(".day-due-items button")
      .filter({ hasText: "Write our brand story" }),
  ).toHaveCSS("background-color", color);
});
test("all report tabs and panels fit phones, tablets and desktop", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of [
      "Summary",
      "Workload",
      "Performance",
      "Workflow",
      "Goals",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const tabsFit = await page
        .getByRole("tablist", { name: "Report views" })
        .evaluate((element) =>
          Array.from(element.querySelectorAll("button")).every((button) => {
            const a = element.getBoundingClientRect(),
              b = button.getBoundingClientRect();
            return b.left >= a.left && b.right <= a.right + 1;
          }),
        );
      expect(tabsFit, `${width}px navigation`).toBe(true);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `${width}px ${tab}`,
      ).toBe(true);
    }
  }
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/reports-automatic-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/reports-automatic-phone.png",
  });
});
