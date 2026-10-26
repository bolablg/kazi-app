import { test, expect, type Page } from "@playwright/test";

const title = "Refine the homepage direction";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
});
async function openTray(page: Page) {
  const toggle = page.getByRole("button", {
    name: "Unscheduled tasks",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
}
async function reserve(page: Page, task = title) {
  await openTray(page);
  await page
    .getByRole("button", { name: "Reserve time for " + task, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reserve time",
    exact: true,
  });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T09:00");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T10:00");
  const consent = dialog.getByRole("checkbox", {
    name: "Reserve this time in my Kazi agenda",
    exact: true,
  });
  if (await consent.count()) await consent.check();
  await dialog
    .getByRole("button", { name: "Reserve time", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
const state = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!),
  );

test("calendar reserves, moves, releases and undoes time without changing task status or deadline", async ({
  page,
}) => {
  await page.goto("/calendar?range=day&date=2026-10-26");
  const before = await state(page);
  const task = before.tasks.find(
    (task: { title: string }) => task.title === title,
  );
  await reserve(page);
  const edit = page.getByRole("button", {
    name: "Edit time for " + title,
    exact: true,
  });
  await expect(edit).toBeVisible();
  await page.reload();
  await expect(edit).toBeVisible();
  let data = await state(page);
  expect(data.calendarSessions).toHaveLength(1);
  expect(
    data.tasks.find((row: { id: string }) => row.id === task.id),
  ).toMatchObject({ status: task.status, deadline: task.deadline });
  await edit.click();
  let dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T10:15");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T11:15");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  data = await state(page);
  expect(data.calendarSessions[0].start).toBe(
    Date.parse("2026-10-26T15:15:00Z"),
  );
  await page
    .locator(".calendar-undo")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).calendarSessions[0].start)
    .toBe(Date.parse("2026-10-26T14:00:00Z"));
  await edit.click();
  dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Release time", exact: true })
    .click();
  await expect(edit).toHaveCount(0);
  expect((await state(page)).calendarSessions[0].status).toBe("released");
  await page
    .locator(".calendar-undo")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(edit).toBeVisible();
  await page.reload();
  data = await state(page);
  expect(data.calendarSessions[0].status).toBe("scheduled");
  expect(
    data.tasks.find((row: { id: string }) => row.id === task.id),
  ).toMatchObject({ status: task.status, deadline: task.deadline });
  expect(
    data.calendarSessions[0].history.map(
      (entry: { action: string }) => entry.action,
    ),
  ).toContain("rescheduled");
  expect(
    data.calendarSessions[0].history.map(
      (entry: { action: string }) => entry.action,
    ),
  ).toContain("released");
});

test("reservation checks prevent booking over busy time and preserve the task's deadline", async ({
  page,
}) => {
  await page.goto("/calendar?range=day&date=2026-10-26");
  await openTray(page);
  await page
    .getByRole("button", { name: "Reserve time for " + title, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reserve time",
    exact: true,
  });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T12:00");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T13:00");
  await expect(dialog.getByLabel("Reservation checks")).toContainText(
    /overlaps/,
  );
  const consent = dialog.getByRole("checkbox", {
    name: "Reserve this time in my Kazi agenda",
    exact: true,
  });
  if (await consent.count()) await consent.check();
  await dialog
    .getByRole("button", { name: "Reserve time", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect((await state(page)).calendarSessions ?? []).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Calendar Insights reflect current reservations and preserve person/project scope", async ({
  page,
}) => {
  await page.goto("/calendar?range=day&date=2026-10-26");
  await reserve(page);
  await page.goto("/insights?tab=Calendar");
  await page
    .getByLabel("Insights period", { exact: true })
    .selectOption("custom");
  await page
    .getByLabel("Insights start date", { exact: true })
    .fill("2026-10-26");
  await page
    .getByLabel("Insights end date", { exact: true })
    .fill("2026-10-26");
  const summary = page.getByLabel("Calendar planning summary", { exact: true });
  await expect(summary).toContainText("Reserved time");
  await expect(summary.locator('[data-tone="orange"] strong')).toHaveText("1h");
  await expect(summary).not.toContainText(
    /logged|productivity score|actual work/i,
  );
  await expect(
    page.getByRole("region", { name: "Allocation by project", exact: true }),
  ).toContainText("Website launch");
  await page
    .getByLabel("Insights project", { exact: true })
    .selectOption({ label: "Cloud certification" });
  await expect(summary.locator('[data-tone="orange"] strong')).toHaveText("0m");
  await expect(
    page.getByRole("region", { name: "Allocation by project", exact: true }),
  ).toContainText("No reservations in this period");
  await page
    .getByLabel("Insights project", { exact: true })
    .selectOption({ label: "Website launch" });
  await expect(summary.locator('[data-tone="orange"] strong')).toHaveText("1h");
  await page
    .getByLabel("Insights person", { exact: true })
    .selectOption({ label: "Amira Chen" });
  await expect(summary.locator('[data-tone="orange"] strong')).toHaveText("0m");
  await page.getByRole("link", { name: "Open calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("person")).toBeTruthy();
  expect(url.searchParams.get("project")).not.toBe("all");
  expect(url.searchParams.get("date")).toBe("2026-10-26");
});

for (const width of [390, 768, 1440]) {
  test(`calendar places the grid first and keeps planning/insights usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.goto("/calendar");
    const view = page.getByLabel("Calendar view", { exact: true });
    await expect(view).toHaveValue(width === 390 ? "day" : "workweek");
    const grid = page.getByLabel("Scrollable work calendar", { exact: true });
    expect((await grid.boundingBox())!.y).toBeLessThan(350);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await view.selectOption("month");
    await expect(
      page.getByRole("table", { name: "Monthly work calendar", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    const navigated = page.url();
    await page.reload();
    await expect(page).toHaveURL(navigated);
    await expect(view).toHaveValue("month");
    await page.goto("/insights?tab=Calendar");
    await expect(
      page.getByRole("tabpanel", { name: "Calendar", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`calendar-insights-${width}.png`),
      fullPage: true,
    });
  });
}

test("dragging a task and keyboard-resizing a reservation both open explicit time confirmation", async ({
  page,
}) => {
  await page.goto("/calendar?range=day&date=2026-10-26");
  await openTray(page);
  const source = page
    .locator(".calendar-tray-task")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  const target = page.locator(".time-calendar-body");
  await source.dragTo(target, { targetPosition: { x: 80, y: 64 } });
  let dialog = page.getByRole("dialog", { name: "Reserve time", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .getByLabel("Task to schedule", { exact: true })
      .locator("option:checked"),
  ).toHaveText(title);
  expect((await state(page)).calendarSessions ?? []).toHaveLength(0);
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T09:00");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T10:00");
  const consent = dialog.getByRole("checkbox", {
    name: "Reserve this time in my Kazi agenda",
    exact: true,
  });
  if (await consent.count()) await consent.check();
  await dialog
    .getByRole("button", { name: "Reserve time", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const resize = page.getByRole("button", {
    name: "Resize end time for " + title,
    exact: true,
  });
  await resize.focus();
  await resize.press("ArrowDown");
  dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await expect(dialog.getByLabel("Session end", { exact: true })).toHaveValue(
    "2026-10-26T10:15",
  );
  expect((await state(page)).calendarSessions[0].end).toBe(
    Date.parse("2026-10-26T15:00:00Z"),
  );
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect((await state(page)).calendarSessions[0].end).toBe(
    Date.parse("2026-10-26T15:15:00Z"),
  );
});

test("weekly sessions preserve local time through DST and series Undo restores occurrence exceptions", async ({
  page,
}) => {
  const recurringTitle = "Weekly strategy review";
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New task", exact: true });
  await create
    .getByLabel("What needs to get done?", { exact: true })
    .fill(recurringTitle);
  await create.getByLabel("Estimated minutes", { exact: true }).fill("180");
  await create
    .getByLabel("Initial stage", { exact: true })
    .selectOption("todo");
  await create
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(create).not.toBeVisible();
  await page.goto("/calendar?range=day&date=2026-10-26");
  await openTray(page);
  await page
    .getByRole("button", {
      name: "Reserve time for " + recurringTitle,
      exact: true,
    })
    .click();
  let dialog = page.getByRole("dialog", { name: "Reserve time", exact: true });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T09:00");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T10:00");
  await dialog
    .getByLabel("Repeat focus session", { exact: true })
    .selectOption("weekly");
  await dialog
    .getByLabel("Number of focus sessions", { exact: true })
    .fill("3");
  await dialog
    .getByLabel("Session reminder", { exact: true })
    .selectOption("10");
  const consent = dialog.getByRole("checkbox", {
    name: "Reserve this time in my Kazi agenda",
    exact: true,
  });
  if (await consent.count()) await consent.check();
  await dialog
    .getByRole("button", { name: "Reserve time", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  let sessions = (await state(page)).calendarSessions;
  expect(sessions).toHaveLength(3);
  expect(
    new Set(sessions.map((session: { seriesId: string }) => session.seriesId))
      .size,
  ).toBe(1);
  expect(
    sessions.map((session: { start: number }) => session.start).sort(),
  ).toEqual([
    Date.parse("2026-10-26T14:00:00Z"),
    Date.parse("2026-11-02T15:00:00Z"),
    Date.parse("2026-11-09T15:00:00Z"),
  ]);
  expect(
    sessions.every(
      (session: { reminderMinutes: number }) => session.reminderMinutes === 10,
    ),
  ).toBe(true);
  await page.goto("/calendar?range=day&date=2026-11-09");
  await page
    .getByRole("button", {
      name: "Edit time for " + recurringTitle,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-11-09T10:30");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  sessions = (await state(page)).calendarSessions.sort(
    (a: { start: number }, b: { start: number }) => a.start - b.start,
  );
  expect(sessions[2].end - sessions[2].start).toBe(90 * 60000);
  const beforeSeries = sessions.map(
    (session: { id: string; start: number; end: number }) => ({
      id: session.id,
      start: session.start,
      end: session.end,
    }),
  );
  await page.goto("/calendar?range=day&date=2026-10-26");
  await page
    .getByRole("button", {
      name: "Edit time for " + recurringTitle,
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Edit calendar time",
    exact: true,
  });
  await dialog
    .getByLabel("Session start", { exact: true })
    .fill("2026-10-26T09:30");
  await dialog
    .getByLabel("Session end", { exact: true })
    .fill("2026-10-26T10:30");
  await dialog
    .getByLabel("Edit recurring sessions", { exact: true })
    .selectOption("series");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  sessions = (await state(page)).calendarSessions;
  expect(
    sessions.every(
      (session: { start: number; end: number }) =>
        session.end - session.start === 60 * 60000,
    ),
  ).toBe(true);
  await page
    .locator(".calendar-undo")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  sessions = (await state(page)).calendarSessions;
  expect(
    sessions
      .map((session: { id: string; start: number; end: number }) => ({
        id: session.id,
        start: session.start,
        end: session.end,
      }))
      .sort((a: { start: number }, b: { start: number }) => a.start - b.start),
  ).toEqual(beforeSeries);
});
