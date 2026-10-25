import { test, expect } from "@playwright/test";
import { choosePerson } from "./task-fields";

test("task creation searches identities and comments preserve highlighted mentions and collaborators", async ({
  page,
}) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Task belongs to")).toContainText("team");
  await form
    .getByLabel("What needs to get done?")
    .fill("Review the new collaboration flow");
  await choosePerson(page, "Owner", "amira@example.test");
  await expect(
    form.getByRole("combobox", { name: "Owner", exact: true }),
  ).toHaveValue("Amira Chen");
  await choosePerson(page, "Worker", "alex");
  await choosePerson(page, "Collaborators", "daniel.okafor");
  await expect(form.locator(".person-chip")).toContainText("Daniel Okafor");
  const description = form.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.fill("Please review with @amira@example");
  await page.getByRole("option").filter({ hasText: "Amira Chen" }).click();
  await expect(form.locator(".person-mention")).toHaveText("@amira.chen");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Review the new collaboration flow",
      exact: true,
    })
    .click();
  const task = page.getByRole("article", { name: "Task details" });
  await expect(
    task.getByRole("combobox", { name: "Owner", exact: true }),
  ).toHaveValue("Amira Chen");
  await expect(task.locator(".task-description .person-mention")).toHaveText(
    "@amira.chen",
  );
  await expect(task.locator(".person-chip")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Task title", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../docs/screenshots/task-people-desktop.png",
    animations: "disabled",
  });
  const comment = task.getByRole("textbox", {
    name: "Add a comment",
    exact: true,
  });
  await comment.fill("Can you check this, @daniel.okafor");
  await comment.press("Enter");
  await task.getByRole("button", { name: "Post comment", exact: true }).click();
  const event = task
    .locator(".task-conversation-event.comment")
    .filter({ hasText: "Can you check this" });
  await expect(event.locator(".person-mention")).toHaveText("@daniel.okafor");
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(event.locator(".person-mention")).toHaveText("@daniel.okafor");
  await page.setViewportSize({ width: 390, height: 844 });
  await comment.fill("@amira");
  await expect(
    page.getByRole("listbox", { name: "Mention suggestions" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await comment.press("Escape");
  await expect(task).toBeVisible();
  await expect(
    page.getByRole("listbox", { name: "Mention suggestions" }),
  ).toHaveCount(0);
  await comment.fill("Please check this @amira@example");
  await page.getByRole("option").filter({ hasText: "Amira Chen" }).click();
  await expect(
    task.locator(".task-comment-composer .person-mention"),
  ).toHaveText("@amira.chen");
  await page.screenshot({
    path: "../docs/screenshots/task-mentions-phone.png",
    animations: "disabled",
  });
});

test("private project people search excludes teammates without access", async ({
  page,
}) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Cloud certification" });
  const worker = form.getByRole("combobox", { name: "Worker", exact: true });
  await worker.fill("amira");
  await expect(
    page.getByText("No matching people with project access.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option").filter({ hasText: "Amira Chen" }),
  ).toHaveCount(0);
  await worker.press("Escape");
  await expect(form).toBeVisible();
});
