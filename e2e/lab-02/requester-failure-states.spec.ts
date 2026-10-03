import { expect, test } from "@playwright/test";
import { createTicket, fillTicketForm, loginRequester } from "./helpers.js";

test.describe("E2E-LAB2-REQ-03: authenticated requester failure states", () => {
  test("retains a draft when reference data fails and retry restores the form", async ({ page }) => {
    await loginRequester(page);
    let failCategories = true;
    await page.route("**/api/categories", async (route) => {
      if (failCategories) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Unavailable" } }) });
      else await route.continue();
    });
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Reference data could not be loaded");
    await page.getByLabel("Summary").fill("Draft retained while references are unavailable");
    await page.getByLabel("Description").fill("This description proves that the requester draft survives a retry.");
    failCategories = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("alert")).toBeHidden();
    await expect(page.getByLabel("Category")).toBeEnabled();
    await expect(page.getByLabel("Summary")).toHaveValue("Draft retained while references are unavailable");
    await expect(page.getByLabel("Description")).toHaveValue("This description proves that the requester draft survives a retry.");
  });

  test("shows a retryable submit failure without duplicating the authenticated requester draft", async ({ page }) => {
    await loginRequester(page);
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    const summary = `Retryable requester submission ${Date.now()}`;
    await fillTicketForm(page, summary, "This authenticated submission should remain safely retryable after a temporary failure.");
    let rejectOnce = true;
    await page.route("**/api/tickets", async (route) => {
      if (route.request().method() === "POST" && rejectOnce) {
        rejectOnce = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "TEMPORARY", message: "Temporary outage", retryable: true } }) });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Temporary outage");
    await expect(page.getByLabel("Summary")).toHaveValue(summary);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your Ticket has been submitted" })).toBeVisible();
  });

  test("retries a failed authenticated ticket list and clears a no-results search", async ({ page }) => {
    await loginRequester(page);
    let failList = true;
    await page.route("**/api/tickets*", async (route) => {
      if (route.request().method() === "GET" && failList) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "TICKET_LIST_FAILED", message: "Temporary list failure" } }) });
      else await route.continue();
    });
    await page.reload();
    const failure = page.locator(".state-message.state-message-error");
    await expect(failure).toBeVisible();
    failList = false;
    await failure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(failure).toBeHidden();
    const search = page.getByLabel("Search by Ticket Number or Summary");
    await search.fill("NO_MATCHING_REQUESTER_TICKET_99999");
    const noResults = page.locator(".empty-state.no-results-state");
    await expect(noResults.getByRole("heading", { name: "No matching tickets found", exact: true })).toBeVisible();
    await noResults.getByRole("button", { name: "Clear Filters", exact: true }).click();
    await expect(search).toHaveValue("");
  });

  test("retains validation input and rejects invalid files in create and detail uploaders", async ({ page }) => {
    await loginRequester(page);
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
    for (const id of ["#category-error", "#related-system-error", "#summary-error", "#description-error"]) await expect(page.locator(id)).toBeVisible();
    await page.getByLabel("Summary").fill("Bug");
    await page.getByLabel("Description").fill("Too short");
    await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
    await expect(page.getByLabel("Summary")).toHaveValue("Bug");
    await expect(page.getByLabel("Description")).toHaveValue("Too short");
    await page.locator("#attachments").setInputFiles({ name: "script.sh", mimeType: "text/x-sh", buffer: Buffer.from("echo no") });
    await expect(page.locator("ul[aria-label='Invalid files']")).toBeVisible();
    await page.getByRole("button", { name: "Remove invalid file", exact: true }).click();
    await expect(page.locator("ul[aria-label='Invalid files']")).toBeHidden();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    const { url } = await createTicket(page, `Detail invalid upload ${Date.now()}`, "Detail uploader must reject unsupported file types without submitting them.");
    await expect(page).toHaveURL(url);
    await page.locator("#detail-file-input").setInputFiles({ name: "malware.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await expect(page.locator(".field-error")).toContainText("unsupported file type");
  });
});
