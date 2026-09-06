import { test, expect } from "@playwright/test";
import { selectRequester } from "./helpers.js";
import path from "node:path";
import fs from "node:fs";

test.describe("E2E-03: Failure, Empty, Validation & Rejection States", () => {
  test("displays empty requester state and handles requester API failure with retry", async ({ page }) => {
    // 1. Test empty requester list
    await page.route("**/api/requesters", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/");
    await expect(page.locator("p.state-message:has-text('No active Development Requesters are available.')")).toBeVisible();
    await expect(page.locator("#requester-select")).toBeDisabled();
    await expect(page.locator("button:has-text('Continue')")).toBeDisabled();

    // 2. Unroute and test API 500 failure
    await page.unroute("**/api/requesters");

    let shouldFail = true;
    await page.route("**/api/requesters", async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "SERVER_ERROR", message: "Failed to load requesters" } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();
    await expect(page.locator(".state-message.state-message-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Development Requesters could not be loaded. Please try again.")).toBeVisible();

    // Set shouldFail = false and click Retry button
    shouldFail = false;
    const retryBtn = page.locator(".state-message.state-message-error button:has-text('Retry')");
    await retryBtn.click();

    // Should succeed on retry
    await expect(page.locator("#requester-select")).toBeEnabled({ timeout: 10000 });
    await expect(page.locator("#requester-select option")).toHaveCount(5); // Choose a Requester + 4 active requesters
  });

  test("handles reference API failure in Create Ticket with form retention and retry", async ({ page }) => {
    await selectRequester(page, "Amina Rahman");

    let categoryFail = true;
    await page.route("**/api/categories", async (route) => {
      if (categoryFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "SERVER_ERROR", message: "Failed to load categories" } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/new/);

    // Reference error alert is visible
    await expect(page.locator(".form-alert:has-text('Reference data could not be loaded')")).toBeVisible();

    // Enter values into Summary and Description while in error state
    await page.locator("#summary").fill("Summary typed during reference failure");
    await page.locator("#description").fill("Description typed during reference failure retaining data.");

    // Allow categories to succeed now
    categoryFail = false;

    // Click Retry
    await page.locator(".form-alert button:has-text('Retry')").click();

    // Reference alert disappears and options load
    await expect(page.locator(".form-alert:has-text('Reference data could not be loaded')")).toBeHidden();
    await expect(page.locator("#category option")).toHaveCount(5); // Choose a Category + 4 categories

    // Verify typed form values were preserved!
    await expect(page.locator("#summary")).toHaveValue("Summary typed during reference failure");
    await expect(page.locator("#description")).toHaveValue("Description typed during reference failure retaining data.");
  });

  test("handles Create Ticket submission 500 error and recovers via Retry", async ({ page }, testInfo) => {
    await selectRequester(page, "Amina Rahman");
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();

    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#summary").fill("Ticket to test 500 submission retry");
    await page.locator("#description").fill("Detailed description testing server error on ticket creation.");

    // Intercept POST /api/tickets to fail once
    let submitFail = true;
    await page.route("**/api/tickets", async (route) => {
      if (route.request().method() === "POST" && submitFail) {
        submitFail = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "INTERNAL_SERVER_ERROR", message: "Database temporarily unavailable.", retryable: true },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    // Error alert appears with Retry button
    await expect(page.locator(".form-alert")).toBeVisible();
    await expect(page.locator(".form-alert button:has-text('Retry')")).toBeVisible();

    const createTicketScreenshots = path.resolve(process.cwd(), "artifacts/lab-02/screenshots/create-ticket");
    fs.mkdirSync(createTicketScreenshots, { recursive: true });
    await page.screenshot({
      path: path.join(createTicketScreenshots, `06-create-ticket-api-failure-${testInfo.project.name}.png`),
      fullPage: true,
    });

    // Form fields remain intact
    await expect(page.locator("#summary")).toHaveValue("Ticket to test 500 submission retry");

    // Click Retry
    await page.locator(".form-alert button:has-text('Retry')").click();

    // Should succeed on retry
    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
  });

  test("handles My Tickets list 500 error and recovers via Retry", async ({ page }) => {
    await selectRequester(page, "Amina Rahman");

    // Intercept GET /api/tickets to fail
    let listFail = true;
    await page.route("**/api/tickets*", async (route) => {
      if (route.request().method() === "GET" && listFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "TICKET_LIST_FAILED", message: "Failed to retrieve tickets." },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();

    // Error banner appears with Retry button
    await expect(page.locator(".state-message.state-message-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".state-message.state-message-error button:has-text('Retry')")).toBeVisible();

    // Set listFail = false and Click Retry
    listFail = false;
    await page.locator(".state-message.state-message-error button:has-text('Retry')").click();

    // Should succeed and show tickets or empty state
    await expect(page.locator(".state-message.state-message-error")).toBeHidden({ timeout: 10000 });
    await expect(page.locator("#my-tickets")).toBeVisible();
  });

  test("verifies search no-results state, form validation retention, and invalid file rejection", async ({
    page,
  }) => {
    // 1. Select Requester
    await selectRequester(page, "Amina Rahman");

    // 2. Test Search No-Results State
    await expect(page.locator("#my-tickets")).toBeVisible();
    const searchInput = page.locator("input[type='search']");
    await searchInput.fill("NONEXISTENT_SEARCH_STRING_XYZ_99999");

    await expect(page.locator(".empty-state.no-results-state")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".empty-state.no-results-state h2")).toHaveText("No matching tickets found");
    await expect(page.locator(".empty-state button:has-text('Clear Filters')")).toBeVisible();

    // Click Clear Filters
    await page.locator(".empty-state button:has-text('Clear Filters')").click();
    await expect(searchInput).toHaveValue("");

    // 3. Test Create Ticket Validation and Form Retention
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/new/);

    // Click submit immediately without filling required fields
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    // Verify validation errors appear
    await expect(page.locator("#category-error")).toBeVisible();
    await expect(page.locator("#related-system-error")).toBeVisible();
    await expect(page.locator("#summary-error")).toBeVisible();
    await expect(page.locator("#description-error")).toBeVisible();

    // Fill partially with invalid length
    await page.locator("#summary").fill("Bug"); // less than 5 chars
    await page.locator("#description").fill("Too short"); // less than 10 chars
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("#summary-error")).toBeVisible();
    await expect(page.locator("#description-error")).toBeVisible();

    // Ensure typed values are retained
    await expect(page.locator("#summary")).toHaveValue("Bug");
    await expect(page.locator("#description")).toHaveValue("Too short");

    // 4. Test Invalid File Rejection on Create Ticket
    const createFileInput = page.locator("#attachments");
    await createFileInput.setInputFiles({
      name: "script.sh",
      mimeType: "text/x-sh",
      buffer: Buffer.from("#!/bin/bash\necho hello"),
    });

    await expect(page.locator("ul[aria-label='Invalid files']")).toBeVisible();
    await expect(page.locator("#attachment-error")).toContainText("Remove invalid or extra files before submitting.");

    // Remove invalid file
    await page.locator("button:has-text('Remove invalid file')").click();
    await expect(page.locator("ul[aria-label='Invalid files']")).toBeHidden();
    await expect(page.locator("#attachment-error")).toBeHidden();
  });

  test("rejects unsupported file type in Ticket Detail attachment uploader", async ({ page }) => {
    await selectRequester(page, "Amina Rahman");

    // Navigate to an existing ticket or create one
    await page.locator("nav[aria-label='Primary navigation'] button:has-text('Create Ticket')").click();
    await page.locator("#category").selectOption({ index: 1 });
    await page.locator("#related-system").selectOption({ index: 1 });
    await page.locator("#summary").fill(`Attachment Validation Test ${Date.now()}`);
    await page.locator("#description").fill("Testing attachment file validation rejection in ticket detail view.");
    await page.locator("button[type='submit']:has-text('Submit Ticket')").click();

    await expect(page.locator("#ticket-created-title")).toBeVisible({ timeout: 15000 });
    await page.locator("button:has-text('View Ticket')").click();
    await expect(page).toHaveURL(/\/tickets\/\d+/);

    // Attempt to upload an unsupported .exe file in Ticket Detail
    const detailFileInput = page.locator("#detail-file-input");
    await detailFileInput.setInputFiles({
      name: "malware.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ dummy binary"),
    });

    // Verify rejection alert
    await expect(page.locator(".field-error")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".field-error")).toContainText("has an unsupported file type. Use JPG, PNG, WEBP, or PDF.");
  });
});
