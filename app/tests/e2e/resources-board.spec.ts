import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
});
test("project and task permalinks use opaque IDs, survive refresh and rename, and follow browser history", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9]{32}$/);
  const projectUrl = page.url();
  await page
    .getByRole("button", { name: "Refine the homepage direction", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[a-f0-9]{32}\/task\/[a-f0-9]{32}$/);
  const taskUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeVisible();
  await page.getByLabel("Task title").fill("A renamed task");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(taskUrl);
  await page.goBack();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeHidden();
  await expect(page).toHaveURL(projectUrl);
  await page.goForward();
  await expect(page.getByLabel("Task title")).toHaveValue("A renamed task");
  await page.getByRole("button", { name: "Close task" }).click();
  await page.goto("/projects/website");
  await expect(page).toHaveURL(projectUrl);
  await page.goto("/task/t1");
  await expect(page).toHaveURL(taskUrl);
});
test("dragging a task changes its board status and completion analytics, while clicking opens details", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const title = "Review the onboarding flow",
    start = page.getByRole("button", { name: `Move ${title}`, exact: true });
  await page
    .locator(".task-board-scroll")
    .evaluate((e) => (e.scrollLeft = 200));
  await start.scrollIntoViewIfNeeded();
  const from = await start.boundingBox(),
    target = await page
      .getByRole("region", { name: "In progress column", exact: true })
      .boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 30, from!.y + 20, { steps: 5 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 100, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(
    page
      .getByRole("region", { name: "In progress column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(start).toBeEnabled();
  await start.focus();
  await page.keyboard.press("Space");
  await expect(start).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".board-column.drop-target")).toHaveAttribute(
    "data-status",
    "to_validate",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".board-column.drop-target")).toHaveAttribute(
    "data-status",
    "done",
  );
  await page.keyboard.press("Space");
  await expect(
    page
      .getByRole("region", { name: "Completed column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeHidden();
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Completed column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeVisible();
  await expect(page.getByLabel("Task status", { exact: true })).toHaveValue(
    "done",
  );
  await page.getByRole("button", { name: "Close task" }).click();
  await page
    .getByRole("button", { name: `Move ${title}`, exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: `Move ${title}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".board-column.drop-target")).toHaveAttribute(
    "data-status",
    "to_validate",
  );
  await page.keyboard.press("Space");
  await expect(
    page
      .getByRole("region", { name: "To validate column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Move ${title}`, exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: `Move ${title}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("region", { name: "To validate column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  const handle = await page
    .getByRole("button", { name: `Move ${title}`, exact: true })
    .boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle!.x - 20, handle!.y + 20, { steps: 5 });
  await page.mouse.move(20, 20, { steps: 10 });
  await page.mouse.up();
  await expect(
    page
      .getByRole("region", { name: "To validate column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await expect(
    page.getByRole("button", { name: `Move ${title}`, exact: true }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/board-drag-drop.png",
  });
});
test("account controls appear once under the account menu with centered icons", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "App settings" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Connections", exact: true }),
  ).toBeHidden();
  await page.getByLabel("User menu").click();
  for (const name of [
    "My account",
    "Settings",
    "Connections",
    "Team & people",
  ]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const offset = await link.evaluate((element) => {
      const icon = element.querySelector("svg")!.getBoundingClientRect(),
        row = element.getBoundingClientRect();
      return Math.abs(icon.y + icon.height / 2 - row.y - row.height / 2);
    });
    expect(offset).toBeLessThanOrEqual(1);
  }
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByLabel("User menu").click();
  await page.getByRole("link", { name: "Team & people", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Teams & people", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "People & access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "People & access", exact: true }),
  ).toBeVisible();
});
test("unknown resource IDs show unavailable without exposing or changing task data", async ({
  page,
}) => {
  await page.goto(
    "/project/00000000000000000000000000000000/task/ffffffffffffffffffffffffffffffff",
  );
  await expect(
    page.getByText("This task isn’t available.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Task details" }),
  ).toBeHidden();
});

test("touch handles move tasks on a tablet and capture an automatic start timestamp", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("http://127.0.0.1:5175/projects");
  await page.getByRole("link", { name: "Website launch", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const title = "Review the onboarding flow";
  await page
    .locator(".task-board-scroll")
    .evaluate((e) => (e.scrollLeft = 200));
  await page
    .getByRole("button", { name: `Move ${title}`, exact: true })
    .scrollIntoViewIfNeeded();
  const from = await page
      .getByRole("button", { name: `Move ${title}`, exact: true })
      .boundingBox(),
    to = await page
      .getByRole("region", { name: "In progress column", exact: true })
      .boundingBox();
  const session = await context.newCDPSession(page),
    x = from!.x + from!.width / 2,
    y = from!.y + from!.height / 2;
  await page.clock.setFixedTime(new Date("2026-10-26T13:00:00Z"));
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 15; step++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: x + ((to!.x + to!.width / 2 - x) * step) / 15,
          y: y + ((to!.y + 100 - y) * step) / 15,
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page
      .getByRole("region", { name: "In progress column", exact: true })
      .getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  const started = await page.evaluate(
    (title) =>
      JSON.parse(localStorage.getItem("kazi.synthetic-demo.v2")!).tasks.find(
        (t: { title: string }) => t.title === title,
      ).startedAt,
    title,
  );
  expect(started).toBe(new Date("2026-10-26T13:00:00Z").getTime());
  await context.close();
});
