import { expect, test } from "@playwright/test";

test("refresh motion scales with live resizing and becomes static with reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked = false;
  await page.route("**/src/main.tsx*", async (route) => {
    blocked = true;
    await gate;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: "commit" });
    await expect.poll(() => blocked).toBe(true);
    await expect(
      page.getByRole("status", { name: "Opening Kazi", exact: true }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const signal = page.locator(".loading-signal");
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [844, 390],
      [1024, 768],
      [1440, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      const geometry = await signal.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const group = element.parentElement!.getBoundingClientRect();
        return {
          width: box.width,
          centerX: box.left + box.width / 2,
          groupCenterY: group.top + group.height / 2,
          fits:
            group.left >= 0 &&
            group.right <= innerWidth &&
            group.top >= 0 &&
            group.bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.width).toBeCloseTo(
        Math.max(64, Math.min(112, width * 0.1)),
        0,
      );
      expect(geometry.centerX).toBeCloseTo(width / 2, 0);
      expect(geometry.groupCenterY).toBeCloseTo(height / 2, 0);
      expect(geometry).toMatchObject({ fits: true, overflow: false });
    }
    const motion = await page.locator(".loading-step").evaluateAll((steps) =>
      steps.map((step) => {
        const animation = step.getAnimations()[0];
        if (!animation) return null;
        animation.pause();
        animation.currentTime = 0;
        const start = getComputedStyle(step).transform;
        animation.currentTime = 720;
        return { start, raised: getComputedStyle(step).transform };
      }),
    );
    expect(motion).toHaveLength(3);
    for (const step of motion) {
      expect(step).not.toBeNull();
      expect(step!.raised).not.toBe(step!.start);
    }
    await page.screenshot({
      path: test.info().outputPath("refresh-desktop.png"),
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const still = await page.locator(".loading-step").evaluateAll((steps) =>
      steps.map((step) => ({
        animation: getComputedStyle(step).animationName,
        opacity: getComputedStyle(step).opacity,
        transform: getComputedStyle(step).transform,
      })),
    );
    expect(still).toEqual(
      Array(3).fill({ animation: "none", opacity: "1", transform: "none" }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: test.info().outputPath("refresh-mobile-reduced-motion.png"),
    });
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-signal")).toHaveCount(0);
});
