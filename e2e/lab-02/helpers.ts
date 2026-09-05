import { Page, expect } from "@playwright/test";

export async function selectRequester(page: Page, name: string = "Amina Rahman") {
  await page.goto("/");
  // If we are already on a page with a header showing development requester
  const changeBtn = page.locator("button:has-text('Change Requester')");
  if (await changeBtn.isVisible()) {
    const currentName = await page.locator(".requester-identity strong").textContent();
    if (currentName?.trim() === name) {
      return;
    }
    await changeBtn.click();
  }

  // We should see the requester selector card
  await expect(page.locator("#requester-selector-title")).toBeVisible({ timeout: 10000 });
  const select = page.locator("#requester-select");
  await expect(select).toBeEnabled({ timeout: 10000 });

  // Select option with the specified name
  await select.selectOption({ label: name });

  // Click continue
  const continueBtn = page.locator("button:has-text('Continue')");
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  // Verify header shows requester name
  await expect(page.locator(".requester-identity strong")).toContainText(name, { timeout: 10000 });
}
