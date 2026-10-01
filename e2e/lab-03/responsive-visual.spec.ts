import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { checkNoHorizontalScroll, checkNoTableOverflow, loginVisualAdmin, loginVisualRequester, openForcedPasswordChange } from "./helpers.js";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("VIS-01–03: approved 45-state responsive evidence", () => {
  for (const vp of viewports) {
    test(`${vp.name}: authenticated workflows and safe states`, async ({ page }) => {
      await page.setViewportSize(vp);
      const capture = async (area: string, state: string, fullPage = true) => {
        await page.evaluate(() => document.fonts.ready);
        await checkNoHorizontalScroll(page);
        const dir = path.resolve("artifacts/lab-03/screenshots", area);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${state}-${vp.name}.png`), fullPage });
      };
      const responsiveList = async (table: string, cards: string) => {
        await expect(page.locator(vp.name === "desktop" ? table : cards)).toBeVisible();
        await expect(page.locator(vp.name === "desktop" ? cards : table)).toBeHidden();
        if (vp.name === "desktop") await checkNoTableOverflow(page, table);
      };
      const checkDialogFields = async () => {
        const fields = page.getByRole("dialog").locator(".form-input");
        expect(await fields.count()).toBeGreaterThan(0);
        for (const field of await fields.all()) {
          const geometry = await field.evaluate(input => {
            const rect = input.getBoundingClientRect();
            const label = input.parentElement!.querySelector("label")!.getBoundingClientRect();
            return { height: rect.height, width: rect.width, parentWidth: input.parentElement!.clientWidth,
              belowLabel: rect.top >= label.bottom };
          });
          expect(geometry.height).toBeGreaterThanOrEqual(44);
          expect(geometry.width).toBeGreaterThanOrEqual(geometry.parentWidth - 1);
          expect(geometry.belowLabel).toBe(true);
        }
      };

      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await capture("authentication", "01-login-ready");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Email")).toBeFocused();
      await capture("authentication", "02-login-validation-or-safe-failure");
      const restorePasswordFlag = await openForcedPasswordChange(page);
      try {
        await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Log out" })).toHaveCSS("white-space", "nowrap");
        await capture("authentication", "03-change-password");
        await page.getByRole("button", { name: "Log out" }).click();
      } finally {
        await restorePasswordFlag();
      }

      await loginVisualAdmin(page);
      await page.goto("/admin/users");
      await expect(page.getByRole("button", { name: "Edit Harper Morgan", exact: true }).first()).toBeAttached();
      await responsiveList(".admin-users-table-container", ".admin-users-cards");
      await capture("user-management", "01-users-list");
      await page.getByRole("button", { name: "Create User", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await checkDialogFields();
      await capture("user-management", "02-create-or-edit-user", false);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await page.getByRole("button", { name: "Edit Harper Morgan", exact: true }).filter({ visible: true }).click();
      await expect(page.getByLabel("Active Account")).toBeDisabled();
      await checkDialogFields();
      await expect(page.getByText("You cannot deactivate your own account.")).toBeVisible();
      await capture("user-management", "03-deactivation-safety-or-forbidden", false);
      await page.keyboard.press("Escape");

      await page.goto("/staff/tickets");
      await responsiveList(".staff-queue-table-container", ".staff-queue-cards");
      await expect(page.getByRole("button", { name: /View details for/ }).filter({ visible: true }).first()).toBeVisible();
      await capture("staff-queue", "01-queue-results");
      await page.getByLabel("Search tickets", { exact: true }).fill("no-such-ticket-visual-issue45");
      await expect(page.getByRole("heading", { name: "No matching tickets" })).toBeVisible();
      await capture("staff-queue", "02-queue-filter-no-results");
      // Explicit transport failure only; successful views use the real API/DB.
      const queueUrl = /\/api\/staff\/tickets(?:\?.*)?$/;
      await page.route(queueUrl, route => route.abort("failed"));
      await page.goto("/staff/tickets");
      await expect(page.getByRole("heading", { name: "Failed to load ticket queue" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
      await capture("staff-queue", "03-queue-loading-or-failure");
      await page.unroute(queueUrl);

      await page.goto("/staff/tickets/1");
      await expect(page.getByLabel("Ticket Owner", { exact: true })).toBeVisible();
      await expect(page.locator("#status-select")).toBeVisible();
      await capture("staff-ticket-detail", "01-detail-assignment-priority-status");
      await page.getByLabel("Add a public comment", { exact: true }).fill("Public response draft visible to the requester.");
      await page.getByLabel("Add an internal note", { exact: true }).fill("Internal investigation draft for IT Staff and Administrators.");
      await expect(page.getByRole("heading", { name: "Internal Notes", exact: true })).toBeVisible();
      await capture("staff-ticket-detail", "02-detail-public-and-internal-notes");
      await page.getByLabel("Add a public comment", { exact: true }).fill("");
      await page.getByRole("button", { name: "Post public comment", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Comment must contain 1 to 2,000 characters.");
      await capture("staff-ticket-detail", "03-detail-conflict-or-validation");

      await page.getByRole("button", { name: "Log out" }).click();
      await loginVisualRequester(page);
      await page.goto("/tickets");
      const detailButton = page.getByRole("button", { name: "View Details", exact: true }).filter({ visible: true }).first();
      await expect(detailButton).toBeVisible();
      if (vp.name === "desktop") await checkNoTableOverflow(page, ".ticket-table-container");
      await capture("requester", "01-my-tickets-authenticated");

      // Use a fresh Ticket for each viewport so the comment and resolution
      // captures show genuinely different states, independent of test order.
      if (vp.name === "mobile") await page.getByRole("button", { name: "Navigation", exact: true }).click();
      await page.locator("nav").getByRole("button", { name: "Create Ticket" }).click();
      await page.getByLabel("Summary").fill(`Visual evidence requester conversation ${vp.name}`);
      await page.getByLabel("Category").selectOption({ label: "Hardware" });
      await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
      await page.getByLabel("Description").fill("The keyboard intermittently stops responding during work.");
      await page.getByRole("button", { name: "Submit Ticket" }).click();
      await expect(page.getByRole("heading", { name: "Your Ticket has been submitted" })).toBeVisible();
      await page.getByRole("button", { name: "View Ticket" }).click();
      await expect(page.getByLabel("Add a comment", { exact: true })).toBeVisible();
      await expect(page.getByText("Loading comments…", { exact: true })).toBeHidden();
      await expect(page.getByRole("heading", { name: "Internal Notes" })).toHaveCount(0);
      const comment = `Public requester update for ${vp.name} evidence.`;
      await page.getByLabel("Add a comment", { exact: true }).fill(comment);
      await page.getByRole("button", { name: "Post public comment", exact: true }).click();
      await expect(page.getByText(comment, { exact: true })).toBeVisible();
      await expect(page.getByText("Problem indicated as resolved", { exact: true })).toBeHidden();
      await capture("requester", "02-ticket-detail-public-comment");
      const indicated = page.getByText("Problem indicated as resolved", { exact: true });
      await page.getByRole("button", { name: "Problem appears resolved", exact: true }).click();
      await expect(indicated).toBeVisible();
      await capture("requester", "03-problem-appears-resolved");
    });
  }
});
