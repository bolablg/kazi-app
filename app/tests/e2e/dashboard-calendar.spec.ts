import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
});

test("whole month cells and day headers select the complete agenda without intercepting task clicks", async ({
  page,
}) => {
  await page.goto("/calendar?range=month");
  await page.locator(".calendar-options > summary").click();
  await page.getByLabel("Include proposals").check();
  await page.locator(".calendar-options > summary").click();
  const date = page.getByRole("button", {
    name: /^Monday, Oct 26, \d+ items$/,
  });
  const cell = page.getByRole("cell").filter({ has: date });
  const box = (await cell.boundingBox())!;
  await cell.click({ position: { x: box.width - 3, y: box.height - 3 } });
  await expect(date).toHaveAttribute("aria-pressed", "true");
  const agenda = page.locator("#selected-day-agenda");
  await expect(agenda.getByRole("heading")).toHaveText("Monday, Oct 26");
  expect(
    await agenda.locator(".overview-event-row.proposed").count(),
  ).toBeGreaterThan(3);
  await expect(agenda).toBeInViewport();
  await agenda.locator(".overview-event-row.proposed").first().click();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("combobox", { name: "Calendar view", exact: true })
    .selectOption("week");
  await page
    .getByRole("button", {
      name: "View Wednesday, Oct 28",
      exact: true,
    })
    .click();
  await expect(agenda.getByRole("heading")).toHaveText("Wednesday, Oct 28");
  const thursday = page.getByRole("button", {
    name: "View Thursday, Oct 29",
    exact: true,
  });
  await thursday.focus();
  await thursday.press("Enter");
  await expect(agenda.getByRole("heading")).toHaveText("Thursday, Oct 29");
});

for (const width of [390, 768, 1440]) {
  test(`short proposed events keep their title inside the event at ${width}px in week and day views`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.goto("/calendar?range=week");
    await page.locator(".calendar-options > summary").click();
    await page.getByLabel("Include proposals").check();
    await page.locator(".calendar-options > summary").click();
    for (const range of ["Week", "Day"]) {
      await page
        .getByRole("combobox", { name: "Calendar view", exact: true })
        .selectOption(range.toLowerCase());
      const short = page.locator(
        '.time-calendar-event.proposed[data-density="compact"]',
      );
      expect(await short.count()).toBeGreaterThan(0);
      await expect
        .poll(
          async () =>
            await short.evaluateAll((elements) =>
              elements.flatMap((e) => {
                const title = e.querySelector("strong")!;
                const b = e.getBoundingClientRect(),
                  t = title.getBoundingClientRect();
                return t.height >= 14 &&
                  t.top >= b.top &&
                  t.bottom <= b.bottom + 0.5
                  ? []
                  : [
                      {
                        title: title.textContent,
                        buttonTop: b.top,
                        buttonBottom: b.bottom,
                        titleTop: t.top,
                        titleBottom: t.bottom,
                        titleHeight: t.height,
                      },
                    ];
              }),
            ),
        )
        .toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .locator('.time-calendar-event.proposed[data-density="compact"]')
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `../docs/screenshots/calendar-proposals-${width}.png`,
      animations: "disabled",
    });
  });
}

test("Overview paginates all three queues, resets scope, and aligns the final desktop row", async ({
  page,
}) => {
  await page.goto("/");
  // Only the isolated synthetic demo receives test data. Live accounts are untouched.
  await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2",
      state = JSON.parse(localStorage.getItem(key)!);
    const template = state.tasks.find(
      (t: { assigneeId: string }) => t.assigneeId === "demo-you",
    );
    for (let n = 0; n < 12; n++) {
      const id = "qa-page-task-" + String(n).padStart(2, "0");
      state.tasks.push({
        ...template,
        id,
        title: "Overview queue task " + n,
        deadline: "2026-10-25",
        status: "in_progress",
        dependencies: [],
      });
      state.activities.push({
        id: "qa-event-" + n,
        taskId: id,
        projectId: template.projectId,
        actorId: "demo-you",
        at: Date.now() - n * 1000,
        kind: "comment",
        message: "Queue update " + n,
      });
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1024 });
  for (const [region, label, selector] of [
    [/^Needs attention/, "needs attention", ".today-task-row"],
    [/^My focus/, "my focus", ".today-task-row"],
    ["Recent activity", "recent activity", ".today-activity-list li"],
  ] as const) {
    const panel = page.getByRole("region", { name: region });
    await expect(panel.locator(selector)).toHaveCount(5);
    const first = await panel.locator(selector).first().textContent();
    const next = panel.getByRole("button", {
      name: "Next " + label + " page",
      exact: true,
    });
    await next.click();
    await expect(panel.locator(selector).first()).not.toHaveText(first!);
    await expect(panel.getByRole("navigation")).toContainText("6–10");
    while (await next.isEnabled()) await next.click();
    expect(await panel.locator(selector).count()).toBeLessThanOrEqual(5);
    await expect(next).toBeDisabled();
    await panel
      .getByRole("button", { name: "Previous " + label + " page", exact: true })
      .click();
  }
  const bottom = await page
    .locator(".today-focus, .today-activity")
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().bottom));
  expect(Math.abs(bottom[0] - bottom[1])).toBeLessThanOrEqual(1);
  await page.locator(".today-focus").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/overview-pagination-desktop.png",
    animations: "disabled",
  });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".today-activity").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `../docs/screenshots/overview-pagination-${width}.png`,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page
    .getByLabel("Overview assignee", { exact: true })
    .selectOption("all");
  await expect(
    page.getByRole("navigation", { name: "Focus pages", exact: true }),
  ).toContainText("1–5");
  await page
    .getByLabel("Overview assignee", { exact: true })
    .selectOption("demo-you");
  await page
    .getByRole("group", { name: "Attention filters" })
    .getByRole("button", { name: "Overdue", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", {
      name: "Needs attention pages",
      exact: true,
    }),
  ).toContainText("1–5");
  await page
    .getByLabel("Overview project", { exact: true })
    .selectOption({ label: "Cloud certification" });
  await expect(
    page
      .getByRole("navigation", { name: "My focus pages", exact: true })
      .getByRole("button", { name: "Previous my focus page", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".nav-group-label").filter({ hasText: /^Work$/ }),
  ).toHaveCount(0);
});

test("MCP setup explains each step while keeping client and activity features", async ({
  page,
}) => {
  await page.goto("/connections?tab=mcp");
  const steps = page.getByRole("list", { name: "MCP setup steps" });
  await expect(steps.getByRole("listitem")).toHaveCount(3);
  await expect(steps).toContainText("Copy agent setup");
  await page
    .getByText("Manual setup & server details", { exact: true })
    .click();
  await expect(page.locator(".mcp-manual-content")).toContainText(
    "Authorization: Bearer YOUR_KAZI_TOKEN",
  );
  await expect(
    page.getByRole("heading", { name: "Agents & clients", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy JSON template", exact: true }),
  ).toBeDisabled();
  await steps.getByRole("link", { name: "View tool activity" }).click();
  await expect(
    page.getByRole("heading", { name: "Recent MCP activity", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`refresh animates the brand before JavaScript at ${width}px`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let blocked = false;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.route("**/src/main.tsx*", async (route) => {
      blocked = true;
      await gate;
      await route.continue();
    });
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expect.poll(() => blocked).toBe(true);
      await expect(
        page.getByRole("status", { name: "Opening Kazi", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".loading-signal")).toBeVisible();
      await expect(page.locator(".loading-step")).toHaveCount(3);
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toHaveCount(0);
      await page.screenshot({
        path: test.info().outputPath("refresh-animation.png"),
        animations: "disabled",
      });
    } finally {
      release();
    }
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
  });
}
