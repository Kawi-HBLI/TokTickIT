import { expect, test } from "@playwright/test";

const email = "amina.rahman@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const newPassword = "Amina-Updated-2026!";

test.describe("E2E-AUTH-01: authenticated application lifecycle", () => {
  test("redirects protected routes, completes first-login password change, and logs out", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Email").fill("unknown@toktickit.local");
    await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("We could not sign you in. Check your email and password.");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
    await expect(page.getByText("My Tickets")).toBeHidden();

    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.locator(".requester-identity strong")).toHaveText("Amina Rahman");

    await page.reload();
    await expect(page.locator(".requester-identity strong")).toHaveText("Amina Rahman");
    const secondTab = await page.context().newPage();
    await secondTab.goto("/tickets");
    await expect(secondTab.locator(".requester-identity strong")).toHaveText("Amina Rahman");
    await secondTab.close();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
  });
});
