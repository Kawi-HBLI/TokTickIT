import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginUser } from "../lab-03/helpers.js";
import { checkNoHorizontalScroll, fillTicketForm, loginRequester } from "./helpers.js";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("E2E-LAB2-VIS-01: authenticated requester responsive regression", () => {
  test("captures requester list, form, detail, dialog, and safe error states at each breakpoint", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const screenshotDir = path.resolve(process.cwd(), "artifacts/lab-03/screenshots/requester-regression");
    fs.mkdirSync(screenshotDir, { recursive: true });
    const capture = (name: string) => page.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
    const adminContext = await browser.newContext();
    const emptyContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await loginUser(adminPage, "harper.morgan@toktickit.local", "ChangeMe-2026!", "Harper-Admin-2026!");
      const session = await adminPage.request.get("http://localhost:8000/api/auth/me");
      expect(session.status()).toBe(200);
      const csrfToken = (await session.json()).data.csrfToken;
      const emptyAccount = {
        email: `empty-requester-${Date.now()}@toktickit.local`,
        name: "Empty Visual Requester",
        password: "Empty-Requester-2026!",
      };
      const created = await adminPage.request.post("http://localhost:8000/api/admin/users", {
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        // Use the seeded initial password so loginRequester performs the same
        // first-login password change as every other requester fixture.
        data: { name: emptyAccount.name, email: emptyAccount.email, role: "REQUESTER", isActive: true, initialPassword: "ChangeMe-2026!" },
      });
      expect(created.status()).toBe(201);
      const emptyPage = await emptyContext.newPage();
      await loginRequester(emptyPage, emptyAccount);
      for (const viewport of viewports) {
        await emptyPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(emptyPage.getByRole("heading", { name: "No tickets yet", exact: true })).toBeVisible();
        await checkNoHorizontalScroll(emptyPage);
        await emptyPage.screenshot({ path: path.join(screenshotDir, `empty-list-${viewport.name}.png`), fullPage: true });
      }
    } finally {
      await emptyContext.close();
      await adminContext.close();
    }
    await loginRequester(page, "amina");

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/tickets");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await checkNoHorizontalScroll(page);
      if (viewport.name === "desktop") await expect(page.locator(".ticket-table-container")).toBeVisible();
      else await expect(page.locator(".ticket-card-list")).toBeVisible();
      await capture(`list-${viewport.name}.png`);

      await page.getByLabel("Search by Ticket Number or Summary").fill("VISUAL_NO_RESULTS_99999");
      await expect(page.getByRole("heading", { name: "No matching tickets found", exact: true })).toBeVisible();
      await checkNoHorizontalScroll(page);
      await capture(`no-results-${viewport.name}.png`);
      await page.getByRole("button", { name: "Clear Filters", exact: true }).last().click();

      await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
      await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
      await expect(page.locator("#category-error")).toBeVisible();
      await checkNoHorizontalScroll(page);
      await capture(`validation-${viewport.name}.png`);
      await page.getByLabel("Summary").fill(`Discard ${viewport.name}`);
      await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "My Tickets", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Discard unsaved Ticket?", exact: true })).toBeVisible();
      await capture(`discard-dialog-${viewport.name}.png`);
      await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    await fillTicketForm(page, `Visual detail ${Date.now()}`, "A responsive requester detail ticket captures submission, attachment, and safe failure states.");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/tickets", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
    await expect(page.getByRole("button", { name: "Submitting ticket...", exact: true })).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByRole("button", { name: "Submitting ticket...", exact: true })).toBeVisible();
      await capture(`submitting-${viewport.name}.png`);
    }
    release();
    await expect(page.getByRole("heading", { name: "Your Ticket has been submitted" })).toBeVisible();
    await page.unroute("**/api/tickets");
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await capture(`success-${viewport.name}.png`);
    }
    await page.getByRole("button", { name: "View Ticket", exact: true }).click();
    const upload = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/tickets\/\d+\/attachments$/.test(new URL(response.url()).pathname));
    await page.locator("#detail-file-input").setInputFiles({ name: "visual-detail.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
    expect((await upload).status()).toBe(201);

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.locator(".attachment-name").filter({ hasText: "visual-detail.png" })).toBeVisible();
      await checkNoHorizontalScroll(page);
      await capture(`detail-${viewport.name}.png`);
    }
    const remove = page.getByRole("button", { name: "Remove", exact: true });
    await remove.click();
    await expect(page.getByRole("dialog", { name: "Remove Attachment", exact: true })).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await capture(`removal-dialog-${viewport.name}.png`);
    }
    await page.getByLabel("Removal Reason").fill("Responsive regression removal audit record.");
    await page.getByRole("button", { name: "Remove Attachment", exact: true }).click();
    await expect(page.locator(".removed-attachments-area")).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await checkNoHorizontalScroll(page);
      await capture(`removed-${viewport.name}.png`);
    }
    for (let index = 1; index <= 5; index += 1) {
      const uploaded = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/tickets\/\d+\/attachments$/.test(new URL(response.url()).pathname));
      await page.locator("#detail-file-input").setInputFiles({ name: `limit-${index}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
      expect((await uploaded).status()).toBe(201);
      await expect(page.getByLabel(`Download limit-${index}.png`, { exact: true })).toBeVisible();
    }
    await expect(page.locator(".file-count")).toContainText("5 of 5 active files");
    await expect(page.locator(".limit-notice")).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await checkNoHorizontalScroll(page);
      await capture(`five-file-limit-${viewport.name}.png`);
    }
    await page.goto("/tickets/999999");
    await expect(page.getByRole("heading", { name: "Ticket not found", exact: true })).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await checkNoHorizontalScroll(page);
      await capture(`safe-404-${viewport.name}.png`);
    }
  });
});
