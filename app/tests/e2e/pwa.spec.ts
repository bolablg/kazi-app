import { test, expect } from "@playwright/test";
test.use({ baseURL: process.env.KAZI_PREVIEW_URL ?? "http://127.0.0.1:4173" });
test("production PWA precaches its shell and reloads into a read-only offline view", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(true);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(
    manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512"),
  ).toBe(true);
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "/momentum-favicon.svg");
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Overview",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".wordmark img")
        .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
  await expect(
    page.getByText(/You’re offline. This is a read-only view/),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('14px "Atlassian Sans"')),
  ).toBe(true);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Create task" }),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("service-worker caches contain only static assets and no live account API data", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  expect(cached.length).toBeGreaterThan(5);
  expect(cached.some((url) => /convex\.(cloud|site)|clerk\./.test(url))).toBe(
    false,
  );
  expect(cached.some((url) => url.includes("/assets/"))).toBe(true);
  expect(cached.some((url) => url.includes("/brand/kazi-logo.svg"))).toBe(true);
  expect(cached.some((url) => url.includes("/momentum-maskable.png"))).toBe(
    true,
  );
  expect(cached.some((url) => /atlassian-sans-latin.*\.woff2/.test(url))).toBe(
    true,
  );
});
