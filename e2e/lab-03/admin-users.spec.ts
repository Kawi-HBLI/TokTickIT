import { expect, test } from "@playwright/test";

const adminEmail = "harper.morgan@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const newPassword = "Harper-Admin-2026!";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  // If initial password was already changed in a previous run, retry with newPassword
  const hasAlert = await page.getByRole("alert").isVisible().catch(() => false);
  if (hasAlert) {
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  await page.waitForURL(/\/(change-password|admin\/users|staff\/tickets)$/);

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
  }

  await expect(page).toHaveURL(/\/(admin\/users|staff\/tickets)/);
  if (!page.url().includes("/admin/users")) {
    await page.goto("/admin/users");
  }
  await expect(page).toHaveURL(/\/admin\/users$/);
}

test.describe("E2E-ADMIN-01: Administrator User Management Workflow", () => {
  test("full user management lifecycle: list, search, create, self-protection, edit, reset password, responsive view", async ({
    page,
  }) => {
    // 1. Sign in as Administrator and navigate to User Management
    await loginAsAdmin(page);

    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await expect(page.locator(".requester-identity strong")).toHaveText("Harper Morgan");

    // 2. Desktop Table View
    const tableContainer = page.locator(".admin-users-table-container");
    await expect(tableContainer).toBeVisible();
    await expect(page.locator(".admin-users-cards")).toBeHidden();

    // Verify table columns
    const table = page.locator(".admin-users-table");
    await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Email" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Department" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Status" })).toBeVisible();

    // Verify Harper Morgan shows "You" badge
    await expect(table.getByText("Harper Morgan")).toBeVisible();
    await expect(table.locator(".badge-current-user")).toHaveText("You");

    // 3. Search and Role Filtering
    const searchInput = page.getByLabel("Search users");
    await searchInput.fill("harper");
    await page.waitForTimeout(400);

    await expect(page.locator('[aria-live="polite"]')).toBeVisible();
    await expect(table.getByText("Harper Morgan")).toBeVisible();

    // Clear filters
    const clearBtn = page.getByRole("button", { name: /Clear filters/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(searchInput).toHaveValue("");
    }

    // Role filter
    const roleSelect = page.getByLabel("Role", { exact: true });
    await roleSelect.selectOption("IT_STAFF");
    await page.waitForTimeout(400);
    await roleSelect.selectOption("ALL");
    await page.waitForTimeout(400);

    // 4. Create User Workflow
    const createBtn = page.getByRole("button", { name: "Create User" });
    await createBtn.click();

    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByRole("heading", { name: "Create User" })).toBeVisible();

    // Validation: submit empty form
    const createSubmitBtn = createDialog.getByRole("button", { name: "Create User" });
    await createSubmitBtn.click();
    await expect(createDialog.getByText("Full name is required.")).toBeVisible();
    await expect(createDialog.getByText("Email address is required.")).toBeVisible();

    // Fill valid user data
    const timestamp = Date.now();
    const newUserName = `E2E Operator ${timestamp}`;
    const newUserEmail = `e2e.operator.${timestamp}@toktickit.local`;

    await createDialog.getByLabel(/Full Name/i).fill(newUserName);
    await createDialog.getByLabel(/Email Address/i).fill(newUserEmail);
    await createDialog.getByLabel("Department").fill("E2E Department");
    await createDialog.getByLabel(/Role/i).selectOption("REQUESTER");

    await createSubmitBtn.click();

    // Expect success feedback alert
    await expect(page.locator(".alert-success")).toContainText(`User "${newUserName}" was created successfully.`);
    await expect(createDialog).toBeHidden();

    // Verify new user in the list
    await expect(table.getByText(newUserName)).toBeVisible();
    await expect(table.getByText(newUserEmail)).toBeVisible();

    // 5. Self-Protection Guards (Editing Self)
    const editSelfBtn = table.getByRole("button", { name: `Edit Harper Morgan` });
    await editSelfBtn.click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();

    // Verify self-protection restrictions
    const selfRoleSelect = editDialog.getByLabel(/Role/i);
    const selfActiveCheckbox = editDialog.getByLabel(/Active Account/i);
    await expect(selfRoleSelect).toBeDisabled();
    await expect(selfActiveCheckbox).toBeDisabled();
    await expect(editDialog.getByText("You cannot change your own administrator role.")).toBeVisible();
    await expect(editDialog.getByText("You cannot deactivate your own account.")).toBeVisible();

    // Cancel self-edit
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();

    // 6. Edit Other User Workflow
    const editOtherBtn = table.getByRole("button", { name: `Edit ${newUserName}` });
    await editOtherBtn.click();
    await expect(editDialog).toBeVisible();

    // Role and active checkbox should NOT be disabled for other users
    const otherRoleSelect = editDialog.getByLabel(/Role/i);
    const otherActiveCheckbox = editDialog.getByLabel(/Active Account/i);
    await expect(otherRoleSelect).not.toBeDisabled();
    await expect(otherActiveCheckbox).not.toBeDisabled();

    // Update department and promote to IT Staff
    await editDialog.getByLabel("Department").fill("Advanced IT");
    await otherRoleSelect.selectOption("IT_STAFF");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.locator(".alert-success")).toContainText(`User "${newUserName}" was updated successfully.`);
    await expect(editDialog).toBeHidden();

    // Verify updated values in table
    await expect(table.getByText("Advanced IT")).toBeVisible();

    // 7. Reset Password Workflow
    const resetPasswordBtn = table.getByRole("button", { name: `Reset password for ${newUserName}` });
    await resetPasswordBtn.click();

    const resetDialog = page.getByRole("dialog");
    await expect(resetDialog).toBeVisible();
    await expect(resetDialog.getByRole("heading", { name: "Reset User Password?" })).toBeVisible();
    await expect(resetDialog.getByText(/The password will be reset to ChangeMe-2026!/i)).toBeVisible();

    await resetDialog.getByRole("button", { name: "Confirm Reset Password" }).click();

    await expect(page.locator(".alert-success")).toContainText(
      `Password for "${newUserName}" has been reset to ChangeMe-2026!. User must change password upon next login.`
    );
    await expect(resetDialog).toBeHidden();

    // 8. Responsive View (< 992px)
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".admin-users-table-container")).toBeHidden();
    const cardsContainer = page.locator(".admin-users-cards");
    await expect(cardsContainer).toBeVisible();

    // Verify user card exists with action buttons
    const userCard = cardsContainer.locator(".admin-user-card").filter({ hasText: newUserName });
    await expect(userCard).toBeVisible();
    await expect(userCard.getByRole("button", { name: `Edit ${newUserName}` })).toBeVisible();
    await expect(userCard.getByRole("button", { name: `Reset password for ${newUserName}` })).toBeVisible();
  });
});
