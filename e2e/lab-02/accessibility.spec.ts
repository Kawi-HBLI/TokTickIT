import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createTicket, loginRequester } from "./helpers.js";

test.describe("E2E-LAB2-A11Y-01: requester accessibility regression", () => {
  test("has no automated WCAG A/AA violations on sign-in and authenticated requester views", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    let scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations).toEqual([]);

    await loginRequester(page);
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations).toEqual([]);

    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations).toEqual([]);
    await page.getByLabel("Summary").fill("Temporary a11y draft");
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "My Tickets", exact: true }).click();
    const discard = page.getByRole("dialog", { name: "Discard unsaved Ticket?", exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
    await createTicket(page, `A11y detail ${Date.now()}`, "The authenticated requester ticket detail remains subject to the same automated audit.");
    scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations).toEqual([]);
  });

  test("keeps focus in the unsaved-draft dialog and returns it to its trigger", async ({ page }) => {
    await loginRequester(page);
    await page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "Create Ticket", exact: true }).click();
    await page.getByLabel("Summary").fill("Keyboard dialog regression draft");
    const myTickets = page.locator("nav[aria-label='Primary navigation']").getByRole("button", { name: "My Tickets", exact: true });
    await myTickets.click();
    const dialog = page.getByRole("dialog", { name: "Discard unsaved Ticket?", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(myTickets).toBeFocused();
  });

  test("traps focus and restores it for the attachment-removal dialog", async ({ page }) => {
    await loginRequester(page);
    await createTicket(page, `Removal focus ${Date.now()}`, "The attachment removal dialog must retain keyboard focus until dismissed.");
    await page.locator("#detail-file-input").setInputFiles({ name: "focus.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
    const remove = page.getByRole("button", { name: "Remove", exact: true });
    await remove.click();
    const dialog = page.getByRole("dialog", { name: "Remove Attachment", exact: true });
    const reason = page.getByLabel("Removal Reason");
    await expect(reason).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Remove Attachment", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(reason).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(remove).toBeFocused();
  });
});
