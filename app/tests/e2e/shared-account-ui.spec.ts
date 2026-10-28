import { expect, test, type Page } from "@playwright/test";
async function openAccount(page: Page, scenario = "central") {
  // Keep the exact configured development origin without touching a running 5192 app.
  await page.route("http://127.0.0.1:5192/**", async (route) => {
    const url = new URL(route.request().url());
    url.port = "5176";
    if (route.request().isNavigationRequest())
      url.pathname = "/tests/fixtures/account-ui/index.html";
    const response = await page.request.get(url.href);
    await route.fulfill({ response });
  });
  await page.goto(
    "http://127.0.0.1:5192/settings?tab=account&scenario=" + scenario,
  );
}
for (const width of [320, 390, 768, 1440])
  test(`shared account preserves host styling and fits ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await openAccount(page);
    const trigger = page.getByRole("button", {
      name: "iYANJU account: Central Identity",
      exact: true,
    });
    await trigger.click();
    const menu = page.getByRole("menu", {
      name: "iYANJU account",
      exact: true,
    });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Profile & security",
      "Your services",
      "Settings",
      "Connections",
      "Team & people",
      "Privacy policy",
      "Sign out",
    ]);
    await expect(
      menu.getByRole("menuitem", { name: "Profile & security", exact: true }),
    ).toHaveAttribute("href", "http://127.0.0.1:49569/account?view=profile");
    await expect(
      menu.getByRole("group", { name: "Kazi settings, Kazi role: Owner" }),
    ).toBeVisible();
    await expect(
      page.getByText("Local membership alias", { exact: true }),
    ).toHaveCount(0);
    const bounds = (await page.locator(".iy-popover").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(
      await trigger.evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain("iYANJU Account");
    expect(
      await page
        .locator(".host-font-probe")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain("Atlassian Sans");
    expect(
      await page
        .locator(".iy-popover *")
        .evaluateAll((els) =>
          els
            .filter((el) => getComputedStyle(el).boxShadow !== "none")
            .map((el) => el.className),
        ),
    ).toEqual([]);
    await page.locator(".iy-popover").screenshot({
      path: `../docs/screenshots/shared-account-menu-${width}.png`,
      animations: "disabled",
    });
    await page.screenshot({
      path: `../docs/screenshots/shared-account-${width}.png`,
      animations: "disabled",
      fullPage: true,
    });
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "Your services", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await page.mouse.click(width - 4, 4);
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await menu
      .getByRole("menuitem", { name: "Connections", exact: true })
      .click();
    await expect(page.getByTestId("current-route")).toHaveText("/connections");
  });
test("the adapter preserves sign-out failure/retry and service data", async ({
  page,
}) => {
  await openAccount(page, "retry");
  await page.evaluate(() => {
    localStorage.setItem("kazi.fixture.data", "keep");
    sessionStorage.setItem("kazi.identity.link.v1", "synthetic-only");
    sessionStorage.setItem("kazi.identity.provider.v1", "central");
  });
  await page
    .getByRole("button", {
      name: "iYANJU account: Central Identity",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Signing out…", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveText(
    "We couldn’t sign you out. Please try again.",
  );
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toBeFocused();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("sign-out-calls")).toHaveText("2");
  expect(
    await page.evaluate(() => ({
      data: localStorage.getItem("kazi.fixture.data"),
      provider: sessionStorage.getItem("kazi.identity.provider.v1"),
      proof: sessionStorage.getItem("kazi.identity.link.v1"),
    })),
  ).toEqual({ data: "keep", provider: "central", proof: null });
});
test("loading, signed-out, unavailable and legacy identities remain honest", async ({
  page,
}) => {
  await openAccount(page, "loading");
  await expect(
    page.getByText("Loading your account…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Local membership alias", { exact: true }),
  ).toHaveCount(0);
  await openAccount(page, "signed-out");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", /127.0.0.1:49569/);
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toBeVisible();
  await openAccount(page, "unavailable");
  await expect(
    page.getByText("Account unavailable.", { exact: true }),
  ).toBeVisible();
  await openAccount(page, "legacy");
  await page
    .getByRole("button", {
      name: "Legacy Kazi account: Central Identity",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Profile & security", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Legacy profile editor fixture", { exact: true }),
  ).toBeVisible();
});

test("production output excludes the synthetic identity adapter", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:4173/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const entry = html.match(/src="([^" ]*assets\/index-[^" ]+\.js)"/);
  expect(entry).not.toBeNull();
  const javascript = await (
    await request.get(new URL(entry![1], "http://127.0.0.1:4173").href)
  ).text();
  for (const marker of [
    "central-synthetic-id",
    "Synthetic identities only",
    "Legacy profile editor fixture",
  ])
    expect(javascript).not.toContain(marker);
});
