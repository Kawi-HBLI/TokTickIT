import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selectRequester } from "./helpers.js";

test.describe("E2E-A11Y-01: Keyboard Navigation, Focus Trapping & Axe A11y Scans", () => {
  test("runs automated axe accessibility scan across core screens with zero violations", async ({ page }) => {
    // 1. Selector view
    await page.goto("/");
    await page.waitForSelector("#requester-selector-title");
    let scanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(scanResults.violations).toEqual([]);

    // 2. Select Requester & verify My Tickets view
    await selectRequester(page, "Amina Rahman");
    await page.waitForSelector("#my-tickets");
    scanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(scanResults.violations).toEqual([]);

    // 3. Create Ticket view
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await page.waitForSelector("#create-ticket-title");
    scanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(scanResults.violations).toEqual([]);

    // 4. Ticket Detail view
    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#summary").fill(`A11y Test Ticket ${Date.now()}`);
    await page.locator("#description").fill("Verifying automated axe accessibility rules on ticket detail view.");
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
    await page.locator("button:has-text('View Ticket')").click();
    await page.waitForSelector("#ticket-detail-title");

    scanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(scanResults.violations).toEqual([]);
  });
  test("traps focus and handles Escape in Discard Confirmation dialog", async ({ page }) => {
    await selectRequester(page, "Amina Rahman");

    // Navigate to Create Ticket
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/new/);

    // Make the form dirty
    await page.locator("#summary").fill("Unsaved Work Test");

    // Click My Tickets navigation link to trigger discard warning
    const myTicketsBtn = page.locator("nav[aria-label='Primary navigation'] button:has-text('My Tickets')");
    await myTicketsBtn.click();

    // Confirm dialog appears
    const dialog = page.locator("section[role='dialog']");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#discard-title")).toHaveText("Discard unsaved Ticket?");

    const keepEditingBtn = page.locator("button:has-text('Keep editing')");
    const discardBtn = page.locator("button:has-text('Discard changes')");

    // Check focus is on Keep editing initially
    await expect(keepEditingBtn).toBeFocused();

    // Tab moves to Discard changes
    await page.keyboard.press("Tab");
    await expect(discardBtn).toBeFocused();

    // Tab from last element wraps back to Keep editing
    await page.keyboard.press("Tab");
    await expect(keepEditingBtn).toBeFocused();

    // Shift+Tab from first element wraps to Discard changes
    await page.keyboard.press("Shift+Tab");
    await expect(discardBtn).toBeFocused();

    // Escape closes dialog and returns to editing
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#summary")).toHaveValue("Unsaved Work Test");
  });

  test("traps focus and restores focus in Attachment Removal dialog", async ({ page }) => {
    await selectRequester(page, "Amina Rahman");

    // Create a ticket with an attachment
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#summary").fill(`Focus Trapping Ticket ${Date.now()}`);
    await page.locator("#description").fill("Testing keyboard accessibility and focus trapping in modals.");
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
    await page.locator("button:has-text('View Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/\d+/);

    // Upload attachment
    const fileInput = page.locator("#detail-file-input");
    await fileInput.setInputFiles({
      name: "keyboard-test.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });

    await expect(page.locator(".attachment-name:has-text('keyboard-test.png')")).toBeVisible({ timeout: 10000 });

    // Click Remove button
    const removeBtn = page.locator(".remove-btn:has-text('Remove')").first();
    await removeBtn.click();

    // Removal dialog should open
    const modal = page.locator("section.removal-dialog[role='dialog']");
    await expect(modal).toBeVisible();

    const reasonInput = page.locator("#removal-reason-input");
    const cancelBtn = modal.locator("button:has-text('Cancel')");
    const confirmBtn = modal.locator(".remove-confirm-btn");

    // Focus is on textarea
    await expect(reasonInput).toBeFocused();

    // Shift+Tab from textarea wraps to confirmBtn (last element)
    await page.keyboard.press("Shift+Tab");
    await expect(confirmBtn).toBeFocused();

    // Tab from confirmBtn wraps back to textarea
    await page.keyboard.press("Tab");
    await expect(reasonInput).toBeFocused();

    // Tab from textarea moves to cancelBtn
    await page.keyboard.press("Tab");
    await expect(cancelBtn).toBeFocused();

    // Tab from cancelBtn moves to confirmBtn
    await page.keyboard.press("Tab");
    await expect(confirmBtn).toBeFocused();

    // Escape closes modal and restores focus to remove button
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(removeBtn).toBeFocused();
  });
});
