import { expect, test } from "@playwright/test";

const requesterEmail = "ben.carter@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const newPassword = "Ben-Password-2026!";

async function loginAsRequester(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(change-password|tickets)$/);

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/tickets$/);
  }

  await expect(page).toHaveURL(/\/tickets$/);
  await expect(page.locator(".requester-identity strong")).toHaveText("Ben Carter");
}

test.describe("E2E-REQ-01: Requester ticket workflow and conversation", () => {
  test("signs in as Requester, views and creates ticket, posts public comment, and indicates problem resolved", async ({ page }) => {
    await loginAsRequester(page);

    // 1. Verify My Tickets view
    await expect(page.getByRole("heading", { name: /My Tickets/i })).toBeVisible();

    // 2. Create a new Ticket
    await page.locator("nav").getByRole("button", { name: "Create Ticket" }).click();
    await expect(page).toHaveURL(/\/tickets\/new$/);

    await page.getByLabel("Summary").fill("Keyboard spacebar sticky in office");
    await page.getByLabel("Category").selectOption({ label: "Hardware" });
    await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
    await page.getByLabel("Description").fill("The spacebar key occasionally does not register when typing.");
    await page.getByRole("button", { name: "Submit Ticket" }).click();

    // Click View Ticket on success screen
    await expect(page.getByRole("heading", { name: "Your Ticket has been submitted" })).toBeVisible();
    await page.getByRole("button", { name: "View Ticket" }).click();

    // Should arrive on Ticket Detail
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    await expect(page.getByText("Keyboard spacebar sticky in office")).toBeVisible();

    // 3. Verify Conversation section
    await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();

    // Verify Internal Notes are NOT rendered
    await expect(page.getByText(/Internal Note/i)).toBeHidden();
    await expect(page.getByLabel(/Internal Note/i)).toBeHidden();

    // 4. Post a Public Comment
    const commentInput = page.getByLabel("Add a comment");
    await commentInput.fill("I have tried blowing compressed air under the keycaps, but the issue remains.");
    await page.getByRole("button", { name: "Post public comment" }).click();

    // Verify the posted comment appears in the list
    await expect(page.getByText("I have tried blowing compressed air under the keycaps, but the issue remains.")).toBeVisible();
    await expect(page.locator(".conversation-section").getByText("Ben Carter")).toBeVisible();

    // 5. Indicate Problem Appears Resolved
    const resolveBtn = page.getByRole("button", { name: "Problem appears resolved" });
    await expect(resolveBtn).toBeVisible();
    await resolveBtn.click();

    // Verify resolution banner appears and formal status remains unchanged
    await expect(page.getByText("Problem indicated as resolved")).toBeVisible();
    await expect(resolveBtn).toBeHidden();

    // 6. Accessing foreign ticket returns safe 404
    // Ticket 1 belongs to Amina Rahman, not Ben Carter
    await page.goto("/tickets/1");
    await expect(page.getByRole("heading", { name: "Ticket not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to My Tickets", exact: true })).toBeVisible();
  });
});
