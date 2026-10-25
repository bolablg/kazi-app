import { expect, test, type Page } from "@playwright/test";

async function openGantt(page: Page, view = "gantt") {
  await page.clock.install({ time: new Date("2026-10-26T13:00:00Z") });
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  const projectId = await page.evaluate(() => {
    const key = "kazi.synthetic-demo.v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    const project = state.projects.find(
      (p: any) => p.title === "Website launch",
    );
    const base = state.tasks.find((t: any) => t.projectId === project.id);
    const prerequisite = crypto.randomUUID();
    const range = crypto.randomUUID();
    const make = (title: string, patch: Record<string, unknown> = {}) => ({
      ...base,
      id: crypto.randomUUID(),
      title,
      status: "todo",
      startDate: undefined,
      deadline: undefined,
      parentId: undefined,
      milestone: false,
      dependencies: [],
      ...patch,
    });
    state.tasks = [
      ...state.tasks.filter((t: any) => t.projectId !== project.id),
      make("Design foundations", {
        id: prerequisite,
        startDate: "2026-10-01",
        deadline: "2026-10-28",
      }),
      make("Build the release", {
        id: range,
        startDate: "2026-10-27",
        deadline: "2026-10-30",
        dependencies: [prerequisite],
      }),
      make("Launch milestone", {
        startDate: "2026-10-27",
        deadline: "2026-11-02",
        milestone: true,
      }),
      make("Deadline checkpoint", { deadline: "2026-11-03" }),
      make("Prepare launch notes", { parentId: range }),
      make("Archived planning", { status: "archived", deadline: "2026-10-31" }),
    ];
    localStorage.setItem(key, JSON.stringify(state));
    return project.id;
  });
  await page.goto(`/project/${projectId}?view=${view}`);
  return projectId;
}

test("Gantt displays dependencies and milestones and opens undated subtasks for planning", async ({
  page,
}) => {
  const projectId = await openGantt(page);
  await expect(
    page.getByRole("button", { name: "Gantt", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const chart = page.getByRole("region", {
    name: "Project Gantt chart",
    exact: true,
  });
  await expect(chart.locator(".gantt-row")).toHaveCount(4);
  await expect(chart.locator(".gantt-dependencies > g")).toHaveCount(1);
  await expect(
    chart.getByText("1 task has dependency date conflicts"),
  ).toBeVisible();
  const milestone = chart.getByRole("button", {
    name: "Launch milestone, 2026-11-02 to 2026-11-02, milestone",
    exact: true,
  });
  await expect(milestone).toHaveText("◆");
  await expect(chart.locator(".deadline-marker")).toHaveAccessibleName(
    "Deadline checkpoint, 2026-11-03 to 2026-11-03, deadline only",
  );
  await expect(chart.getByText("Archived planning")).toHaveCount(0);
  await chart.getByLabel("Gantt scale").selectOption("month");
  await expect(milestone).toHaveText("◆");
  await chart.getByText("1 task without dates", { exact: true }).click();
  await chart.getByRole("button", { name: /Prepare launch notes/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Task title", exact: true }),
  ).toHaveValue("Prepare launch notes");
  await page.getByLabel("Planned start", { exact: true }).fill("2026-10-29");
  await page
    .getByLabel("Original deadline", { exact: true })
    .fill("2026-10-30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(chart.locator(".gantt-row")).toHaveCount(5);
  await expect(chart.locator(".gantt-undated")).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Gantt", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/project/${projectId}\\?view=gantt$`),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Gantt", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const width of [390, 768, 1440]) {
  test(`Gantt date navigation and sticky names work at ${width}px, including legacy links`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 });
    await openGantt(page, "timeline");
    const chart = page.getByRole("region", {
      name: "Project Gantt chart",
      exact: true,
    });
    await expect(
      page.getByRole("button", { name: "Gantt", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const scroll = chart.getByRole("region", {
      name: "Gantt timeline, scroll to explore dates",
      exact: true,
    });
    await chart.getByRole("button", { name: "Today", exact: true }).click();
    const todayScroll = await scroll.evaluate((element) => element.scrollLeft);
    expect(todayScroll).toBeGreaterThan(0);
    await expect(chart.locator(".gantt-name").first()).toBeInViewport();
    await chart
      .getByRole("button", { name: "First task", exact: true })
      .click();
    expect(await scroll.evaluate((element) => element.scrollLeft)).toBeLessThan(
      todayScroll,
    );
    const first = chart.locator(".gantt-name").first();
    const box = await first.boundingBox();
    const viewport = await scroll.boundingBox();
    expect(Math.abs(box!.x - viewport!.x)).toBeLessThanOrEqual(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await chart.getByRole("button", { name: "Today", exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath("gantt.png"),
      fullPage: true,
    });
  });
}
