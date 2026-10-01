import { expect, test, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { checkNoHorizontalScroll, checkNoTableOverflow, loginVisualAdmin, loginVisualRequester, openForcedPasswordChange } from "./helpers.js";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("E2E-A11Y-01: Accessibility and Keyboard Navigation", () => {
  test("mobile navigation exposes its state and preserves requester discard-dialog focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginVisualAdmin(page);
    const toggle = page.getByRole("button", { name: "Navigation", exact: true });
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(navigation).toHaveAttribute("id", (await toggle.getAttribute("aria-controls"))!);
    await page.keyboard.press("Tab");
    await expect(navigation.getByRole("button", { name: "User Management", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(navigation.getByRole("button", { name: "Ticket Queue", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(navigation).toBeHidden();
    await toggle.click();
    await navigation.getByRole("button", { name: "Ticket Queue", exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/tickets$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await page.setViewportSize({ width: 767, height: 844 });
    await expect(toggle).toBeVisible();
    await page.setViewportSize({ width: 768, height: 844 });
    await expect(toggle).toBeHidden();
    await expect(navigation).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Log out" }).click();

    await loginVisualRequester(page);
    const dir = path.resolve("artifacts/lab-03/screenshots/candidate-checks");
    fs.mkdirSync(dir, { recursive: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();
    await page.screenshot({ path: path.join(dir, "navigation-closed-mobile.png"), fullPage: true });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(navigation.getByRole("button", { name: "My Tickets", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: path.join(dir, "navigation-open-mobile.png"), fullPage: true });
    await navigation.getByRole("button", { name: "Create Ticket", exact: true }).click();
    await expect(page).toHaveURL(/\/tickets\/new$/);
    await expect(toggle).toBeFocused();
    await page.getByLabel("Summary").fill("Mobile keyboard draft; not submitted.");
    await toggle.click();
    const myTickets = navigation.getByRole("button", { name: "My Tickets", exact: true });
    await myTickets.click();
    const dialog = page.getByRole("dialog", { name: "Discard unsaved Ticket?", exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(myTickets).toBeVisible();
    await expect(myTickets).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("candidate checklist: long user data, mobile targets and contextual validation", async ({ page }) => {
    await loginVisualAdmin(page);
    const session = await page.request.get("http://localhost:8000/api/auth/me");
    expect(session.status()).toBe(200);
    const csrfToken = (await session.json()).data.csrfToken;
    const name = `Candidate ${"N".repeat(90)}`;
    const email = `candidate-visual-${"n".repeat(44)}@${"e".repeat(60)}.${"e".repeat(60)}.toktickit.local`;
    const created = await page.request.post("http://localhost:8000/api/admin/users", {
      headers: { "X-CSRF-Token": csrfToken },
      data: { name, email, role: "REQUESTER", isActive: true, initialPassword: "ChangeMe-2026!" },
    });
    expect(created.status()).toBe(201);
    const dir = path.resolve("artifacts/lab-03/screenshots/candidate-checks");
    fs.mkdirSync(dir, { recursive: true });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 834, height: 1112 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/users");
      await page.getByLabel("Search users").fill(email);
      const list = page.locator(viewport.name === "desktop" ? ".admin-users-table" : ".admin-users-cards");
      await expect(list.getByText(name, { exact: true })).toBeVisible();
      await expect(list.getByText(email, { exact: true })).toBeVisible();
      await checkNoHorizontalScroll(page);
      if (viewport.name === "desktop") await checkNoTableOverflow(page, ".admin-users-table-container");
      for (const text of [name, email]) {
        const fits = await list.getByText(text, { exact: true }).evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const bounds = element.getBoundingClientRect();
          return Array.from(range.getClientRects()).every(rect =>
            rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
        });
        expect(fits, `The full ${text === name ? "name" : "email"} must wrap inside its own cell`).toBe(true);
      }
      if (viewport.name === "mobile") {
        const undersized = await page.locator("button:visible, input:visible, select:visible").evaluateAll(controls =>
          controls.flatMap(control => {
            const rect = control.getBoundingClientRect();
            return rect.width < 24 || rect.height < 24 ? [control.textContent || control.getAttribute("aria-label")] : [];
          }));
        expect(undersized, "Sampled mobile targets meet 24x24 CSS px").toEqual([]);
      }
      await page.screenshot({ path: path.join(dir, `long-user-${viewport.name}.png`), fullPage: true });
    }

    await page.getByRole("button", { name: "Create User", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const checkDialogFrame = async () => {
      for (const control of [dialog.getByRole("heading"), dialog.getByRole("button", { name: "Close dialog" }),
        dialog.getByRole("button", { name: "Cancel", exact: true }), dialog.getByRole("button", { name: "Create User", exact: true })]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(844);
      }
    };
    await dialog.getByRole("button", { name: "Create User", exact: true }).click();
    await expect(dialog.getByText("Full name must be between 2 and 100 characters.")).toBeVisible();
    await expect(dialog.getByLabel("Full Name", { exact: false })).toBeFocused();
    await checkDialogFrame();
    await page.screenshot({ path: path.join(dir, "user-validation-mobile.png") });
    await dialog.getByLabel("Full Name", { exact: false }).fill(name);
    await dialog.getByLabel("Email Address", { exact: false }).fill(email);
    await dialog.getByLabel("Initial Password", { exact: false }).fill("ChangeMe-2026!");
    await dialog.getByRole("button", { name: "Create User", exact: true }).click();
    await expect(dialog.getByText("A user with this email address already exists.", { exact: true })).toBeVisible();
    await expect(dialog.locator(".alert-danger")).toHaveCSS("color", "rgb(185, 28, 28)");
    await expect(dialog.locator(".alert-danger")).toHaveCSS("background-color", "rgb(254, 242, 242)");
    await expect(dialog.getByText("This email address is already in use.", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Email Address", { exact: false })).toBeFocused();
    await expect(dialog.getByLabel("Email Address", { exact: false })).toHaveValue(email);
    await checkDialogFrame();
    await page.screenshot({ path: path.join(dir, "user-conflict-mobile.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("automated axe accessibility scan across core Lab 3 views", async ({ page }) => {
    // 1. Login View
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    let scan = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(scan.violations).toEqual([]);

    // Real forced-password session, with no success response interception.
    const restorePasswordFlag = await openForcedPasswordChange(page);
    try {
      await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
      scan = await new AxeBuilder({ page })
        .withTags(axeTags)
        .analyze();
      expect(scan.violations).toEqual([]);
      await page.getByRole("button", { name: "Change password", exact: true }).click();
      await expect(page.getByLabel("Current or initial password", { exact: true })).toBeFocused();
      await expect(page.getByLabel("Current or initial password", { exact: true })).toHaveAttribute("aria-invalid", "true");
      await page.getByRole("button", { name: "Log out" }).click();
    } finally {
      await restorePasswordFlag();
    }
    await loginVisualAdmin(page);

    // 3. User Management View
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await expect(page.locator(".admin-users-table-container")).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(scan.violations).toEqual([]);

    // 4. Staff Queue View
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
    await expect(page.locator(".staff-queue-table-container")).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(scan.violations).toEqual([]);

    // 5. Staff Ticket Detail View
    await page.goto("/staff/tickets/1");
    await expect(page.getByRole("heading", { name: "Ticket Detail", exact: true })).toBeVisible();
    await expect(page.getByLabel("Add an internal note", { exact: true })).toBeVisible();

    scan = await new AxeBuilder({ page })
      .withTags(axeTags)
      .analyze();
    expect(scan.violations).toEqual([]);

    // 6. Log out
    await page.getByRole("button", { name: "Log out" }).click();
    await loginVisualRequester(page);
    await expect(page.getByRole("button", { name: "View Details", exact: true }).filter({ visible: true }).first()).toBeVisible();
    scan = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(scan.violations).toEqual([]);
    await page.getByRole("button", { name: "View Details", exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByLabel("Add a comment", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading comments…", { exact: true })).toBeHidden();
    scan = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(scan.violations).toEqual([]);
  });

  test("AC-28: major views reflow at 320 CSS px with reachable controls", async ({ page }) => {
    // Equivalent CSS-width reflow evidence, not physical 400% browser zoom or a screen-reader audit.
    await page.setViewportSize({ width: 320, height: 844 });
    const reflow = async () => {
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        offenders: Array.from(document.querySelectorAll("body *"))
          .map(element => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", text: element.textContent?.trim().slice(0, 48), right: element.getBoundingClientRect().right }))
          .filter(item => item.right > document.documentElement.clientWidth + 1)
          .slice(-12),
      }));
      expect(overflow.scrollWidth, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(overflow.clientWidth);
      await checkNoHorizontalScroll(page);
      const clippedLabels = await page.locator("label:visible").evaluateAll(labels => labels.flatMap(label => {
        const range = document.createRange();
        range.selectNodeContents(label);
        const rects = Array.from(range.getClientRects());
        return rects.some(rect => rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)
          ? [label.textContent?.trim()] : [];
      }));
      expect(clippedLabels, "Visible labels must wrap within the 320 CSS px viewport").toEqual([]);
    };
    const reachable = async (control: Locator) => {
      await expect(control).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(321);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(845);
      await control.click({ trial: true }); // Actionability, including absence of an intercepting overlay.
      await control.focus();
      await expect(control).toBeFocused();
    };

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await reflow();
    await reachable(page.getByLabel("Email", { exact: true }));
    await reachable(page.getByRole("button", { name: "Sign in", exact: true }));
    const restorePasswordFlag = await openForcedPasswordChange(page);
    try {
      await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await reflow();
      await reachable(page.getByLabel("Current or initial password", { exact: true }));
      await reachable(page.getByRole("button", { name: "Change password", exact: true }));
      await page.getByRole("button", { name: "Log out" }).click();
    } finally {
      await restorePasswordFlag();
    }

    await loginVisualAdmin(page);
    await page.goto("/admin/users");
    await expect(page.locator(".admin-users-cards")).toBeVisible();
    await reflow();
    const create = page.getByRole("button", { name: "Create User", exact: true });
    await reachable(create);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await reflow();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(844);
    await reachable(dialog.getByLabel("Full Name", { exact: false }));
    await reachable(dialog.getByRole("button", { name: "Create User", exact: true }));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(create).toBeFocused();

    await page.goto("/staff/tickets");
    await expect(page.locator(".staff-queue-cards")).toBeVisible();
    await reflow();
    await reachable(page.getByLabel("Search tickets", { exact: true }));
    await reachable(page.getByRole("button", { name: /View details for/ }).filter({ visible: true }).first());
    await page.goto("/staff/tickets/1");
    await expect(page.getByLabel("Ticket Owner", { exact: true })).toBeVisible();
    await reflow();
    await reachable(page.getByLabel("Ticket Owner", { exact: true }));
    await reachable(page.getByLabel("Add an internal note", { exact: true }));
    await reachable(page.getByRole("button", { name: "Post public comment", exact: true }));
    await page.getByRole("button", { name: "Log out" }).click();

    await loginVisualRequester(page);
    const detail = page.getByRole("button", { name: "View Details", exact: true }).filter({ visible: true }).first();
    await expect(detail).toBeVisible();
    await reflow();
    await reachable(detail);
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Add a comment", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading comments…", { exact: true })).toBeHidden();
    await reflow();
    await reachable(page.getByLabel("Add a comment", { exact: true }));
    await page.getByLabel("Add a comment", { exact: true }).fill("Reflow verification draft; not submitted.");
    await reachable(page.getByRole("button", { name: "Post public comment", exact: true }));
  });

  test("keyboard navigation, focus trapping, and Escape key in dialogs", async ({ page }) => {
    await loginVisualAdmin(page);
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    const createBtn = page.getByRole("button", { name: "Create User" });
    await createBtn.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify focus is inside dialog
    await expect.poll(() => page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement);
    })).toBe(true);

    // Exercise both boundaries with real keyboard events, not only DOM containment.
    const first = dialog.getByRole("button", { name: "Close dialog" });
    const last = dialog.getByRole("button", { name: "Create User", exact: true });
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Full Name", { exact: false })).toBeFocused();

    // Press Escape to dismiss modal
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Verify focus returned to trigger button
    await expect(createBtn).toBeFocused();
  });
});
