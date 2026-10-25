import { expect, test } from "@playwright/test";

test("search is readable, groups only matches, and explains an empty result", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search Kazi" });
  const input = page.getByRole("textbox", { name: "Search Kazi", exact: true });
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await input.fill("website");
  await expect(dialog.getByText("PROJECTS", { exact: true })).toBeVisible();
  await expect(dialog.getByText("TASKS", { exact: true })).toHaveCount(0);
  await input.fill("no-match-example-4182");
  await expect(dialog.getByRole("status")).toHaveText(
    "No matching tasks or projects",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("planning switch has a touch target and missing invitations have an exit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const toggle = page.getByRole("switch", {
    name: "Review new plans before scheduling",
  });
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(page.locator(".automatic-notice")).toBeVisible();
  await page.goto("/join");
  await expect(
    page.getByRole("heading", { name: "Invitation link missing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to overview" }).click();
  await expect(page).toHaveURL("/");
});
