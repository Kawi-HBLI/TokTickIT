import { test, expect } from "@playwright/test";
import { selectRequester } from "./helpers.js";
import path from "node:path";
import fs from "node:fs";

test.describe("Visual & Responsive Layout Verification (Desktop, Tablet, Mobile)", () => {
  test("renders zero horizontal scroll and captures full checklist screenshots", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const projectName = testInfo.project.name; // desktop | tablet | mobile
    const screenshotRoot = path.resolve(process.cwd(), "artifacts/lab-02/screenshots");
    const screenshotDirs = {
      createTicket: path.join(screenshotRoot, "create-ticket"),
      myTickets: path.join(screenshotRoot, "my-tickets"),
      ticketDetail: path.join(screenshotRoot, "ticket-detail"),
    };
    Object.values(screenshotDirs).forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

    const capture = async (directory: string, state: string, fullPage = true) => {
      await page.screenshot({
        path: path.join(directory, `${state}-${projectName}.png`),
        fullPage,
      });
    };

    const checkNoHorizontalScroll = async () => {
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow).toBeFalsy();
    };

    // --- 1. My Tickets List View ---
    await selectRequester(page, "Amina Rahman");
    await page.goto("/tickets");
    await expect(page.locator("#my-tickets")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.myTickets, "01-my-tickets-list");

    // --- 2. Empty Tickets State ---
    // Switch to Diego Santos who has no tickets seeded
    await selectRequester(page, "Diego Santos");
    await page.goto("/tickets");
    await expect(page.locator(".empty-state h2:has-text('No tickets yet')")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.myTickets, "02-my-tickets-empty");

    // Switch back to Amina Rahman
    await selectRequester(page, "Amina Rahman");
    await page.goto("/tickets");
    await expect(page.locator("#my-tickets")).toBeVisible({ timeout: 10000 });

    // --- 3. No Results Search State ---
    const searchInput = page.locator("input[type='search']");
    await searchInput.fill("NONEXISTENT_FILTER_KEYWORD_XYZ");
    await expect(page.locator(".empty-state.no-results-state h2:has-text('No matching tickets found')")).toBeVisible({
      timeout: 10000,
    });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.myTickets, "03-my-tickets-no-results");
    await page.locator(".empty-state button:has-text('Clear Filters')").click();

    // --- 4. Create Ticket Clean Form ---
    await page.goto("/tickets/new");
    await expect(page.locator("#create-ticket-title")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.createTicket, "01-create-ticket-clean");

    // --- 5. Create Ticket Validation Errors ---
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();
    await expect(page.locator("#category-error")).toBeVisible({ timeout: 5000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.createTicket, "02-create-ticket-validation");

    // --- 6. Discard Dialog Modal ---
    await page.locator("#summary").fill("Draft work that will be discarded");
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('My Tickets')").click();
    await expect(page.locator("#discard-title:has-text('Discard unsaved Ticket?')")).toBeVisible({ timeout: 5000 });
    await capture(screenshotDirs.createTicket, "03-create-ticket-discard-dialog", false);
    // Click Keep editing to close modal
    await page.locator("button:has-text('Keep editing')").click();
    await expect(page.locator("#discard-title")).toBeHidden();

    // --- 7. Ticket Detail View with Active Attachment ---
    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#priority").selectOption("HIGH");
    await page.locator("#summary").fill(`Visual Responsive Ticket ${Date.now()}`);
    await page.locator("#description").fill("Detail verification for responsive layout and attachments rendering.");

    let releaseSubmission!: () => void;
    const submissionGate = new Promise<void>((resolve) => { releaseSubmission = resolve; });
    await page.route("**/api/tickets", async (route) => {
      if (route.request().method() === "POST") await submissionGate;
      await route.continue();
    });
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("button[type='submit']:has-text('Submitting ticket...')")).toBeVisible();
    await capture(screenshotDirs.createTicket, "04-create-ticket-submitting");
    releaseSubmission();

    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
    await page.unroute("**/api/tickets");
    await capture(screenshotDirs.createTicket, "05-create-ticket-success");
    await page.locator("button:has-text('View Ticket')").click();
    await expect(page.locator("#ticket-detail-title")).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator("#detail-file-input");
    await fileInput.setInputFiles({
      name: "layout-sample.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    await expect(page.locator(".attachment-name:has-text('layout-sample.png')")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.ticketDetail, "01-ticket-detail-active-attachment");

    // --- 8. Removal Confirmation Dialog ---
    const removeBtn = page.locator(".remove-btn:has-text('Remove')").first();
    await removeBtn.click();
    await expect(page.locator("#removal-dialog-title")).toBeVisible({ timeout: 5000 });
    await capture(screenshotDirs.ticketDetail, "02-ticket-detail-removal-dialog", false);

    // --- 9. Attachment Removed History ---
    await page.locator("#removal-reason-input").fill("Visual test soft removal reason record");
    await page.locator(".remove-confirm-btn").click();
    await expect(page.locator("#removal-dialog-title")).toBeHidden({ timeout: 10000 });
    await expect(page.locator(".removed-attachments-area")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.ticketDetail, "03-ticket-detail-attachment-removed");

    // --- 10. Five Active Attachments Limit Reached ---
    // Upload 5 active files
    for (let i = 1; i <= 5; i++) {
      await fileInput.setInputFiles({
        name: `active-file-${i}.png`,
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
      });
      await expect(page.locator(`.attachment-name:has-text('active-file-${i}.png')`)).toBeVisible({ timeout: 10000 });
    }
    await expect(page.locator(".file-count")).toHaveText("5 of 5 active files");
    await expect(page.locator(".alert-info.limit-notice")).toBeVisible({ timeout: 5000 });
    await expect(fileInput).toBeHidden();
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.ticketDetail, "04-ticket-detail-five-active-limit");

    // --- 11. Safe 404 View ---
    await page.goto("/tickets/999999");
    await expect(page.locator("#detail-error-heading:has-text('Ticket not found')")).toBeVisible({ timeout: 10000 });
    await checkNoHorizontalScroll();
    await capture(screenshotDirs.ticketDetail, "05-ticket-detail-safe-404");
  });
});
