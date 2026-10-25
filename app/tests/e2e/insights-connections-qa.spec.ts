import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
});

test("wide workflow data is visibly scrollable and keyboard accessible on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/insights?tab=Workflow");
  const table = page
    .getByRole("region", {
      name: "Workflow stage durations",
    })
    .first();
  await expect(table).toHaveAttribute("tabindex", "0");
  await expect(
    table.locator("..").getByText("Scroll to see all columns"),
  ).toBeVisible();
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Working time", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Working time", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(/Only time within your working calendar/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Time in each stage" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.goto("/insights?tab=Performance");
  const lateTask = page
    .getByRole("button", {
      name: "Define our brand principles",
      exact: true,
    })
    .first();
  expect((await lateTask.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  expect((await lateTask.boundingBox())!.height).toBeLessThan(80);
});

test("MCP setup uses available desktop width and keeps demo credentials safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/connections?tab=mcp");
  await expect(page.getByLabel("MCP setup steps").locator("li")).toHaveCount(3);
  const steps = await page
    .getByLabel("MCP setup steps")
    .locator("li")
    .evaluateAll((elements) =>
      elements.map((e) => ({
        x: e.getBoundingClientRect().x,
        y: e.getBoundingClientRect().y,
      })),
    );
  expect(new Set(steps.map((s) => Math.round(s.y))).size).toBe(1);
  expect(steps[1].x).toBeGreaterThan(steps[0].x);
  expect(steps[2].x).toBeGreaterThan(steps[1].x);
  await page
    .getByText("Manual setup & server details", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy MCP endpoint" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Add MCP connection" }),
  ).toContainText("MCP is not configured");
  await expect(
    page.getByRole("button", { name: "Create credential", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("link", { name: "View tool activity" }).click();
  await expect(page).toHaveURL(/tab=activity/);
  await expect(
    page.getByText("No MCP activity", { exact: true }),
  ).toBeVisible();
});

test("Kazi's native agenda does not claim Google availability is connected", async ({
  page,
}) => {
  await page.goto("/calendar/subscriptions");
  await page
    .getByRole("button", { name: "Use Kazi agenda", exact: true })
    .click();
  await expect(
    page.getByText("Kazi agenda enabled", { exact: true }),
  ).toBeVisible();
  await page.goto("/connections");
  await expect(
    page.getByRole("link", { name: /Calendar availability Optional Google/ }),
  ).toContainText("Not connected");
});

test("connection empty-state icons retain readable size and active tabs stay visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["overview", "calendar", "mcp", "activity"]) {
    await page.goto(`/connections?tab=${tab}`);
    const active = page
      .getByLabel("Connection views")
      .locator('[aria-pressed="true"]');
    await expect
      .poll(() =>
        active.evaluate((e) => {
          const box = e.getBoundingClientRect(),
            parent = e.parentElement!.getBoundingClientRect();
          return box.left >= parent.left - 1 && box.right <= parent.right + 1;
        }),
      )
      .toBe(true);
    const icons = page.locator(".connections-form .connection-empty > svg");
    for (let i = 0; i < (await icons.count()); i++) {
      expect((await icons.nth(i).boundingBox())!.width).toBeGreaterThanOrEqual(
        40,
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
  }
});
