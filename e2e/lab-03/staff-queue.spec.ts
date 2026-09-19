import { expect, test } from "@playwright/test";

const staffEmail = "ethan.brooks@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const newPassword = "Ethan-Staff-2026!";

async function loginAsStaff(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(change-password|staff\/tickets)$/);

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
  }

  await expect(page).toHaveURL(/\/staff\/tickets/);
}

test.describe("E2E-STAFF-01: IT Staff Ticket Queue Workflow", () => {
  test("signs in as IT Staff, views queue, filters tickets, toggles responsive views, and opens detail", async ({ page }) => {
    await loginAsStaff(page);

    // 1. Verify Queue Heading and Shell Identity
    await expect(page.getByRole("heading", { name: /Ticket Queue/i })).toBeVisible();
    await expect(page.locator(".requester-identity strong")).toHaveText("Ethan Brooks");

    // 2. Desktop View (1440x900 default): Table is visible, mobile cards hidden
    const queueTable = page.locator(".staff-queue-table");
    await expect(queueTable).toBeVisible();
    await expect(page.locator(".staff-queue-cards")).toBeHidden();

    // Verify table column headers
    await expect(queueTable.getByRole("columnheader", { name: "Ticket Number" })).toBeVisible();
    await expect(queueTable.getByRole("columnheader", { name: "Summary" })).toBeVisible();
    await expect(queueTable.getByRole("columnheader", { name: "Req. Priority" })).toBeVisible();
    await expect(queueTable.getByRole("columnheader", { name: "IT Priority" })).toBeVisible();
    await expect(queueTable.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(queueTable.getByRole("columnheader", { name: "Owner" })).toBeVisible();

    // 3. Search and Filter Interaction
    const searchInput = page.getByLabel("Search tickets");
    await searchInput.fill("Cannot access");
    await page.waitForTimeout(500);

    // Verify live region announcement exists
    await expect(page.locator('[aria-live="polite"]')).toBeVisible();

    // Clear filters action
    const clearBtn = page.getByRole("button", { name: /Clear filters/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue("");
    }

    // 4. Responsive Card View for smaller screens (< 992px)
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".staff-queue-table-container")).toBeHidden();
    const cardsContainer = page.locator(".staff-queue-cards");
    await expect(cardsContainer).toBeVisible();

    // Full-width View Details button exists on cards
    const cardViewButton = cardsContainer.getByRole("button", { name: /View details/i }).first();
    await expect(cardViewButton).toBeVisible();

    // 5. Open Ticket Detail Action
    await cardViewButton.click();
    await expect(page).toHaveURL(/\/staff\/tickets\/\d+/);
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

    // Back to Ticket Queue action
    const backBtn = page.getByRole("button", { name: "Back to Ticket Queue" });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL(/\/staff\/tickets$/);
  });
});
