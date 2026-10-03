import { expect, test } from "@playwright/test";
import { loginUser } from "./helpers.js";

const adminEmail = "harper.morgan@toktickit.local";
const initialAdminPassword = "ChangeMe-2026!";
const permanentAdminPassword = "Harper-Admin-2026!";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await loginUser(page, adminEmail, initialAdminPassword, permanentAdminPassword);

  await expect(page).toHaveURL(/\/(admin\/users|staff\/tickets)/);
  if (!page.url().includes("/admin/users")) {
    await page.goto("/admin/users");
  }
  await expect(page).toHaveURL(/\/admin\/users$/);
}

async function loginAsRequester(page: import("@playwright/test").Page) {
  const email = "chalida.srisuk@toktickit.local";
  const initialPassword = "ChangeMe-2026!";
  const newPassword = "Chalida-Pass-2026!";

  await loginUser(page, email, initialPassword, newPassword);
  await expect(page).toHaveURL(/\/tickets$/);
}

test.describe("E2E-ADMIN-01: Administrator User Management Workflow", () => {
  test("requester direct URL and API to admin users is denied", async ({ page }) => {
    // 1. Sign in as requester
    await loginAsRequester(page);

    // 2. Direct API call to admin users must return 403 Forbidden
    const status = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/admin/users", { credentials: "include" });
      return res.status;
    });
    expect(status).toBe(403);

    // 3. Direct URL navigation to /admin/users must not expose admin management
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeHidden();
    await expect(page.locator(".admin-users-table")).toBeHidden();

    // 4. Log out requester
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("full user management lifecycle: create, last-admin protection, reset, first login, deactivation and revocation", async ({
    page, browser,
  }) => {
    // 1. Sign in as Administrator and navigate to User Management
    await loginAsAdmin(page);

    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await expect(page.locator(".requester-identity strong")).toHaveText("Harper Morgan");

    // 2. Desktop Table View
    const tableContainer = page.locator(".admin-users-table-container");
    await expect(tableContainer).toBeVisible();
    await expect(page.locator(".admin-users-cards")).toBeHidden();

    // Verify table columns (no Department column)
    const table = page.locator(".admin-users-table");
    await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Email" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Status" })).toBeVisible();

    // Verify Harper Morgan shows "You" badge
    await expect(table.getByText("Harper Morgan")).toBeVisible();
    await expect(table.locator(".badge-current-user")).toHaveText("You");

    // 3. Search and Role Filtering
    const searchInput = page.getByLabel("Search users");
    const searched = page.waitForResponse(response =>
      response.url().includes("/api/admin/users?") && new URL(response.url()).searchParams.get("q") === "harper"
    );
    await searchInput.fill("harper");
    await searched;

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
    const staffFiltered = page.waitForResponse(response =>
      response.url().includes("/api/admin/users?") && new URL(response.url()).searchParams.get("role") === "IT_STAFF"
    );
    await roleSelect.selectOption("IT_STAFF");
    await staffFiltered;
    await expect(table.getByText("Harper Morgan")).toHaveCount(0);
    const allRoles = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/admin/users" && !new URL(response.url()).searchParams.has("role")
    );
    await roleSelect.selectOption("ALL");
    await allRoles;
    await expect(table.getByText("Harper Morgan")).toBeVisible();

    // 4. Create User Workflow with Admin-Provided Initial Password
    const createBtn = page.getByRole("button", { name: "Create User" });
    await createBtn.click();

    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByRole("heading", { name: "Create User" })).toBeVisible();

    // Validation: submit empty form
    const createSubmitBtn = createDialog.getByRole("button", { name: "Create User" });
    await createSubmitBtn.click();
    await expect(createDialog.getByText("Full name must be between 2 and 100 characters.")).toBeVisible();
    await expect(createDialog.getByText("Email address is required.")).toBeVisible();

    // Fill valid user data
    const timestamp = Date.now();
    const newUserName = `E2E Operator ${timestamp}`;
    const newUserEmail = `e2e.op.${timestamp}@toktickit.local`;
    const userInitialPassword = "InitUserPass-2026!";

    await createDialog.getByLabel(/Full Name/i).fill(newUserName);
    await createDialog.getByLabel(/Email Address/i).fill(newUserEmail);
    await createDialog.getByLabel(/Initial Password/i).fill(userInitialPassword);
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

    // Verify self-deactivation is disabled
    const selfActiveCheckbox = editDialog.getByLabel(/Active Account/i);
    await expect(selfActiveCheckbox).toBeDisabled();
    await expect(editDialog.getByText("You cannot deactivate your own account.")).toBeVisible();

    // A real last-administrator downgrade must be rejected, not only hidden.
    await editDialog.getByLabel(/Role/i).selectOption("REQUESTER");
    const lastAdminRejected = page.waitForResponse(response =>
      /\/api\/admin\/users\/\d+$/.test(response.url()) && response.request().method() === "PATCH"
    );
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    const lastAdminResponse = await lastAdminRejected;
    expect(lastAdminResponse.status()).toBe(409);
    expect((await lastAdminResponse.json()).error.code).toBe("LAST_ACTIVE_ADMIN_REQUIRED");
    await expect(editDialog.getByRole("alert")).toContainText("last active Administrator");
    const retainedAdmin = await page.request.get("http://localhost:8000/api/auth/me");
    expect(retainedAdmin.status()).toBe(200);
    expect((await retainedAdmin.json()).data.user.role).toBe("ADMINISTRATOR");

    // Cancel self-edit
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();

    // 6. Edit Other User Workflow
    const editOtherBtn = table.getByRole("button", { name: `Edit ${newUserName}` });
    await editOtherBtn.click();
    await expect(editDialog).toBeVisible();

    // Promote to IT Staff
    const otherRoleSelect = editDialog.getByLabel(/Role/i);
    await otherRoleSelect.selectOption("IT_STAFF");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.locator(".alert-success")).toContainText(`User "${newUserName}" was updated successfully.`);
    await expect(editDialog).toBeHidden();

    // 7. Reset Password Workflow
    const resetPasswordBtn = table.getByRole("button", { name: `Reset password for ${newUserName}` });
    await resetPasswordBtn.click();

    const resetDialog = page.getByRole("dialog");
    await expect(resetDialog).toBeVisible();
    await expect(resetDialog.getByRole("heading", { name: "Set Initial Password" })).toBeVisible();

    const newResetPassword = "ResetSecretPass-2026!";
    await resetDialog.getByLabel(/New Initial Password/i).fill(newResetPassword);
    await resetDialog.getByRole("button", { name: "Set Initial Password" }).click();

    await expect(page.locator(".alert-success")).toContainText(
      `Initial password for "${newUserName}" has been set. The user must change password upon next login.`
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

    // Restore viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    // 9. Log out Admin and verify New User can login and is forced to change password
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(newUserEmail);
    await page.getByLabel("Password", { exact: true }).fill(newResetPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Must be redirected to change password
    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel("Current or initial password", { exact: true }).fill(newResetPassword);
    const permanentNewPass = "PermanentSecret-2026!";
    await page.getByLabel("New password", { exact: true }).fill(permanentNewPass);
    await page.getByLabel("Confirm new password", { exact: true }).fill(permanentNewPass);
    await page.getByRole("button", { name: "Change password" }).click();

    // Since role was changed to IT_STAFF, should land on /staff/tickets
    await expect(page).toHaveURL(/\/staff\/tickets$/);

    // Deactivate this newly created account while its authenticated session exists.
    // The real administrator form and API must revoke that session immediately.
    const adminContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await loginAsAdmin(adminPage);
      await adminPage.getByRole("button", { name: `Edit ${newUserName}`, exact: true }).filter({ visible: true }).click();
      const deactivateDialog = adminPage.getByRole("dialog");
      await deactivateDialog.getByLabel(/Active Account/i).uncheck();
      await deactivateDialog.getByRole("button", { name: "Save Changes" }).click();
      await expect(deactivateDialog).toBeHidden();
      await expect(adminPage.locator(".alert-success")).toContainText("updated successfully");
      const revoked = await page.request.get("http://localhost:8000/api/auth/me");
      expect(revoked.status()).toBe(401);
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await adminContext.close();
    }
  });
});
