import { test, expect } from "@playwright/test";

test("project archive follows its URL through refresh and browser history", async ({
  page,
}) => {
  await page.goto("/projects?view=archive");
  await expect(
    page.getByRole("button", { name: "Archived", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("link", { name: "Website launch", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Archived", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Active projects/ }).click();
  await expect(
    page.getByRole("link", { name: "Website launch", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Archived", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("task archive counts the archived results instead of active work", async ({
  page,
}) => {
  await page.goto("/tasks?view=archive");
  await expect(page.locator(".table-footer")).toHaveText("0 tasks");
  await expect(
    page.getByRole("heading", { name: "Nothing archived", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`project views and member controls are usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await page.goto("/projects/website?view=archive");
    const archive = page
      .getByRole("button", { name: "Archive", exact: true })
      .last();
    await expect(archive).toHaveAttribute("aria-pressed", "true");
    await expect(archive).toBeInViewport();
    const tabs = page.locator(".project-view-toolbar .tabs");
    const bounds = await tabs.boundingBox();
    const selected = await archive.boundingBox();
    expect(selected!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
    expect(selected!.x + selected!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width + 1,
    );
    await page.getByRole("button", { name: /project members/ }).click();
    const dialog = page.getByRole("dialog");
    const member = dialog.locator(".member-choice").first();
    await member.scrollIntoViewIfNeeded();
    const boxes = await member.evaluate((element) => {
      const avatar = element.querySelector(".avatar")!.getBoundingClientRect();
      const checkbox = element.querySelector("input")!.getBoundingClientRect();
      return {
        avatarY: avatar.y + avatar.height / 2,
        checkboxY: checkbox.y + checkbox.height / 2,
        avatarX: avatar.x,
        checkboxX: checkbox.x,
      };
    });
    expect(Math.abs(boxes.avatarY - boxes.checkboxY)).toBeLessThanOrEqual(1);
    expect(boxes.checkboxX).toBeGreaterThan(boxes.avatarX + 100);
    await dialog
      .getByRole("combobox", { name: "Priority", exact: true })
      .click();
    await expect(
      page.getByRole("listbox", { name: "Priority options" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

for (const width of [1440, 1920]) {
  test(`all five board stages fit the available desktop width at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto("/tasks?view=board");
    const board = page.locator(".task-board-scroll");
    const completed = page.getByRole("region", {
      name: "Completed column",
      exact: true,
    });
    await expect(completed).toBeInViewport();
    const viewport = await board.boundingBox();
    const column = await completed.boundingBox();
    expect(column!.x + column!.width).toBeLessThanOrEqual(
      viewport!.x + viewport!.width + 1,
    );
    expect(
      await board.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`long project and task titles stay readable within their layouts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const target = await page.evaluate(() => {
      const key = "kazi.synthetic-demo.v2";
      const state = JSON.parse(localStorage.getItem(key)!);
      const project = state.projects.find(
        (item: { title: string }) => item.title === "Website launch",
      );
      project.title = "InternationalWebsiteLaunchReview".repeat(5);
      const task = state.tasks.find(
        (item: { projectId: string }) => item.projectId === project.id,
      );
      task.title =
        "Review the international onboarding experience and all customer-facing launch preparation materials "
          .repeat(2)
          .slice(0, 180);
      localStorage.setItem(key, JSON.stringify(state));
      return {
        projectId: project.id,
        projectTitle: project.title,
        taskTitle: task.title,
      };
    });
    await page.goto("/project/" + target.projectId);
    const title = page.getByRole("heading", {
      name: target.projectTitle,
      exact: true,
    });
    const box = await title.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await title.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Favorite " + target.projectTitle,
        exact: true,
      }),
    ).toBeInViewport();
    const rowTitle = page
      .getByRole("button", { name: target.taskTitle, exact: true })
      .locator(".task-title");
    const geometry = await rowTitle.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1);
    await page
      .getByRole("button", { name: target.taskTitle, exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Task title", exact: true }),
    ).toHaveValue(target.taskTitle);
  });
}
