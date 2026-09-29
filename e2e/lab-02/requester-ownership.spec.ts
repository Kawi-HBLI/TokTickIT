import { expect, test } from "@playwright/test";
import { createTicket, loginRequester } from "./helpers.js";

test.describe("E2E-LAB2-REQ-02: authenticated requester isolation", () => {
  test("does not expose one requester's ticket through another requester's session", async ({ browser }) => {
    const aminaContext = await browser.newContext();
    const aminaPage = await aminaContext.newPage();
    await loginRequester(aminaPage, "amina");
    const summary = `Amina private regression ${Date.now()}`;
    const { url } = await createTicket(aminaPage, summary, "A private ticket that must stay visible only to its owner.");
    const ticketId = url.match(/\/tickets\/(\d+)$/)?.[1];
    expect(ticketId).toBeTruthy();
    const upload = aminaPage.waitForResponse((response) =>
      response.url().includes(`/api/tickets/${ticketId}/attachments`) && response.request().method() === "POST"
    );
    await aminaPage.locator("#detail-file-input").setInputFiles({
      name: "confidential-regression.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 requester-isolation"),
    });
    const uploaded = await upload;
    expect(uploaded.status()).toBe(201);
    const attachmentId = (await uploaded.json()).data[0].id;
    await aminaPage.reload();
    await expect(aminaPage.getByRole("heading", { name: /TKT-/ })).toBeVisible();
    await expect(aminaPage.locator(".attachment-name").filter({ hasText: "confidential-regression.pdf" })).toBeVisible();

    const benContext = await browser.newContext();
    const benPage = await benContext.newPage();
    await loginRequester(benPage, "ben");
    await benPage.getByLabel("Search by Ticket Number or Summary").fill(summary);
    await expect(benPage.getByRole("heading", { name: "No matching tickets found" })).toBeVisible();
    await expect(benPage.getByText(summary, { exact: true })).toBeHidden();

    await benPage.goto(url);
    await expect(benPage.getByRole("heading", { name: "Ticket not found" })).toBeVisible();
    await expect(benPage.getByText(summary, { exact: true })).toBeHidden();
    await expect(benPage.locator("#detail-file-input")).toBeHidden();
    await benPage.goto("/tickets/999999");
    await expect(benPage.getByRole("heading", { name: "Ticket not found" })).toBeVisible();

    const ticketResponse = await benPage.request.get(`http://localhost:8000/api/tickets/${ticketId}`);
    expect(ticketResponse.status()).toBe(404);
    expect((await ticketResponse.json()).error.code).toBe("TICKET_NOT_FOUND");
    for (const action of ["preview", "download"] as const) {
      const response = await benPage.request.get(`http://localhost:8000/api/attachments/${attachmentId}/${action}`);
      expect(response.status()).toBe(404);
      expect((await response.json()).error.code).toBe("ATTACHMENT_NOT_FOUND");
    }
    const list = await benPage.request.get(`http://localhost:8000/api/tickets/${ticketId}/attachments`);
    expect(list.status()).toBe(404);
    expect((await list.json()).error.code).toBe("TICKET_NOT_FOUND");
    const me = await benPage.request.get("http://localhost:8000/api/auth/me");
    const csrfToken = (await me.json()).data.csrfToken;
    const removal = await benPage.request.delete(`http://localhost:8000/api/attachments/${attachmentId}`, {
      headers: { "X-CSRF-Token": csrfToken },
      data: { reason: "Cross-requester removal must be rejected." },
    });
    expect(removal.status()).toBe(404);
    expect((await removal.json()).error.code).toBe("ATTACHMENT_NOT_FOUND");
    const missing = await benPage.request.get("http://localhost:8000/api/attachments/999999/preview");
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe("ATTACHMENT_NOT_FOUND");

    await aminaPage.goto(url);
    await expect(aminaPage.getByText(summary, { exact: true })).toBeVisible();
    await expect(aminaPage.locator(".attachment-name").filter({ hasText: "confidential-regression.pdf" })).toBeVisible();

    await benContext.close();
    await aminaContext.close();
  });
});
