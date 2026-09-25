import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { checkNoHorizontalScroll, checkNoTableOverflow, loginUser } from "./helpers.js";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("VIS-01, VIS-02, VIS-03: Responsive Layout & Visual Verification", () => {
  test("verifies zero horizontal overflow and responsive component adaptations across desktop, tablet, and mobile", async ({
    page,
  }) => {
    const screenshotRoot = path.resolve(process.cwd(), "artifacts/lab-03/screenshots");
    const screenshotDirs = {
      auth: path.join(screenshotRoot, "authentication"),
      requester: path.join(screenshotRoot, "requester"),
      queue: path.join(screenshotRoot, "staff-queue"),
      staffDetail: path.join(screenshotRoot, "staff-ticket-detail"),
      userManagement: path.join(screenshotRoot, "user-management"),
    };

    for (const dir of Object.values(screenshotDirs)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const capture = async (dir: string, name: string, vpName: string) => {
      await page.screenshot({
        path: path.join(dir, `${name}-${vpName}.png`),
        fullPage: true,
      });
    };

    // 1. Sign In view across viewports
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await checkNoHorizontalScroll(page);
      await capture(screenshotDirs.auth, "01-login", vp.name);
    }

    // 2. Sign in as Admin to check authenticated views
    await loginUser(page, "harper.morgan@toktickit.local", "ChangeMe-2026!", "Harper-Admin-2026!");

    // 3. User Management across viewports
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await checkNoHorizontalScroll(page);

      if (vp.name === "mobile" || vp.name === "tablet") {
        await expect(page.locator(".admin-users-table-container")).toBeHidden();
        await expect(page.locator(".admin-users-cards")).toBeVisible();
      } else {
        await expect(page.locator(".admin-users-table-container")).toBeVisible();
        await expect(page.locator(".admin-users-cards")).toBeHidden();
        await checkNoTableOverflow(page, ".admin-users-table-container");
      }
      await capture(screenshotDirs.userManagement, "02-user-management", vp.name);
    }

    // 4. Staff Queue across viewports
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/staff/tickets");
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await checkNoHorizontalScroll(page);

      if (vp.name === "mobile" || vp.name === "tablet") {
        await expect(page.locator(".staff-queue-table-container")).toBeHidden();
        await expect(page.locator(".staff-queue-cards")).toBeVisible();
      } else {
        await expect(page.locator(".staff-queue-table-container")).toBeVisible();
        await expect(page.locator(".staff-queue-cards")).toBeHidden();
        await checkNoTableOverflow(page, ".staff-queue-table-container");
        // Verify all column headers including Owner, Last Updated, and Actions are visible without clipping
        for (const colName of ["Ticket Number", "Summary", "Requester", "Req. Priority", "IT Priority", "Status", "Owner", "Last Updated"]) {
          await expect(page.locator(".staff-queue-table").getByRole("columnheader", { name: colName })).toBeVisible();
        }
        await expect(page.locator(".staff-queue-table .action-cell").first().getByRole("button", { name: /View details/i })).toBeVisible();
      }
      await capture(screenshotDirs.queue, "03-staff-queue", vp.name);
    }

    // 5. Staff Ticket Detail across viewports
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/staff/tickets/1");
      await expect(page.getByRole("heading", { name: /Ticket Details/i })).toBeVisible();
      await checkNoHorizontalScroll(page);
      await capture(screenshotDirs.staffDetail, "04-staff-ticket-detail", vp.name);
    }

    // 6. Requester My Tickets across viewports
    await page.getByRole("button", { name: "Log out" }).click();
    await loginUser(page, "diego.santos@toktickit.local", "ChangeMe-2026!", "Diego-SecPass-2026!");
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/tickets");
      await expect(page.getByRole("heading", { name: /My Tickets/i })).toBeVisible();
      await checkNoHorizontalScroll(page);
      if (vp.name === "desktop") {
        await checkNoTableOverflow(page, ".ticket-table-container");
      }
      await capture(screenshotDirs.requester, "05-my-tickets", vp.name);
    }

    // 7. Log out
    await page.getByRole("button", { name: "Log out" }).click();
  });
});
