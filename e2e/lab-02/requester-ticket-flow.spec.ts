import { expect, test } from "@playwright/test";
import { createTicket, loginRequester } from "./helpers.js";

test.describe("E2E-LAB2-REQ-01: authenticated requester ticket lifecycle", () => {
  test("creates, searches, views, downloads, and removes an owned attachment", async ({ page }) => {
    await loginRequester(page, "amina");
    const unique = Date.now();
    const summary = `Lab 2 requester regression ${unique}`;
    const description = "Authenticated requester lifecycle coverage for ticket creation and attachment handling.";
    const { ticketNumber } = await createTicket(page, summary, description);

    await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
    await expect(page.getByText(summary, { exact: true })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();

    const fileInput = page.locator("#detail-file-input");
    const attachmentUpload = page.waitForResponse((response) =>
      response.url().includes("/attachments") && response.request().method() === "POST"
    );
    await fileInput.setInputFiles({
      name: "requester-regression.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });
    const uploaded = await attachmentUpload;
    expect(uploaded.status()).toBe(201);
    const attachmentId = (await uploaded.json()).data[0].id;
    await expect(page.getByText("Uploaded 1 file(s) successfully.")).toBeVisible();
    await expect(page.getByLabel("Download requester-regression.png")).toBeEnabled();
    const download = page.waitForEvent("download");
    await page.getByLabel("Download requester-regression.png").click();
    expect((await download).suggestedFilename()).toBe("requester-regression.png");
    const preview = page.waitForEvent("popup");
    await page.getByLabel("Preview requester-regression.png").click();
    const previewPage = await preview;
    await previewPage.waitForURL(/blob:/);
    await previewPage.close();

    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "My Tickets", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    const priorityFilterResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && url.pathname === "/api/tickets" && url.searchParams.get("requestedPriority") === "MEDIUM";
    });
    await page.getByLabel("Requested Priority").selectOption("MEDIUM");
    expect((await priorityFilterResponse).status()).toBe(200);
    const visibleTicketRow = page.locator(".ticket-table-container .ticket-row").filter({ hasText: summary });
    await expect(visibleTicketRow).toBeVisible();
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && url.pathname === "/api/tickets" && url.searchParams.get("search") === summary;
    });
    await page.getByLabel("Search by Ticket Number or Summary").fill(summary);
    expect((await searchResponse).status()).toBe(200);
    await expect(visibleTicketRow).toBeVisible();
    await visibleTicketRow.getByRole("button", { name: "View Details", exact: true }).click();

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Remove Attachment" })).toBeVisible();
    await page.getByLabel("Removal Reason").fill("Automated regression cleanup of a temporary attachment.");
    await page.getByRole("button", { name: "Remove Attachment", exact: true }).click();
    const removed = page.locator(".removed-attachments-area");
    await expect(removed).toContainText("requester-regression.png");
    await expect(removed.getByText("Removed", { exact: true })).toBeVisible();
    const removedPreview = await page.request.get(`http://localhost:8000/api/attachments/${attachmentId}/preview`);
    expect(removedPreview.status()).toBe(410);
    expect((await removedPreview.json()).error.code).toBe("ATTACHMENT_REMOVED");
  });
});
