import type { Page } from "@playwright/test";
import { statusLabels, type Task } from "../../shared/model";
export async function chooseStatus(page: Page, status: Task["status"]) {
  await page
    .getByRole("combobox", { name: "Task status", exact: true })
    .click();
  await page
    .getByRole("option", { name: statusLabels[status], exact: true })
    .click();
}
export async function choosePriority(page: Page, value: Task["priority"]) {
  await page.getByRole("combobox", { name: "Priority", exact: true }).click();
  await page
    .getByRole("option", {
      name: value[0].toUpperCase() + value.slice(1),
      exact: true,
    })
    .click();
}
export async function choosePerson(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(name);
  await page.getByRole("option").filter({ hasText: name }).click();
}
