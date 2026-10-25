import { test, expect } from "@playwright/test";

for (const width of [1440, 768, 390]) {
  test(`Momentum stays legible and aligned in ${width}px navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    if (width < 1024)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    const home = page.getByRole("link", { name: "Kazi home", exact: true });
    const logo = home.getByRole("img", { name: "Kazi", exact: true });
    await expect(logo).toBeVisible();
    // The drawer animates from outside the viewport. Wait for the full artwork,
    // rather than measuring its intermediate position on a fast CI runner.
    await expect(logo).toBeInViewport({ ratio: 1 });
    await expect(logo).toHaveAttribute("src", "/brand/kazi-logo.svg");
    await expect
      .poll(() =>
        logo.evaluate(
          (e: HTMLImageElement) => e.complete && e.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const geometry = await home.evaluate((e) => {
      const image = e.querySelector("img")!;
      const box = e.getBoundingClientRect(),
        mark = image.getBoundingClientRect();
      return {
        centered: Math.abs(box.y + box.height / 2 - mark.y - mark.height / 2),
        fits: mark.left >= 0 && mark.right <= innerWidth,
        shadow: getComputedStyle(image).boxShadow,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.centered).toBeLessThan(1);
    expect(geometry).toMatchObject({
      fits: true,
      shadow: "none",
      overflow: false,
    });
    await page.screenshot({
      path: `../docs/screenshots/momentum-${width}.png`,
      animations: "disabled",
    });
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    if (width < 1024)
      await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
  });
}
