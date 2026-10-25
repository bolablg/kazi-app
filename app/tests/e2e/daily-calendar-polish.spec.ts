import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
});

for (const width of [360, 768, 1440]) {
  test(`Plans keeps its title intact and keyboard tabs operable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await page.goto("/plans");
    const heading = page.getByRole("heading", { name: "Plans", exact: true });
    const size = await heading.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(size.height).toBeLessThanOrEqual(size.line + 1);
    const proposals = page.getByRole("tab", { name: "Proposals", exact: true });
    const history = page.getByRole("tab", { name: "History", exact: true });
    await proposals.focus();
    await proposals.press("ArrowRight");
    await expect(history).toBeFocused();
    await expect(history).toHaveAttribute("aria-selected", "true");
    await expect(proposals).toHaveAttribute("tabindex", "-1");
    await history.press("Home");
    await expect(proposals).toBeFocused();
    await page
      .getByRole("button", { name: /^Review Plan/ })
      .first()
      .click();
    const originalLink = page.url();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const totals = await dialog.locator(".review-totals > div").count();
    expect(totals).toBe(3);
    await dialog.getByRole("button", { name: /OPTION 2/ }).click();
    await expect(dialog.getByRole("button", { name: /OPTION 2/ })).toHaveClass(
      /selected/,
    );
    await expect(page).toHaveURL(/revision=2/);
    await expect(
      dialog.getByRole("button", { name: /OPTION 2/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: /^Approve/ }).click();
    await expect(
      dialog.getByRole("button", { name: "Back to my plans", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Back to my plans", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Plans", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await page
      .getByRole("button", { name: "Compare versions", exact: true })
      .click();
    const earlier = page.getByRole("combobox", {
      name: "Earlier plan",
      exact: true,
    });
    await expect(earlier.locator("option:checked")).toHaveText(/^Plan \d+ ·/);
    if (width <= 900)
      expect((await earlier.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.goto(originalLink);
    await expect(
      page.getByRole("heading", {
        name: "This plan link is outdated.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review the current proposal", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const width of [360, 768]) {
  test(`Weekly calendar scrolls inside its frame with readable days at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await page.goto("/calendar?range=week");
    await page.getByLabel("Include proposals").check();
    const frame = page.getByLabel("Scrollable work calendar", { exact: true });
    const firstDay = page.locator(".time-calendar-day").first();
    expect((await firstDay.boundingBox())!.width).toBeGreaterThanOrEqual(100);
    await expect(
      page.getByText("Swipe or scroll to see the full week", { exact: true }),
    ).toBeVisible();
    const axis = frame.locator(".time-calendar-labels");
    const left = (await axis.boundingBox())!.x;
    await frame.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await expect
      .poll(async () => Math.abs((await axis.boundingBox())!.x - left))
      .toBeLessThan(1);
    await frame
      .getByRole("button", { name: "View Sunday, Nov 1", exact: true })
      .click();
    await expect(page.locator("#selected-day-agenda h2")).toHaveText(
      "Sunday, Nov 1",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Subscription options are labeled and subscription instructions remain available on demand", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar/subscriptions");
  const select = page.getByLabel("Calendar subscription project", {
    exact: true,
  });
  const label = await select.locator("..").boundingBox();
  const control = (await select.boundingBox())!;
  expect(control.y - label!.y).toBeGreaterThan(14);
  const help = page.locator("details.agenda-help");
  await expect(help).not.toHaveAttribute("open");
  await help
    .getByText("How to subscribe & refresh timing", { exact: true })
    .click();
  await expect(help).toHaveAttribute("open");
  await expect(help).toContainText("From URL");
  await expect(help).toContainText("over 24 hours");
  await expect(
    page.getByRole("button", { name: "Create calendar link", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Use Kazi agenda", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use Kazi agenda", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download ICS", exact: true }),
  ).toBeEnabled();
});

test("Notifications count only the unread items currently available in the inbox", async ({
  page,
}) => {
  await page.goto("/notifications");
  const unread = page.locator(".notifications-page .tabs button").first();
  const count = await unread.textContent();
  await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    const template = state.notifications[0];
    state.notifications.push(
      {
        ...template,
        id: "qa-hidden-snoozed",
        key: "qa-hidden-snoozed",
        title: "Hidden snoozed reminder",
        read: false,
        snoozedUntil: Date.now() + 86400000,
      },
      {
        ...template,
        id: "qa-hidden-future",
        key: "qa-hidden-future",
        title: "Hidden future reminder",
        read: false,
        deliveryAt: Date.now() + 86400000,
      },
    );
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(unread).toHaveText(count!);
  await expect(
    page.getByText("Hidden snoozed reminder", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Hidden future reminder", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("PROGRESS CHECK", { exact: true })).toHaveCount(
    0,
  );
});
