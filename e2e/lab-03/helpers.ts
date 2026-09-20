import { expect, type Page } from "@playwright/test";

export async function loginUser(
  page: Page,
  email: string,
  initialPassword = "ChangeMe-2026!",
  newPassword = "Updated-Secret-2026!"
) {
  const waitForLoginOutcome = async () => Promise.race([
    page.waitForURL(/\/(change-password|tickets|staff\/tickets|admin\/users)/, { timeout: 5_000 }).then(() => "authenticated" as const),
    page.getByRole("alert").waitFor({ state: "visible", timeout: 5_000 }).then(() => "rejected" as const),
  ]);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Re-runs can have a password changed by an earlier E2E scenario. Wait for
  // the actual login outcome instead of assuming a response arrives in time.
  if (await waitForLoginOutcome() === "rejected") {
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(change-password|tickets|staff\/tickets|admin\/users)/, { timeout: 5_000 });
  }

  await page.waitForURL(/\/(change-password|tickets|staff\/tickets|admin\/users)/);

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill(initialPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await page.waitForURL(/\/(tickets|staff\/tickets|admin\/users)/);
  }
}

export async function checkNoHorizontalScroll(page: Page) {
  const hasDocOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasDocOverflow).toBeFalsy();

}

export async function checkNoTableOverflow(page: Page, selector: string) {
  const container = page.locator(selector);
  await expect(container).toBeVisible();
  const isOverflowing = await container.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(isOverflowing).toBe(false);
}
