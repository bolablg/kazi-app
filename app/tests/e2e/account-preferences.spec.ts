import { test, expect } from "@playwright/test";

test("time-zone changes remain drafts until saved, with an explicit device shortcut", async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: "Europe/Paris",
    viewport: { width: 768, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto("/settings?tab=planning");
  const zone = page.getByRole("combobox", { name: "Time zone", exact: true });
  await expect(zone).toHaveValue("America/Chicago");
  expect(await zone.locator("option").count()).toBeGreaterThan(100);
  const shortcut = page.getByRole("button", { name: "Use device time zone" });
  for (const target of [
    shortcut,
    page.getByRole("button", { name: "About your time zone" }),
  ]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await shortcut.click();
  await expect(zone).toHaveValue("Europe/Paris");
  await page.reload();
  await expect(zone).toHaveValue("America/Chicago");
  await zone.selectOption("Asia/Singapore");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page.reload();
  await expect(zone).toHaveValue("Asia/Singapore");
  await page.goto("/insights");
  await page
    .getByRole("link", { name: "Change time zone, currently Asia/Singapore" })
    .click();
  await expect(page).toHaveURL(/tab=planning&section=working-hours/);
  await expect(zone).toBeFocused();
  await expect(zone).toBeInViewport();
  await context.close();
});

for (const width of [360, 390, 768, 1440]) {
  test(`Insights keeps its title intact and help optional at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1024 });
    await page.goto("/insights");
    const heading = page.getByRole("heading", {
      name: "Insights",
      exact: true,
    });
    const box = (await heading.boundingBox())!;
    const lineHeight = await heading.evaluate((element) =>
      parseFloat(getComputedStyle(element).lineHeight),
    );
    expect(box.height).toBeLessThanOrEqual(lineHeight + 1);
    const help = page.getByRole("button", {
      name: "About Insights",
      exact: true,
    });
    await expect(
      page.getByText("How Insights work", { exact: true }),
    ).toHaveCount(0);
    await help.click();
    await expect(
      page.getByText("How Insights work", { exact: true }),
    ).toBeVisible();
    const bubble = page.getByRole("tooltip");
    const helpBox = (await bubble.boundingBox())!;
    expect(helpBox.x).toBeGreaterThanOrEqual(0);
    expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}
