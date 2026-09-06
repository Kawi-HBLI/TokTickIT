import { test, expect } from "@playwright/test";
import { selectRequester } from "./helpers.js";

const API_BASE = process.env.API_URL || process.env.VITE_API_URL || "http://localhost:8000";

test.describe("E2E-02: Requester Isolation & Safe 404 Access Protection", () => {
  test("isolates tickets and attachments between requesters, rejecting cross-requester UI and API access with safe 404", async ({
    page,
  }) => {
    // Query requesters from API to get accurate IDs
    const reqListRes = await page.request.get(`${API_BASE}/api/requesters`);
    expect(reqListRes.ok()).toBeTruthy();
    const { data: requesters } = await reqListRes.json();
    const aminaUser = requesters.find((r: any) => r.name === "Amina Rahman");
    const benUser = requesters.find((r: any) => r.name === "Ben Carter");
    expect(aminaUser).toBeDefined();
    expect(benUser).toBeDefined();

    // 1. Select Amina Rahman and create a private ticket
    await selectRequester(page, "Amina Rahman");

    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/new/);

    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#priority").selectOption("MEDIUM");

    const uniqueTag = Date.now();
    const aminaSummary = `Amina Confidential Issue ${uniqueTag}`;
    const aminaDescription = "Confidential details belonging strictly to Amina Rahman in Academic Affairs.";

    await page.locator("#summary").fill(aminaSummary);
    await page.locator("#description").fill(aminaDescription);
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });

    // Click "View Ticket" to get its direct URL and Ticket ID
    await page.locator("button:has-text('View Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/\d+/);
    const aminaTicketUrl = page.url();
    const ticketIdMatch = aminaTicketUrl.match(/\/tickets\/(\d+)/);
    expect(ticketIdMatch).not.toBeNull();
    const aminaTicketId = Number(ticketIdMatch![1]);

    // 2. Upload an attachment under Amina's ticket
    const uploadResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/api/tickets/${aminaTicketId}/attachments`) && res.request().method() === "POST"
    );

    const fileInput = page.locator("#detail-file-input");
    await fileInput.setInputFiles({
      name: "confidential-record.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 dummy confidential content"),
    });

    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);
    const uploadJson = await uploadResponse.json();
    const aminaAttachmentId = uploadJson.data[0].id;
    expect(aminaAttachmentId).toBeGreaterThan(0);

    await expect(page.locator(".attachment-name:has-text('confidential-record.pdf')")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".file-count")).toHaveText("1 of 5 active files");

    // 3. Switch Requester to Ben Carter
    await selectRequester(page, "Ben Carter");
    await expect(page.locator(".requester-identity strong")).toContainText("Ben Carter");

    // 4. Verify on My Tickets that Amina's ticket is NOT in Ben's list
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('My Tickets')").click();
    await expect(page.locator("#my-tickets")).toBeVisible();

    const searchInput = page.locator("input[type='search']");
    await searchInput.fill(aminaSummary);

    // Should display no results
    await expect(page.locator(".empty-state.no-results-state")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=" + aminaSummary)).toBeHidden();

    // 5. Attempt direct UI navigation to Amina's ticket URL as Ben Carter
    await page.goto(aminaTicketUrl);

    // Verify Safe 404 state
    await expect(page.locator("#detail-error-heading")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#detail-error-heading")).toHaveText("Ticket not found");
    await expect(page.locator(".empty-state.not-found-state p")).toContainText(
      "The requested ticket could not be found or is not accessible under your current Requester persona."
    );

    // Ensure none of Amina's confidential ticket details or attachment controls are leaked
    await expect(page.locator("text=" + aminaSummary)).toBeHidden();
    await expect(page.locator("text=" + aminaDescription)).toBeHidden();
    await expect(page.locator("text=confidential-record.pdf")).toBeHidden();
    await expect(page.locator("#detail-file-input")).toBeHidden();

    // 6. Cross-Requester API Security Verification (AC-23, API-ATT-08)
    // Ben Carter attempts direct API access to Amina's attachment
    const benHeaders = { "x-requester-id": String(benUser.id) };

    // a) Preview attachment -> 404 safe error
    const previewRes = await page.request.get(`${API_BASE}/api/attachments/${aminaAttachmentId}/preview`, {
      headers: benHeaders,
    });
    expect(previewRes.status()).toBe(404);
    const previewBody = await previewRes.json();
    expect(previewBody.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // b) Download attachment -> 404 safe error
    const downloadRes = await page.request.get(`${API_BASE}/api/attachments/${aminaAttachmentId}/download`, {
      headers: benHeaders,
    });
    expect(downloadRes.status()).toBe(404);
    const downloadBody = await downloadRes.json();
    expect(downloadBody.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // c) Delete/remove attachment -> 404 safe error
    const deleteRes = await page.request.delete(`${API_BASE}/api/attachments/${aminaAttachmentId}`, {
      headers: benHeaders,
      data: { reason: "Unauthorized attempt by Ben Carter to delete Amina's file" },
    });
    expect(deleteRes.status()).toBe(404);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // d) List attachments for Amina's ticket -> 404 safe error
    const listAttRes = await page.request.get(`${API_BASE}/api/tickets/${aminaTicketId}/attachments`, {
      headers: benHeaders,
    });
    expect(listAttRes.status()).toBe(404);
    const listAttBody = await listAttRes.json();
    expect(listAttBody.error.code).toBe("TICKET_NOT_FOUND");

    // 7. Switch back to Amina Rahman to ensure her ticket and attachment remain intact
    await selectRequester(page, "Amina Rahman");
    await page.goto(aminaTicketUrl);
    await expect(page.locator("#ticket-detail-title")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".summary-value")).toHaveText(aminaSummary);
    await expect(page.locator(".attachment-name:has-text('confidential-record.pdf')")).toBeVisible();
    await expect(page.locator(".file-count")).toHaveText("1 of 5 active files");
  });
});
