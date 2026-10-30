import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { loginUser } from "../lab-03/helpers.js";
import { E2E_DATABASE_URL } from "../test-environment.js";
import { createRequire } from "node:module";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));
const { PrismaClient } = serverRequire("@prisma/client");

async function seedTicketWithMixedActions() {
  const prisma = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { ticketNumber: "TKT-2026-00001" },
      select: { id: true },
    });
    const ethan = await prisma.user.findUniqueOrThrow({
      where: { email: "ethan.brooks@toktickit.local" },
      select: { id: true },
    });
    const gavin = await prisma.user.findUniqueOrThrow({
      where: { email: "gavin.lee@toktickit.local" },
      select: { id: true },
    });

    // Temporarily disable append-only trigger in e2e_test schema to reset
    await prisma.$executeRawUnsafe(`ALTER TABLE "e2e_test"."ActionTakenHistory" DISABLE TRIGGER trg_action_history_append_only;`);
    await prisma.$executeRawUnsafe(`DELETE FROM "e2e_test"."ActionTakenHistory" WHERE "ticketId" = ${ticket.id};`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "e2e_test"."ActionTakenHistory" ENABLE TRIGGER trg_action_history_append_only;`);
    await prisma.actionTaken.deleteMany({ where: { ticketId: ticket.id } });

    // Ensure Ticket 1 is OPEN and owned by Ethan
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { currentStatus: "OPEN", ownerId: ethan.id },
    });

    const now = new Date();

    // 1. PENDING Action (act1)
    const act1 = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        idempotencyKey: "act-vis-001",
        createdById: ethan.id,
        assigneeId: ethan.id,
        status: "PENDING",
        description: "Reset email password and verify MFA token.",
        followUpRequired: true,
        followUpNote: "Verify with user after workstation login.",
        version: 1,
      },
    });
    await prisma.actionTakenHistory.create({
      data: {
        actionId: act1.id,
        ticketId: ticket.id,
        actorId: ethan.id,
        eventType: "CREATED",
        version: 1,
        snapshot: {
          changes: {
            description: { before: null, after: "Reset email password and verify MFA token." },
            status: { before: null, after: "PENDING" },
            assignee: { beforeId: null, afterId: ethan.id },
            followUpRequired: { before: null, after: true },
            followUpNote: { before: null, after: "Verify with user after workstation login." },
          },
          versionBefore: null,
          versionAfter: 1,
        },
      },
    });

    // 2. COMPLETED Action (act2)
    const act2 = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        idempotencyKey: "act-vis-002",
        createdById: ethan.id,
        assigneeId: ethan.id,
        completedById: gavin.id,
        status: "COMPLETED",
        description: "Checked server exchange logs for blocked IP.",
        result: "No IP blocks found; connection allowed through firewall.",
        completedAt: now,
        version: 2,
      },
    });
    await prisma.actionTakenHistory.create({
      data: {
        actionId: act2.id,
        ticketId: ticket.id,
        actorId: ethan.id,
        eventType: "CREATED",
        version: 1,
        snapshot: {
          changes: {
            description: { before: null, after: "Checked server exchange logs for blocked IP." },
            status: { before: null, after: "PENDING" },
            assignee: { beforeId: null, afterId: ethan.id },
          },
          versionBefore: null,
          versionAfter: 1,
        },
      },
    });
    await prisma.actionTakenHistory.create({
      data: {
        actionId: act2.id,
        ticketId: ticket.id,
        actorId: gavin.id,
        eventType: "COMPLETED",
        version: 2,
        snapshot: {
          changes: {
            status: { before: "PENDING", after: "COMPLETED" },
            result: { before: null, after: "No IP blocks found; connection allowed through firewall." },
            completedBy: { beforeId: null, afterId: gavin.id },
          },
          versionBefore: 1,
          versionAfter: 2,
        },
      },
    });

    // 3. CANCELLED Action (act3)
    const act3 = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        idempotencyKey: "act-vis-003",
        createdById: ethan.id,
        assigneeId: ethan.id,
        status: "CANCELLED",
        description: "Deploy legacy email client profile fix.",
        cancellationReason: "Duplicate action item; resolved under ticket #42.",
        cancelledAt: now,
        version: 2,
      },
    });
    await prisma.actionTakenHistory.create({
      data: {
        actionId: act3.id,
        ticketId: ticket.id,
        actorId: ethan.id,
        eventType: "CREATED",
        version: 1,
        snapshot: {
          changes: {
            description: { before: null, after: "Deploy legacy email client profile fix." },
            status: { before: null, after: "PENDING" },
          },
          versionBefore: null,
          versionAfter: 1,
        },
      },
    });
    await prisma.actionTakenHistory.create({
      data: {
        actionId: act3.id,
        ticketId: ticket.id,
        actorId: ethan.id,
        eventType: "CANCELLED",
        version: 2,
        snapshot: {
          changes: {
            status: { before: "PENDING", after: "CANCELLED" },
            cancellationReason: { before: null, after: "Duplicate action item; resolved under ticket #42." },
          },
          versionBefore: 1,
          versionAfter: 2,
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function captureScreenshot(page: Page, relativePath: string) {
  await page.evaluate(() => document.fonts.ready);
  const targetPath = path.resolve("artifacts/lab-04/screenshots", relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await page.screenshot({ path: targetPath, fullPage: true });
}

async function waitForStaffDashboardLoaded(page: Page) {
  await expect(page.getByRole("heading", { name: "Operational Overview" })).toBeVisible();
  await expect(page.locator('[data-testid="metric-open-tickets"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-pending-actions"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-completed-today"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-unassigned-queue"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: /My Assigned Work/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Unassigned Team Work/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recent Action Activity/i })).toBeVisible();
}

async function waitForRequesterDashboardLoaded(page: Page) {
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
  await expect(page.locator('[data-testid="metric-active-tickets"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-awaiting-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="metric-resolved-closed"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Ticket Activity" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Recent Ticket Activity table" })).toBeVisible();
}

test.describe("Lab 4 Visual & Screenshot Evidence Capture (17 UI-Spec Items)", () => {
  test.beforeEach(async () => {
    await seedTicketWithMixedActions();
  });

  test("captures all 17 specified Lab 4 screenshots across viewports and flows", async ({ page }) => {
    // =========================================================================
    // 1-3. Staff Dashboard (Desktop, Tablet, Mobile)
    // =========================================================================
    await loginUser(page, "ethan.brooks@toktickit.local");

    // Staff Dashboard - Desktop (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/staff/dashboard");
    await waitForStaffDashboardLoaded(page);
    await captureScreenshot(page, "staff-dashboard/desktop-overview.png");

    // Staff Dashboard - Tablet (834x1112)
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.reload();
    await waitForStaffDashboardLoaded(page);
    await captureScreenshot(page, "staff-dashboard/tablet-view.png");

    // Staff Dashboard - Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await waitForStaffDashboardLoaded(page);
    await captureScreenshot(page, "staff-dashboard/mobile-view.png");

    // =========================================================================
    // 17. Accessibility Reflow Check (320px equivalent-width)
    // =========================================================================
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload();
    await waitForStaffDashboardLoaded(page);
    await captureScreenshot(page, "accessibility/reflow-400-percent.png");

    // =========================================================================
    // 7-9. Staff Actions List (Desktop, Tablet, Mobile)
    // =========================================================================
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/staff/tickets/1");
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();
    const actionsSection = page.locator("section.actions-taken-section");
    await expect(actionsSection).toBeVisible();
    await expect(actionsSection.getByText("PENDING").first()).toBeVisible();
    await expect(actionsSection.getByText("COMPLETED").first()).toBeVisible();
    await expect(actionsSection.getByText("CANCELLED").first()).toBeVisible();

    // Staff Actions List - Desktop (1440x900)
    await captureScreenshot(page, "actions-taken/staff-actions-list-desktop.png");

    // Staff Actions List - Tablet (834x1112)
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.reload();
    await expect(page.locator("section.actions-taken-section")).toBeVisible();
    await expect(page.locator("section.actions-taken-section").getByText("PENDING").first()).toBeVisible();
    await captureScreenshot(page, "actions-taken/staff-actions-list-tablet.png");

    // Staff Actions List - Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator("section.actions-taken-section")).toBeVisible();
    await expect(page.locator("section.actions-taken-section").getByText("PENDING").first()).toBeVisible();
    await captureScreenshot(page, "actions-taken/staff-actions-list-mobile.png");

    // Return to Desktop for modal & dialog captures
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/staff/tickets/1");
    await expect(page.locator("section.actions-taken-section")).toBeVisible();

    // =========================================================================
    // 10. Create Action Modal (Captured in Pending-Submit State)
    // =========================================================================
    const addActionBtn = page.getByRole("button", { name: "+ Add Action Taken" });
    await addActionBtn.click();
    const createDialog = page.getByRole("dialog", { name: "Add Action Taken" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/Description/).fill("Conducted deep packet capture on core gateway interface.");
    await createDialog.getByLabel("Follow-up Required").check();
    await createDialog.getByLabel(/Follow-up Note/).fill("Verify with network operations after scheduled gateway reboot.");
    await createDialog.getByLabel(/Attachment Notes/).fill("pcap-trace-gateway-443.pcap");

    // Intercept POST /api/tickets/1/actions with a controlled gate to capture pending-submit state
    let releaseSubmit: () => void = () => {};
    const submitGate = new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });

    await page.route("**/api/tickets/1/actions", async (route) => {
      if (route.request().method() === "POST") {
        await submitGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Click "Save Action" to trigger the pending submission
    const saveActionBtn = createDialog.getByRole("button", { name: "Save Action" });
    await saveActionBtn.click();

    // Assert that the visible button text switches to "Saving…" and is disabled
    const savingBtn = createDialog.getByRole("button", { name: /Saving/ });
    await expect(savingBtn).toBeVisible();
    await expect(savingBtn).toBeDisabled();

    // Capture the pending state with modal and form controls visible
    await captureScreenshot(page, "actions-taken/create-action-modal.png");

    // Release the request and wait for the response to complete
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/tickets/1/actions") && res.request().method() === "POST"
    );
    releaseSubmit();
    await responsePromise;
    await page.unroute("**/api/tickets/1/actions");

    // Verify modal closes and the newly created action is in the list
    await expect(createDialog).not.toBeVisible();
    await expect(actionsSection.getByText("Conducted deep packet capture on core gateway interface.")).toBeVisible();

    // =========================================================================
    // 11. Complete Action Modal
    // =========================================================================
    const pendingActionCard = page.locator("li.action-item-card", {
      hasText: "Reset email password and verify MFA token.",
    });
    const completeBtn = pendingActionCard.getByRole("button", { name: "Complete Action" });
    await completeBtn.click();
    const completeDialog = page.getByRole("dialog", { name: /Complete Action Taken/ });
    await expect(completeDialog).toBeVisible();
    await completeDialog.getByLabel(/Documented Result/).fill("MFA token synchronized; mailbox password successfully reset and confirmed.");
    await captureScreenshot(page, "actions-taken/complete-action-modal.png");
    await page.keyboard.press("Escape");
    await expect(completeDialog).not.toBeVisible();

    // =========================================================================
    // 12. Cancel Action Modal
    // =========================================================================
    const cancelBtn = pendingActionCard.getByRole("button", { name: "Cancel Action" });
    await cancelBtn.click();
    const cancelDialog = page.getByRole("dialog", { name: /Cancel Action Taken/ });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByLabel(/Cancellation Reason/).fill("Superseded by hardware maintenance ticket #42.");
    await captureScreenshot(page, "actions-taken/cancel-action-modal.png");
    await page.keyboard.press("Escape");
    await expect(cancelDialog).not.toBeVisible();

    // =========================================================================
    // 13. Audit History Drawer / Dialog
    // =========================================================================
    const completedActionCard = page.locator("li.action-item-card", {
      hasText: "Checked server exchange logs for blocked IP.",
    });
    const historyBtn = completedActionCard.getByRole("button", { name: "View Audit History" });
    await historyBtn.click();
    const historyDialog = page.getByRole("dialog", { name: /Audit History/ });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText("CREATED", { exact: true })).toBeVisible();
    await expect(historyDialog.getByText("COMPLETED", { exact: true })).toBeVisible();
    await captureScreenshot(page, "actions-taken/audit-history-drawer.png");
    const closeHistoryBtn = historyDialog.getByRole("button", { name: "Close" }).last();
    await closeHistoryBtn.click();
    await expect(historyDialog).not.toBeVisible();

    // =========================================================================
    // 14. Resolution Gate Failure Alert Banner
    // =========================================================================
    const statusSelect = page.getByLabel("Status Transition");
    await statusSelect.selectOption("RESOLVED");
    const confirmStatusDialog = page.getByRole("dialog", { name: /Change Status to Resolved/i });
    await expect(confirmStatusDialog).toBeVisible();
    await confirmStatusDialog.getByRole("button", { name: "Confirm Status Change" }).click();
    const gateBanner = page.locator(".resolution-gate-banner");
    await expect(gateBanner).toBeVisible();
    await expect(gateBanner).toContainText(/all actions must be completed/i);
    await captureScreenshot(page, "actions-taken/resolution-gate-failure.png");

    // =========================================================================
    // 4-6. Requester Dashboard (Desktop, Tablet, Mobile)
    // =========================================================================
    await page.context().clearCookies();
    await page.goto("/login");
    await loginUser(page, "amina.rahman@toktickit.local");

    // Requester Dashboard - Desktop (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await waitForRequesterDashboardLoaded(page);
    await captureScreenshot(page, "requester-dashboard/desktop-summary.png");

    // Requester Dashboard - Tablet (834x1112)
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.reload();
    await waitForRequesterDashboardLoaded(page);
    await captureScreenshot(page, "requester-dashboard/tablet-view.png");

    // Requester Dashboard - Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await waitForRequesterDashboardLoaded(page);
    await captureScreenshot(page, "requester-dashboard/mobile-view.png");

    // =========================================================================
    // 15-16. Requester Read-Only View (Desktop, Mobile)
    // =========================================================================
    // Requester Ticket Detail - Desktop (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tickets/1");
    const reqActionsSection = page.locator("section.actions-taken-section");
    await expect(reqActionsSection).toBeVisible();
    await expect(reqActionsSection.getByText("PENDING").first()).toBeVisible();
    // Verify no staff mutation controls are present
    await expect(reqActionsSection.getByRole("button", { name: "+ Add Action Taken" })).not.toBeVisible();
    await expect(reqActionsSection.getByRole("button", { name: "Complete Action" })).not.toBeVisible();
    await expect(reqActionsSection.getByRole("button", { name: "Cancel Action" })).not.toBeVisible();
    await captureScreenshot(page, "actions-taken/requester-read-only-desktop.png");

    // Requester Ticket Detail - Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator("section.actions-taken-section")).toBeVisible();
    await expect(page.locator("section.actions-taken-section").getByText("PENDING").first()).toBeVisible();
    await captureScreenshot(page, "actions-taken/requester-read-only-mobile.png");
  });
});
