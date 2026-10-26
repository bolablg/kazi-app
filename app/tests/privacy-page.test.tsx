// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { PublicPages } from "../src/PublicPages";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

afterEach(cleanup);

it.each([
  "/privacy",
  "/privacy-policy",
  "/privacy-policy/",
  "/privacy/?source=signin",
])("renders %s without mounting account providers", (path) => {
  const accountProvider = vi.fn(() => {
    throw new Error("Account provider must not mount on a public notice");
  });
  const AccountProvider = accountProvider;
  render(
    <MemoryRouter initialEntries={[path]}>
      <PublicPages>
        <AccountProvider />
      </PublicPages>
    </MemoryRouter>,
  );
  expect(accountProvider).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Privacy policy",
  );
  expect(
    screen
      .getByRole("link", { name: "Contact Bolaji BALOGOUN" })
      .getAttribute("href"),
  ).toBe("mailto:bolajibalogoun@gmail.com?subject=Kazi%20privacy%20request");
});
it("discloses shared sign-in boundaries and preserves the policy's draft status", () => {
  render(
    <MemoryRouter initialEntries={["/privacy"]}>
      <PublicPages>
        <div>Private application</div>
      </PublicPages>
    </MemoryRouter>,
  );
  expect(
    screen.getByText(/one first-authorized-service-use record/),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /Unknown historical first-use dates and account creation dates remain unknown/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Matching email addresses alone do not link accounts/),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /deleting that Clerk identity can affect sign-in to other participating apps/,
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Draft status")).toBeTruthy();
  const readingCopy = readFileSync(
    resolve(process.cwd(), "../docs/PRIVACY-POLICY.md"),
    "utf8",
  );
  expect(readingCopy).toContain("It has no effective date yet.");
  expect(readingCopy).toContain("one first-authorized-service-use record");
  expect(readingCopy).not.toContain("rtk proxy");
  expect(readingCopy).not.toContain("scripts/export-privacy-policy");
});

it("replaces the application on client navigation and restores its metadata on return", () => {
  document.title = "Application title";
  const description = document.createElement("meta");
  description.name = "description";
  description.content = "Application description";
  document.head.append(description);
  const view = render(
    <MemoryRouter>
      <Link to="/privacy">Read notice</Link>
      <Link to="/">Return</Link>
      <PublicPages>
        <div>Account application</div>
      </PublicPages>
    </MemoryRouter>,
  );
  expect(screen.getByText("Account application")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Read notice" }));
  expect(screen.queryByText("Account application")).toBeNull();
  expect(document.title).toBe("Privacy policy · Kazi");
  expect(description.content).toContain("privacy rights");
  expect(
    document.querySelector('meta[name="robots"]')?.getAttribute("content"),
  ).toBe("noindex, follow");
  fireEvent.click(screen.getByRole("link", { name: /^Return$/ }));
  expect(screen.getByText("Account application")).toBeTruthy();
  expect(document.title).toBe("Application title");
  expect(description.content).toBe("Application description");
  expect(document.querySelector('meta[name="robots"]')).toBeNull();
  view.unmount();
  description.remove();
});
