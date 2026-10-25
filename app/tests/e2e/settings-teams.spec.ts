import { expect, test } from "@playwright/test";

test("Settings keeps account and planning, saves thresholds, discards drafts, and exports authorized data", async ({
  page,
}) => {
  await page.goto("/settings");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await expect(sections.getByRole("button")).toHaveText([
    "My account",
    "Planning",
  ]);
  for (const text of [
    "Install Kazi",
    "Connection & service status",
    "Application details",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  const threshold = page.getByLabel("backlog aging threshold"),
    save = page.getByRole("button", { name: "Save preferences", exact: true });
  await expect(save).toBeDisabled();
  await threshold.fill("85");
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(threshold).toHaveValue("90");
  await threshold.fill("80");
  await save.click();
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(threshold).toHaveValue("80");
  const review = page.getByRole("switch", {
    name: "Review new plans before scheduling",
  });
  await review.click();
  await expect(page.locator(".automatic-notice")).toContainText(
    "Saving enables",
  );
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(review).toHaveAttribute("aria-checked", "true");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export my data", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^kazi-export-.*\.json$/,
  );
  await sections
    .getByRole("button", { name: "My account", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=account/);
  await page.goto("/settings?tab=workspace");
  await expect(
    sections.getByRole("button", { name: "My account", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const width of [390, 768, 1440])
  test(`Settings and people fit ${width}px with padded tabs and flat, colorful thresholds`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.goto("/settings");
    const tiles = page.locator(".threshold-tile");
    await expect(tiles).toHaveCount(4);
    expect(
      new Set(
        await tiles.evaluateAll((elements) =>
          elements.map((e) => getComputedStyle(e).backgroundColor),
        ),
      ).size,
    ).toBe(4);
    for (const input of await tiles.locator("input").all())
      expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const tab = page.getByRole("button", { name: "Planning", exact: true });
    await tab.hover();
    expect(
      await tab.evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft)),
    ).toBeGreaterThanOrEqual(14);
    for (const route of ["/settings", "/teams", "/team"]) {
      await page.goto(route);
      if (route === "/team")
        await page
          .getByRole("button", { name: "People & access", exact: true })
          .click();
      await expect(page.locator("main .page")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
      expect(
        await page.locator("main *").evaluateAll((elements) =>
          elements
            .filter((e) => e.getClientRects().length)
            .filter((e) => {
              const s = getComputedStyle(e);
              return (
                s.boxShadow !== "none" ||
                s.textShadow !== "none" ||
                s.filter.includes("drop-shadow")
              );
            })
            .map((e) => e.className),
        ),
      ).toEqual([]);
      if (route !== "/teams")
        await page.screenshot({
          path: `../docs/screenshots/${route === "/settings" ? "settings-planning" : "team-people"}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      if (route === "/settings") {
        await page.locator(".workflow-thresholds").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `../docs/screenshots/settings-thresholds-${width}.png`,
          animations: "disabled",
        });
      }
    }
  });

test("the owner can promote and demote a teammate and invite a manager with clear role names", async ({
  page,
}) => {
  await page.goto("/teams");
  await page
    .getByRole("button", { name: "People & access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "People & access", exact: true }),
  ).toBeVisible();
  const role = page.getByRole("combobox", { name: "Role for Amira Chen" });
  await expect(role).toHaveValue("member");
  await role.selectOption("admin");
  await page.reload();
  await page
    .getByRole("button", { name: "People & access", exact: true })
    .click();
  await expect(role).toHaveValue("admin");
  await role.selectOption("member");
  await page.reload();
  await page
    .getByRole("button", { name: "People & access", exact: true })
    .click();
  await expect(role).toHaveValue("member");
  await page
    .getByRole("button", { name: "Invite a teammate", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Teammate’s email").fill("teammate@example.test");
  await modal.getByLabel("Role", { exact: true }).selectOption("admin");
  await page.screenshot({
    path: "../docs/screenshots/team-invite-manager.png",
    animations: "disabled",
  });
  await modal
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  await expect(
    modal.getByText("Demo invitation", { exact: true }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Done", exact: true }).click();
  const invitation = page
    .locator(".invitation-row")
    .filter({ hasText: "teammate@example.test" });
  await expect(invitation.getByText("Manager", { exact: true })).toBeVisible();
  await invitation.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(invitation).toHaveCount(0);
  await expect(
    page.getByText("Access applies to projects in this application", {
      exact: false,
    }),
  ).toHaveCount(0);
});
