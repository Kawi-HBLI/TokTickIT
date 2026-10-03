import { expect, type Page } from "@playwright/test";

export const requesters = {
  amina: { email: "amina.rahman@toktickit.local", name: "Amina Rahman", password: "Amina-Requester-2026!" },
  ben: { email: "ben.carter@toktickit.local", name: "Ben Carter", password: "Ben-Requester-2026!" },
  diego: { email: "diego.santos@toktickit.local", name: "Diego Santos", password: "Diego-Requester-2026!" },
} as const;

type RequesterKey = keyof typeof requesters;
type RequesterAccount = { email: string; name: string; password: string };

/** Sign in using the current Lab 3 flow, tolerating a password changed by an earlier regression. */
export async function loginRequester(page: Page, requester: RequesterKey | RequesterAccount = "amina") {
  const account: RequesterAccount = typeof requester === "string" ? requesters[requester] : requester;
  const signIn = async (password: string) => {
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  const waitForOutcome = () => Promise.race([
    page.waitForURL(/\/(change-password|tickets)$/, { timeout: 5_000 }).then(() => "authenticated" as const),
    page.getByRole("alert").waitFor({ state: "visible", timeout: 5_000 }).then(() => "rejected" as const),
  ]);

  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await signIn("ChangeMe-2026!");
  if (await waitForOutcome() === "rejected") {
    await signIn(account.password);
    await page.waitForURL(/\/(change-password|tickets)$/, { timeout: 5_000 });
  }

  if (page.url().includes("/change-password")) {
    await page.getByLabel("Current or initial password", { exact: true }).fill("ChangeMe-2026!");
    await page.getByLabel("New password", { exact: true }).fill(account.password);
    await page.getByLabel("Confirm new password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/tickets$/);
  await expect(page.locator(".requester-identity strong")).toHaveText(account.name);
}

export async function fillTicketForm(page: Page, summary: string, description: string) {
  await page.getByLabel("Category").selectOption({ index: 1 });
  await page.getByLabel("Related System").selectOption({ index: 1 });
  await page.getByLabel("Summary").fill(summary);
  await page.getByLabel("Description").fill(description);
}

export async function createTicket(page: Page, summary: string, description: string) {
  await selectRequesterDestination(page, "Create Ticket");
  await expect(page).toHaveURL(/\/tickets\/new$/);
  await fillTicketForm(page, summary, description);
  await page.getByRole("button", { name: "Submit Ticket", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Ticket has been submitted" })).toBeVisible();
  const ticketNumber = await page.locator(".success-details dd").first().textContent();
  expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{5}$/);
  await page.getByRole("button", { name: "View Ticket", exact: true }).click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  return { ticketNumber: ticketNumber!.trim(), url: page.url() };
}

export async function selectRequesterDestination(page: Page, label: "My Tickets" | "Create Ticket") {
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  if (!await navigation.isVisible()) await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await navigation.getByRole("button", { name: label, exact: true }).click();
}

export async function checkNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}
