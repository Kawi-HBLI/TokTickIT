import { test, expect } from "@playwright/test";
import { selectRequester } from "./helpers.js";

test.describe("E2E-01: Requester Full Ticket & Attachment Flow", () => {
  test("creates ticket, searches in My Tickets, views detail, uploads attachment, downloads, and removes it", async ({
    page,
  }) => {
    // 1. Select Requester
    await selectRequester(page, "Amina Rahman");

    // 2. Navigate to Create Ticket
    const createNavBtn = page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')");
    await createNavBtn.click();
    await expect(page).toHaveURL(/\/tickets\/new/);
    await expect(page.locator("#create-ticket-title")).toBeVisible();

    // 3. Fill Create Ticket form
    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#priority").selectOption("HIGH");

    const uniqueTag = Date.now();
    const summaryText = `E2E Flow Ticket ${uniqueTag}`;
    const descriptionText = `Automated end-to-end test ticket created at ${new Date().toISOString()} for full lifecycle testing.`;

    await page.locator("#summary").fill(summaryText);
    await page.locator("#description").fill(descriptionText);

    // 4. Submit Ticket
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    // Verify Success Screen
    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
    const ticketNumber = await page.locator(".success-details dd").first().textContent();
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);

    // 5. Navigate to My Tickets and Search
    await page.locator(".success-card button:has-text('My Tickets')").click();
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.locator("#my-tickets")).toBeVisible();

    const searchInput = page.locator("input[type='search']");
    await searchInput.fill(summaryText);

    // Wait for search results to show the ticket (visible in desktop table or mobile card)
    const ticketSummaryEl = page.locator(".ticket-summary-text:visible, .card-summary:visible").filter({ hasText: summaryText });
    await expect(ticketSummaryEl.first()).toBeVisible({ timeout: 10000 });

    // 6. Click "View Details"
    const viewDetailsBtn = page.locator(".view-details-btn:visible").first();
    await viewDetailsBtn.click();

    await expect(page).toHaveURL(/\/tickets\/\d+/);
    await expect(page.locator("#ticket-detail-title")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#ticket-detail-title")).toHaveText(ticketNumber!.trim());

    // Verify Read-only details
    await expect(page.locator(".summary-value")).toHaveText(summaryText);
    await expect(page.locator(".description-value")).toHaveText(descriptionText);
    await expect(page.locator(".meta-dl-item:has-text('Requester')")).toContainText("Amina Rahman");
    await expect(page.locator(".priority-badge")).toContainText("HIGH");

    // 7. Upload Attachment
    const fileInput = page.locator("#detail-file-input");
    await fileInput.setInputFiles({
      name: "diagnostic-report.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });

    // Verify success banner and active attachments list
    await expect(page.locator(".alert-success:has-text('Uploaded 1 file(s) successfully')")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".file-count")).toHaveText("1 of 5 active files");
    await expect(page.locator(".attachment-name:has-text('diagnostic-report.png')")).toBeVisible();

    // 8. Test Download & Preview real browser events
    const downloadBtn = page.locator(".download-btn:has-text('Download')").first();
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("diagnostic-report.png");

    const previewBtn = page.locator(".preview-btn:has-text('Preview')").first();
    await expect(previewBtn).toBeVisible();
    await expect(previewBtn).toBeEnabled();

    const popupPromise = page.waitForEvent("popup");
    await previewBtn.click();
    const popup = await popupPromise;
    await popup.waitForURL(/blob:/, { timeout: 10000 });
    expect(popup.url()).toContain("blob:");
    await popup.close();

    // 9. Soft-remove Attachment
    const removeBtn = page.locator(".remove-btn:has-text('Remove')").first();
    await removeBtn.click();

    // Modal opens
    await expect(page.locator("#removal-dialog-title")).toBeVisible();
    const reasonInput = page.locator("#removal-reason-input");
    await expect(reasonInput).toBeFocused();

    // Submit with valid removal reason
    const reasonText = "File uploaded by mistake during automated testing";
    await reasonInput.fill(reasonText);
    await page.locator(".remove-confirm-btn").click();

    // Modal closes, file moved to removed list
    await expect(page.locator("#removal-dialog-title")).toBeHidden({ timeout: 10000 });
    await expect(page.locator(".file-count")).toHaveText("0 of 5 active files");
    await expect(page.locator(".removed-attachments-area")).toBeVisible();
    await expect(page.locator(".removed-item .attachment-name")).toContainText("diagnostic-report.png");
    await expect(page.locator(".removal-reason-text")).toContainText(reasonText);
  });
});
