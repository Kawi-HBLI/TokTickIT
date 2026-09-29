import { expect, test } from "@playwright/test";
import { expireTestSessions, loginUser } from "./helpers.js";

const email = "amina.rahman@toktickit.local";
const initialPassword = "ChangeMe-2026!";
const newPassword = "Amina-Updated-2026!";

test.describe("E2E-AUTH-01: authenticated application lifecycle", () => {
  test("shows safe inactive-account and real rate-limit states", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("inactive.requester@toktickit.local");
    await page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("This account is inactive.");
    await expect(page).toHaveURL(/\/login$/);
    const limitedEmail = `rate-limit-e2e-${Date.now()}@toktickit.local`;
    await page.getByLabel("Email").fill(limitedEmail);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = page.waitForResponse(res => res.url().endsWith("/api/auth/login") && res.request().method() === "POST");
      await page.getByLabel("Password", { exact: true }).fill("deliberately-invalid-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      const result = await response;
      expect(result.status()).toBe(attempt < 5 ? 401 : 429);
      if (attempt === 5) expect(Number(result.headers()["retry-after"])).toBeGreaterThan(0);
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    }
    await expect(page.getByRole("alert")).toContainText("Too many sign-in attempts");
    await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
  });

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
    await secondTab.goto("/tickets/1");
    const comment = "A second tab recovered the session and CSRF token after navigation.";
    await secondTab.getByLabel("Add a comment", { exact: true }).fill(comment);
    await secondTab.getByRole("button", { name: "Post public comment", exact: true }).click();
    await expect(secondTab.getByText(comment, { exact: true })).toBeVisible();
    await secondTab.close();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("expired server sessions cannot restore a protected route and logout stays idempotent", async ({ page }) => {
    const expiredUser = "gavin.lee@toktickit.local";
    await loginUser(page, expiredUser, undefined, "Gavin-Staff-2026!");
    await expireTestSessions(expiredUser);
    const rejected = await page.request.get("http://localhost:8000/api/auth/me");
    expect(rejected.status()).toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    const logout = await page.request.post("http://localhost:8000/api/auth/logout");
    expect(logout.status()).toBe(204);
    await page.goto("/staff/tickets");
    await expect(page).toHaveURL(/\/login$/);
  });
});
