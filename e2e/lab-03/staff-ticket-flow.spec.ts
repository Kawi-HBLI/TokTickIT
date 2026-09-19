import { expect, test } from "@playwright/test";

const staffEmail = "ethan.brooks@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const staffNewPassword = "Ethan-Staff-2026!";

const requesterEmail = "ben.carter@toktickit.local";
const requesterNewPassword = "Ben-Password-2026!";

async function loginAsStaff(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  const outcome = await Promise.race([
    page.waitForURL(/\/(change-password|staff\/tickets)$/, { timeout: 3000 }).then(() => "NAVIGATED" as const),
    page.locator(".form-alert, [role='alert']").waitFor({ timeout: 3000 }).then(() => "FAILED" as const).catch(() => "FAILED" as const),
  ]);

  if (outcome === "FAILED") {
    await page.getByLabel("Password", { exact: true }).fill(staffNewPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/staff\/tickets$/);
    return;
  }

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(staffNewPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(staffNewPassword);
    await page.getByRole("button", { name: "Change password" }).click();
  }

  await expect(page).toHaveURL(/\/staff\/tickets/);
}

async function loginAsRequester(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(requesterEmail);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  const outcome = await Promise.race([
    page.waitForURL(/\/(change-password|tickets)$/, { timeout: 3000 }).then(() => "NAVIGATED" as const),
    page.locator(".form-alert, [role='alert']").waitFor({ timeout: 3000 }).then(() => "FAILED" as const).catch(() => "FAILED" as const),
  ]);

  if (outcome === "FAILED") {
    await page.getByLabel("Password", { exact: true }).fill(requesterNewPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/tickets$/);
    return;
  }

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(requesterNewPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(requesterNewPassword);
    await page.getByRole("button", { name: "Change password" }).click();
  }

  await expect(page).toHaveURL(/\/tickets$/);
}

test.describe("E2E-STAFF-OPS-01: IT Staff Ticket Operations and Authorization", () => {
  test("claims ticket, reassigns owner with dialog, changes IT priority, transitions status with confirmation, posts comments/notes, and guards requester access", async ({ page }) => {
    // 1. Sign in as IT Staff
    await loginAsStaff(page);

    // 2. Open unassigned ticket #4 ("Grade submission error")
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /Ticket Queue/i })).toBeVisible();

    const ticketRow = page.locator("tr", { hasText: "Grade submission error" });
    await expect(ticketRow).toBeVisible();
    await ticketRow.getByRole("button", { name: /View details/i }).click();

    await expect(page).toHaveURL(/\/staff\/tickets\/\d+$/);
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
    await expect(page.getByText("Grade submission error")).toBeVisible();

    // 3. Claim Unassigned Ticket
    const claimBtn = page.getByRole("button", { name: "Claim Ticket" });
    await expect(claimBtn).toBeVisible();
    await claimBtn.click();

    // Verify claim outcome
    await expect(page.getByText("You claimed this ticket.")).toBeVisible();
    await expect(claimBtn).toBeHidden();
    await expect(page.getByText(/Current Owner:\s*Ethan Brooks/i)).toBeVisible();

    // 4. Reassign Ticket Owner with Confirmation Dialog
    const ownerSelect = page.getByLabel("Ticket Owner");
    await ownerSelect.selectOption({ label: "Farah Malik (IT Staff)" });

    // Confirmation dialog should appear
    const reassignDialog = page.getByRole("dialog", { name: "Reassign Ticket Owner?" });
    await expect(reassignDialog).toBeVisible();
    await expect(reassignDialog.getByText(/assign this ticket to Farah Malik/i)).toBeVisible();

    await reassignDialog.getByRole("button", { name: "Confirm Reassignment" }).click();
    await expect(reassignDialog).toBeHidden();
    await expect(page.getByText("Ticket assigned to Farah Malik.")).toBeVisible();
    await expect(page.getByText(/Current Owner:\s*Farah Malik/i)).toBeVisible();

    // 4b. Unassign Ticket Owner with Confirmation Dialog
    await ownerSelect.selectOption({ label: "Unassigned" });
    const unassignDialog = page.getByRole("dialog", { name: "Unassign Ticket Owner?" });
    await expect(unassignDialog).toBeVisible();
    await expect(unassignDialog.getByText(/unassign this ticket/i)).toBeVisible();

    await unassignDialog.getByRole("button", { name: "Confirm Unassignment" }).click();
    await expect(unassignDialog).toBeHidden();
    await expect(page.getByText("Ticket unassigned.")).toBeVisible();
    await expect(page.getByText(/Current Owner:\s*Unassigned/i)).toBeVisible();

    // Claim again for subsequent steps
    const reclaimBtn = page.getByRole("button", { name: "Claim Ticket" });
    await expect(reclaimBtn).toBeVisible();
    await reclaimBtn.click();
    await expect(page.getByText("You claimed this ticket.")).toBeVisible();

    // 5. Update IT Priority
    const prioritySelect = page.getByLabel("IT Priority");
    await prioritySelect.selectOption({ value: "CRITICAL" });
    await page.getByRole("button", { name: "Update Priority" }).click();
    await expect(page.getByText("IT Priority updated to CRITICAL.")).toBeVisible();

    // 6. Transition Status to RESOLVED with Confirmation Dialog
    const statusSelect = page.getByLabel("Status Transition");
    await statusSelect.selectOption({ value: "RESOLVED" });

    const statusDialog = page.getByRole("dialog", { name: /Change Status to Resolved\?/i });
    await expect(statusDialog).toBeVisible();
    await statusDialog.getByRole("button", { name: "Confirm Status Change" }).click();
    await expect(statusDialog).toBeHidden();
    await expect(page.getByText("Ticket status updated to Resolved.")).toBeVisible();

    // 7. Post Public Comment
    const publicCommentField = page.getByLabel("Add a public comment");
    await publicCommentField.fill("Issue verified and resolution verified by IT team.");
    await page.getByRole("button", { name: "Post public comment" }).click();

    await expect(page.getByText("Issue verified and resolution verified by IT team.")).toBeVisible();
    await expect(page.locator(".public-comments-block").getByText("Ethan Brooks")).toBeVisible();

    // 8. Post Internal Note (restricted to staff)
    const internalNoteField = page.getByLabel("Add an internal note");
    await internalNoteField.fill("Internal root cause: database connection pool saturation. Patched configuration.");
    await page.getByRole("button", { name: "Add internal note" }).click();

    await expect(page.getByText("Internal root cause: database connection pool saturation. Patched configuration.")).toBeVisible();
    await expect(page.locator(".internal-badge")).toHaveText("Visible to IT Staff and Administrators only");
    await expect(page.locator(".internal-note-card", { hasText: "Internal root cause" })).toBeVisible();

    // 9. Verify requester authorization boundary via API and navigation
    // Log out as staff
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Sign in as requester Ben Carter
    await loginAsRequester(page);

    // Requester attempting to navigate to staff ticket detail should be bounced back to /tickets
    await page.goto("/staff/tickets/4");
    await expect(page).toHaveURL(/\/tickets$/);

    // Direct API access as requester should be forbidden (403)
    const apiStaffDetail = await page.request.get("http://localhost:8000/api/staff/tickets/4");
    expect(apiStaffDetail.status()).toBe(403);

    const apiInternalNotes = await page.request.get("http://localhost:8000/api/staff/tickets/4/internal-notes");
    expect(apiInternalNotes.status()).toBe(403);
  });
});
