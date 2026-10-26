import { test, expect, type Page } from "@playwright/test";

const title = "Refine the homepage direction";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
});
const state = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );
async function savedViewerHours(page: Page) {
  await page.goto("/calendar?range=day&date=2026-10-26");
  await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2",
      data = JSON.parse(localStorage.getItem(key)!);
    const viewer = data.members.find(
      (member: { id: string }) => member.id === "demo-you",
    );
    viewer.preferences.startHour = 8;
    viewer.preferences.endHour = 17;
    // Private teammate settings must not become the viewer's grid reference.
    for (const member of data.members)
      if (member.id !== "demo-you") {
        member.preferences.startHour = 1;
        member.preferences.endHour = 23;
      }
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
}

for (const width of [390, 768, 1440]) {
  test(`calendar hides scrollbar chrome while wheel and keyboard scrolling work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await savedViewerHours(page);
    await page.goto("/calendar?range=week&date=2026-10-26");
    const frame = page.getByLabel("Scrollable work calendar", { exact: true });
    await expect(frame).toHaveCSS("scrollbar-width", "none");
    await expect(page.locator(".main-scroll")).toHaveCSS(
      "scrollbar-width",
      "none",
    );
    await expect(frame).toHaveCSS("overflow-y", "auto");
    await frame.focus();
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => frame.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(frame).toBeFocused();
    await expect
      .poll(() =>
        frame.evaluate((element) =>
          parseFloat(getComputedStyle(element).outlineWidth),
        ),
      )
      .toBeGreaterThan(0);
    await frame.evaluate((element) => {
      element.scrollTop = 0;
    });
    await frame.hover();
    await page.mouse.wheel(0, 180);
    await expect
      .poll(() => frame.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    if (width < 1000) {
      await page.mouse.wheel(220, 0);
      await expect
        .poll(() => frame.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    }
    await expect(page.locator(".time-calendar-select").first()).toHaveCSS(
      "cursor",
      "grab",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("combobox", { name: "Calendar view", exact: true })
      .selectOption(width < 700 ? "day" : "workweek");
    const grid = frame.locator(".time-calendar-columns");
    const lastDay = frame.locator(".time-calendar-day").last();
    expect(
      Math.abs(
        (await grid.boundingBox())!.x +
          (await grid.boundingBox())!.width -
          ((await lastDay.boundingBox())!.x +
            (await lastDay.boundingBox())!.width),
      ),
    ).toBeLessThan(1);
    await page.locator(".calendar-options > summary").click();
    await page.getByLabel("Include proposals", { exact: true }).check();
    await page.locator(".calendar-options > summary").click();
    await frame.evaluate((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    await page.getByRole("heading", { name: "Calendar", exact: true }).click();
    await page.locator(".main-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `/private/tmp/kazi-calendar-interaction-${width}.png`,
      animations: "disabled",
    });
  });
}

test("calendar derives its padded window from the viewer's saved week even on nonworking days", async ({
  page,
}) => {
  await savedViewerHours(page);
  const axis = page.locator(".time-calendar-axis > span");
  await expect(axis.first()).toHaveText("7 AM");
  await expect(axis.last()).toHaveText("5 PM");
  await expect(axis).toHaveCount(11);
  await page.goto("/calendar?range=day&date=2026-11-01");
  await expect(axis.first()).toHaveText("7 AM");
  await expect(axis.last()).toHaveText("5 PM");
  await expect(axis).toHaveCount(11);
});

test("upper and lower event edges extend time only after explicit confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await savedViewerHours(page);
  const tray = page.getByRole("button", {
    name: "Unscheduled tasks",
    exact: true,
  });
  if ((await tray.getAttribute("aria-expanded")) !== "true") await tray.click();
  await page
    .getByRole("button", { name: "Reserve time for " + title, exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Reserve time", exact: true });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T10:00");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T11:00");
  const consent = dialog.getByRole("checkbox", {
    name: "Reserve this time in my Kazi agenda",
    exact: true,
  });
  if (await consent.count()) await consent.check();
  await dialog
    .getByRole("button", { name: "Reserve time", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const event = page.locator(".time-calendar-event.editable");
  await expect(event.locator(".calendar-event-open")).toHaveCSS(
    "cursor",
    "grab",
  );
  const top = event.getByRole("button", {
    name: "Resize start time for " + title,
    exact: true,
  });
  const bottom = event.getByRole("button", {
    name: "Resize end time for " + title,
    exact: true,
  });
  await expect(top).toHaveCSS("cursor", "ns-resize");
  await expect(bottom).toHaveCSS("cursor", "ns-resize");
  const initial = (await state(page)).calendarSessions[0];
  let box = (await top.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 16, {
    steps: 5,
  });
  await page.mouse.up();
  dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Session start", { exact: true })).toHaveValue(
    "2026-10-26T09:45",
  );
  expect((await state(page)).calendarSessions[0].start).toBe(initial.start);
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect((await state(page)).calendarSessions[0].start).toBe(
    initial.start - 900000,
  );
  box = (await bottom.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 16, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Session end", { exact: true })).toHaveValue(
    "2026-10-26T11:15",
  );
  expect((await state(page)).calendarSessions[0].end).toBe(initial.end);
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const final = (await state(page)).calendarSessions[0];
  expect(final.start).toBe(initial.start - 900000);
  expect(final.end).toBe(initial.end + 900000);
});
