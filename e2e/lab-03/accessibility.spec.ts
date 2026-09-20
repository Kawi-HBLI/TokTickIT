import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginUser } from "./helpers.js";

test.describe("E2E-A11Y-01: Accessibility and Keyboard Navigation", () => {
  test("automated axe accessibility scan across core Lab 3 views", async ({ page }) => {
    // 1. Login View
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    let scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);

    // 2. Sign in as Admin to scan authenticated views
    await loginUser(page, "harper.morgan@toktickit.local", "ChangeMe-2026!", "Harper-Admin-2026!");

    // 3. User Management View
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);

    // 4. Staff Queue View
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);

    // 5. Staff Ticket Detail View
    await page.goto("/staff/tickets/1");
    await expect(page.getByRole("heading", { name: /Ticket Details/i })).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);

    // 6. Log out
    await page.getByRole("button", { name: "Log out" }).click();
  });

  test("keyboard navigation, focus trapping, and Escape key in dialogs", async ({ page }) => {
    await loginUser(page, "harper.morgan@toktickit.local", "ChangeMe-2026!", "Harper-Admin-2026!");
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    const createBtn = page.getByRole("button", { name: "Create User" });
    await createBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify focus is inside dialog
    const activeElementInside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement);
    });
    expect(activeElementInside).toBe(true);

    // Press Escape to dismiss modal
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Verify focus returned to trigger button
    await expect(createBtn).toBeFocused();
  });
});
