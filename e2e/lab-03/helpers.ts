import { expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { E2E_DATABASE_URL } from "../test-environment.js";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));

export async function expireTestSessions(email: string) {
  if (!email.endsWith("@toktickit.local")) throw new Error("Only local E2E fixtures may be expired.");
  const { PrismaClient } = serverRequire("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: {
    url: E2E_DATABASE_URL,
  } } });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    const result = await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    expect(result.count).toBeGreaterThan(0);
  } finally {
    await prisma.$disconnect();
  }
}

// Test-only fixture mutation: never connect this helper to the public schema.
export async function forcePasswordChange(email: string) {
  const { PrismaClient } = serverRequire("@prisma/client");
  const url = new URL(E2E_DATABASE_URL);
  if (url.searchParams.get("schema") !== "e2e_test" || !email.endsWith("@toktickit.local")) {
    throw new Error("Password-change fixtures require the isolated E2E schema and a local test user.");
  }
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let original: { id: number; mustChangePassword: boolean };
  try {
    original = await prisma.user.findUniqueOrThrow({
      where: { email }, select: { id: true, mustChangePassword: true },
    });
    await prisma.user.update({ where: { id: original.id }, data: { mustChangePassword: true } });
  } finally {
    await prisma.$disconnect();
  }
  return async () => {
    const restore = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      await restore.user.update({
        where: { id: original.id }, data: { mustChangePassword: original.mustChangePassword },
      });
    } finally {
      await restore.$disconnect();
    }
  };
}

export async function loginUser(
  page: Page,
  email: string,
  initialPassword = "ChangeMe-2026!",
  newPassword = "Updated-Secret-2026!"
) {
  let acceptedPassword = initialPassword;
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
    acceptedPassword = newPassword;
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(change-password|tickets|staff\/tickets|admin\/users)/, { timeout: 5_000 });
  }

  await page.waitForURL(/\/(change-password|tickets|staff\/tickets|admin\/users)/);

  if (page.url().includes("/change-password")) {
    const replacementPassword = acceptedPassword === newPassword ? initialPassword : newPassword;
    await page.getByLabel("Current or initial password", { exact: true }).fill(acceptedPassword);
    await page.getByLabel("New password", { exact: true }).fill(replacementPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(replacementPassword);
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

export async function loginVisualAdmin(page: Page) {
  await loginUser(page, "harper.morgan@toktickit.local", undefined, "Harper-Admin-2026!");
}

export async function loginVisualRequester(page: Page) {
  await loginUser(page, "diego.santos@toktickit.local", undefined, "Diego-SecPass-2026!");
}

export async function openForcedPasswordChange(page: Page) {
  const email = "amina.rahman@toktickit.local";
  const restore = await forcePasswordChange(email);
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("ChangeMe-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    const outcome = await Promise.race([
      page.waitForURL(/\/change-password$/).then(() => "authenticated"),
      page.getByRole("alert").waitFor({ state: "visible" }).then(() => "rejected"),
    ]);
    if (outcome === "rejected") {
      await page.getByLabel("Password", { exact: true }).fill("Amina-Updated-2026!");
      await page.getByRole("button", { name: "Sign in" }).click();
    }
    await expect(page).toHaveURL(/\/change-password$/);
    return restore;
  } catch (error) {
    await restore();
    throw error;
  }
}

export async function checkNoTableOverflow(page: Page, selector: string) {
  const container = page.locator(selector);
  await expect(container).toBeVisible();
  const isOverflowing = await container.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(isOverflowing).toBe(false);
}
