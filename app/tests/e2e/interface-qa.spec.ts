import { test, expect, type Page } from "@playwright/test";

async function assertFlatSurfaces(page: Page) {
  expect(
    await page.evaluate(() => {
      const problems: string[] = [];
      for (const element of document.querySelectorAll("body *")) {
        if (!element.getClientRects().length) continue;
        for (const pseudo of [null, "::before", "::after"]) {
          const style = getComputedStyle(element, pseudo);
          if (
            style.boxShadow !== "none" ||
            style.textShadow !== "none" ||
            style.filter.includes("drop-shadow") ||
            !["none", ""].includes(style.backdropFilter)
          )
            problems.push(
              `${element.tagName}.${element.className} ${pseudo ?? ""}`,
            );
        }
      }
      return problems;
    }),
  ).toEqual([]);
  expect(
    await page
      .locator(
        ".button.primary, .button.secondary, .board-column, .board-task, .today-pulse button, .report-metrics > div, .dependency-node, .calendar-session, .time-calendar-event",
      )
      .evaluateAll((elements) =>
        elements
          .filter((e) => e.getClientRects().length)
          .flatMap((e) => {
            const s = getComputedStyle(e);
            const widths = [
              s.borderTopWidth,
              s.borderRightWidth,
              s.borderBottomWidth,
              s.borderLeftWidth,
            ];
            return new Set(widths).size > 1
              ? [`${e.className}: ${widths.join(",")}`]
              : [];
          }),
      ),
  ).toEqual([]);
}

const routes = [
  "/",
  "/tasks",
  "/tasks?view=board",
  "/tasks?view=archive",
  "/projects",
  "/projects?view=archive",
  "/projects/website",
  "/projects/website?view=board",
  "/projects/website?view=timeline",
  "/projects/website?view=archive",
  "/task/t1",
  "/calendar?range=month",
  "/calendar?range=week",
  "/calendar?range=day",
  "/calendar?view=schedule",
  "/calendar/subscriptions",
  "/insights?tab=Summary",
  "/insights?tab=Workload",
  "/insights?tab=Performance",
  "/insights?tab=Workflow",
  "/insights?tab=Goals",
  "/plans",
  "/plans?tab=history",
  "/settings?tab=account",
  "/settings?tab=planning",
  "/settings?tab=workspace",
  "/settings?tab=data",
  "/connections",
  "/connections?tab=calendar",
  "/connections?tab=mcp",
  "/connections?tab=activity",
  "/teams",
  "/team",
  "/favorites",
  "/notifications",
];
for (const width of [390, 768, 1440]) {
  test(`UI QA across all screen families at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(
        page.locator("main .page, main .task-page").first(),
        route,
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
      const clipped = await page
        .locator(".page-heading > .button, .page-heading > a.button")
        .evaluateAll((elements) =>
          elements
            .filter((e) => {
              const box = e.getBoundingClientRect();
              return box.width && (box.left < 0 || box.right > innerWidth + 1);
            })
            .map((e) => e.textContent),
        );
      expect(clipped, route).toEqual([]);
      await assertFlatSurfaces(page);
      const heading = page.locator(".page-heading");
      if (await heading.count())
        await expect(heading).toHaveCSS("border-bottom-width", "0px");
      if (
        (route === "/" && width === 1440) ||
        (route === "/insights?tab=Summary" && width === 768) ||
        (route === "/task/t1" && width === 390)
      )
        await page.screenshot({
          path: `../docs/screenshots/ui-${width === 1440 ? "overview-desktop" : width === 768 ? "insights-tablet" : "task-phone"}.png`,
          animations: "disabled",
        });
    }
    expect(errors).toEqual([]);
  });
}

test("help bubbles work by hover, keyboard, and touch without clipping or shadows", async ({
  page,
}) => {
  await page.goto("/insights");
  const help = page.getByRole("button", {
    name: "About Insights",
    exact: true,
  });
  await help.hover();
  await expect(page.getByRole("tooltip")).toContainText("status history");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await help.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await help.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const box = await page.getByRole("tooltip").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(378);
  await assertFlatSurfaces(page);
  await help.click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("phone filters keep selections when collapsed and controls have readable touch sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  const filters = page.getByRole("button", { name: /^Filters/ });
  const status = page.getByLabel("Filter by status", { exact: true });
  await expect(status).toBeHidden();
  await filters.click();
  await status.selectOption("in_progress");
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(filters).toContainText("1");
  await filters.click();
  await expect(status).toBeHidden();
  await filters.click();
  await expect(status).toHaveValue("in_progress");
  for (const control of [
    filters,
    status,
    page.getByLabel("Filter tasks", { exact: true }),
  ]) {
    await expect
      .poll(async () => (await control.boundingBox())!.height, {
        message: await control.evaluate((e) => e.outerHTML),
      })
      .toBeGreaterThanOrEqual(44);
  }
  expect(
    await status.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await expect(filters).toHaveCount(0);
  await expect(status).toBeVisible();
  await expect(status).toHaveValue("in_progress");
});

test("dialogs and person/status popovers stay flat and usable on phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  await page
    .getByRole("button", { name: "New task", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await assertFlatSurfaces(page);
  expect(
    await dialog
      .getByLabel("What needs to get done?")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/task/t1");
  await page.getByRole("combobox", { name: "Priority", exact: true }).click();
  await expect(
    page.getByRole("listbox", { name: "Priority options" }),
  ).toBeVisible();
  await assertFlatSurfaces(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeVisible();
});
