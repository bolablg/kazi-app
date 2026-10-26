import { test, expect } from "@playwright/test";

test("public notice opens directly without account requests and supports desktop, tablet, mobile, and print", async ({
  page,
}) => {
  const accountRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (
      hostname === "clerk.iyanju.com" ||
      hostname === "clerk.kazi.iyanju.com" ||
      /(?:^|\.)(?:clerk\.accounts\.dev|clerk\.com|convex\.cloud|convex\.site)$/.test(
        hostname,
      )
    )
      accountRequests.push(request.url());
  });
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy policy" }),
  ).toBeVisible();
  await expect(page.getByLabel("Draft status")).toBeVisible();
  await expect(page).toHaveTitle("Privacy policy · Kazi");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("link", { name: "Open Kazi", exact: true }),
    ).toBeVisible();
    if (width <= 800) {
      const contents = page.locator(".privacy-mobile-contents");
      await expect(contents).toBeVisible();
      await contents.locator("summary").click();
      await contents.getByRole("link", { name: "Adults-only service" }).click();
      await expect(page).toHaveURL(/#children$/);
      await expect(contents).not.toHaveAttribute("open", "");
      await expect(
        page.getByRole("heading", { name: "Adults-only service" }),
      ).toBeInViewport();
      await page.getByRole("link", { name: "Back to top" }).click();
    } else {
      await expect(page.locator(".privacy-contents")).toBeVisible();
      await expect(
        page.locator(".privacy-contents a > span").first(),
      ).toHaveCSS("white-space", "nowrap");
    }
    if (width === 1440 || width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath(`privacy-${width}.png`),
      });
    }
  }
  expect(accountRequests).toEqual([]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".privacy-header")).toBeHidden();
  await expect(page.locator(".privacy-contents")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("account menu links to the public notice and the alternate URL supports reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("User menu", { exact: true }).click();
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Privacy policy",
  );
  await page.goto("/privacy-policy/");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Privacy policy",
  );
  await page.getByRole("link", { name: "Open Kazi", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
});
