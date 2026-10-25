import { choosePriority } from "./task-fields";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("/tasks?view=board");
  await expect(page.locator(".board-task").first()).toBeVisible();
});
test("board titles stay compact and priorities keep their colors through editing", async ({
  page,
}) => {
  const title =
    "Prepare a detailed launch plan with all of the project milestones, customer interview findings, release dependencies, and documentation updates for the upcoming product release";
  await page.evaluate((title) => {
    const key = "kazi.synthetic-demo.v2",
      s = JSON.parse(localStorage.getItem(key)!);
    s.tasks[0].title = title;
    s.tasks[0].priority = "high";
    localStorage.setItem(key, JSON.stringify(s));
  }, title);
  await page.reload();
  const button = page.getByRole("button", { name: title, exact: true }),
    card = button.locator(".board-task-title");
  await expect(card).toHaveAttribute("title", title);
  expect((await card.innerText()).length).toBeLessThanOrEqual(96);
  expect(await card.innerText()).toMatch(/…$/);
  const height = await card.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height.height).toBeLessThanOrEqual(height.line * 2 + 1);
  await expect(button.locator(".board-priority")).toHaveCSS(
    "background-color",
    "rgb(254, 226, 226)",
  );
  await button.click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    title,
  );
  await expect(page.getByLabel("Owner", { exact: true })).toBeVisible();
  await choosePriority(page, "low");
  await expect(
    page.getByLabel("Priority", { exact: true }).locator(".choice-dot"),
  ).toHaveCSS("background-color", "rgb(31, 132, 90)");
  await expect(page.getByLabel("Priority", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: title, exact: true })
      .locator(".board-priority"),
  ).toHaveText("low priority");
});
test("comments support files, persist after reload, and keep description links with the task", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Refine the homepage direction", exact: true })
    .click();
  const conversation = page.getByRole("region", { name: "Task activity" });
  await conversation
    .getByLabel("Add a comment")
    .fill("The first draft is ready. Please review the attached brief.");
  await conversation.getByLabel("Attach files to comment").setInputFiles({
    name: "review-brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Kazi review brief"),
  });
  await conversation
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await expect(
    conversation.getByText(
      "The first draft is ready. Please review the attached brief.",
      { exact: true },
    ),
  ).toBeVisible();

  await expect(
    conversation.getByRole("button", {
      name: "Download review-brief.txt",
      exact: true,
    }),
  ).toBeVisible();
  const description = page.getByRole("region", {
    name: "Description attachments",
  });
  await description
    .getByRole("button", { name: "Add link", exact: true })
    .click();
  await description.getByLabel("Artifact link name").fill("Design reference");
  await description
    .getByLabel("Artifact URL")
    .fill("https://example.com/design-reference");
  await description.getByLabel("Artifact URL").press("Enter");
  await expect(
    description.getByRole("link", { name: /Design reference/ }),
  ).toHaveAttribute("href", "https://example.com/design-reference");
  await page.reload();
  const fresh = page.getByRole("region", { name: "Task activity" });

  await expect(
    fresh.getByText(
      "The first draft is ready. Please review the attached brief.",
      { exact: true },
    ),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await fresh
    .getByRole("button", { name: "Download review-brief.txt", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("review-brief.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe(
    "Kazi review brief",
  );
  await expect(
    page
      .getByRole("region", { name: "Description attachments" })
      .getByRole("link", { name: /Design reference/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await fresh.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/task-collaboration-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/task-collaboration.png",
    animations: "disabled",
  });
});
