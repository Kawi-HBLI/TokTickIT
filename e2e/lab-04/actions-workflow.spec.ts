import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { loginUser, checkNoHorizontalScroll } from "../lab-03/helpers.js";
import { E2E_DATABASE_URL } from "../test-environment.js";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));

async function resetTicket1Actions() {
  const url = new URL(E2E_DATABASE_URL);
  if (url.searchParams.get("schema") !== "e2e_test") {
    throw new Error("Only e2e_test schema can be reset.");
  }
  const { PrismaClient } = serverRequire("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { summary: "Cannot access university email" },
      select: { id: true },
    });
    const ethan = await prisma.user.findUniqueOrThrow({ where: { email: "ethan.brooks@toktickit.local" }, select: { id: true } });
    const gavin = await prisma.user.findUniqueOrThrow({ where: { email: "gavin.lee@toktickit.local" }, select: { id: true } });

    // Clean up actions for ticket 1 (temporarily disable append-only trigger in e2e_test schema)
    await prisma.$executeRawUnsafe(`ALTER TABLE "e2e_test"."ActionTakenHistory" DISABLE TRIGGER trg_action_history_append_only;`);
    await prisma.$executeRawUnsafe(`DELETE FROM "e2e_test"."ActionTakenHistory" WHERE "ticketId" = ${ticket.id};`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "e2e_test"."ActionTakenHistory" ENABLE TRIGGER trg_action_history_append_only;`);
    await prisma.actionTaken.deleteMany({ where: { ticketId: ticket.id } });

    // Reset ticket status to OPEN and owner to Ethan Brooks
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { currentStatus: "OPEN", ownerId: ethan.id },
    });

    // Re-create initial seed actions
    const now = new Date();
    const act1 = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        idempotencyKey: "act-seed-001",
        createdById: ethan.id,
        assigneeId: ethan.id,
        status: "PENDING",
        description: "Reset email password and verify MFA token.",
        version: 1,
      },
      select: { id: true },
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
            followUpRequired: { before: null, after: false },
            followUpNote: { before: null, after: null },
            attachmentNotes: { before: null, after: null },
          },
          versionBefore: null,
          versionAfter: 1,
        },
      },
    });

    const act2 = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        idempotencyKey: "act-seed-002",
        createdById: ethan.id,
        assigneeId: ethan.id,
        completedById: gavin.id,
        status: "COMPLETED",
        description: "Checked server exchange logs for blocked IP.",
        result: "No IP blocks found; connection allowed.",
        completedAt: now,
        version: 2,
      },
      select: { id: true },
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
            followUpRequired: { before: null, after: false },
            followUpNote: { before: null, after: null },
            attachmentNotes: { before: null, after: null },
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
            result: { before: null, after: "No IP blocks found; connection allowed." },
            completedBy: { beforeId: null, afterId: gavin.id },
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

test.describe("Lab 4: Actions Taken and Ticket Resolution Workflow E2E", () => {
  test.beforeEach(async () => {
    await resetTicket1Actions();
  });
  test("Staff creates, edits, audits, fails resolution gate, completes actions, and successfully resolves ticket", async ({
    page,
  }) => {
    // 1. Log in as IT Staff (Ethan Brooks)
    await loginUser(page, "ethan.brooks@toktickit.local");

    // 2. Navigate to staff ticket queue and open Ticket 1
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /Ticket Queue/i })).toBeVisible();

    const viewTicketBtn = page
      .locator("tr, .staff-ticket-card", { hasText: "Cannot access university email" })
      .filter({ visible: true })
      .getByRole("button", { name: /View details/i });
    await expect(viewTicketBtn).toBeVisible();
    await viewTicketBtn.click();

    await page.waitForURL(/\/staff\/tickets\/\d+/);
    await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

    // 3. Verify Actions Taken section exists with seeded items
    const actionsSection = page.locator("section.actions-taken-section");
    await expect(actionsSection).toBeVisible();
    await expect(actionsSection.getByRole("heading", { name: /Actions Taken \(\d+\)/ })).toBeVisible();

    // Verify seeded items
    await expect(actionsSection.getByText("PENDING").first()).toBeVisible();
    await expect(actionsSection.getByText("COMPLETED").first()).toBeVisible();

    // 4. Create a new Action Taken with keyboard interactions
    const addActionBtn = actionsSection.getByRole("button", { name: "+ Add Action Taken" });
    await expect(addActionBtn).toBeVisible();
    await addActionBtn.click();

    const createDialog = page.getByRole("dialog", { name: "Add Action Taken" });
    await expect(createDialog).toBeVisible();

    // Verify focus is trapped inside dialog: pressing Escape closes it
    await page.keyboard.press("Escape");
    await expect(createDialog).not.toBeVisible();
    await expect(addActionBtn).toBeFocused();

    // Re-open dialog to submit a new action
    await addActionBtn.click();
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel(/Description/).fill("Conducted deep network trace on gateway port 443.");
    await createDialog.getByLabel("Follow-up Required").check();
    await createDialog.getByLabel(/Follow-up Note/).fill("Verify with network operations after gateway reboot.");
    await createDialog.getByLabel(/Attachment Notes/).fill("trace-port-443.pcap");

    const saveActionBtn = createDialog.getByRole("button", { name: "Save Action" });
    await saveActionBtn.click();

    // Wait for creation and dialog close
    await expect(createDialog).not.toBeVisible();
    await expect(
      actionsSection.getByText("Conducted deep network trace on gateway port 443.")
    ).toBeVisible();
    await expect(
      actionsSection.getByText(/Verify with network operations after gateway reboot/)
    ).toBeVisible();

    // 5. Edit the created action
    const createdActionCard = actionsSection.locator("li.action-item-card", {
      hasText: "Conducted deep network trace",
    });
    const editBtn = createdActionCard.getByRole("button", { name: "Edit Details" });
    await editBtn.click();

    const editDialog = page.getByRole("dialog", { name: /Edit Action Taken/ });
    await expect(editDialog).toBeVisible();

    await editDialog
      .getByLabel(/Description/)
      .fill("Conducted deep network trace on gateway port 443 and verified SSL handshakes.");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();

    await expect(editDialog).not.toBeVisible();
    await expect(
      actionsSection.getByText(
        "Conducted deep network trace on gateway port 443 and verified SSL handshakes."
      )
    ).toBeVisible();

    // 6. Cancel the action: test empty cancellation reason validation (peer requirement)
    const cancelBtn = createdActionCard.getByRole("button", { name: "Cancel Action" });
    await cancelBtn.click();

    const cancelDialog = page.getByRole("dialog", { name: /Cancel Action Taken/ });
    await expect(cancelDialog).toBeVisible();

    const confirmCancelBtn = cancelDialog.getByRole("button", { name: "Confirm Cancellation" });
    await confirmCancelBtn.click();

    // Empty reason error message displayed
    await expect(cancelDialog.getByText("Cancellation reason is required.")).toBeVisible();

    // Fill valid cancellation reason
    await cancelDialog
      .getByLabel(/Cancellation Reason/)
      .fill("Gateway firewall reset rendered trace analysis redundant.");
    await confirmCancelBtn.click();

    await expect(cancelDialog).not.toBeVisible();
    await expect(createdActionCard.locator(".action-badge-cancelled")).toBeVisible();
    await expect(
      createdActionCard.getByText(/Gateway firewall reset rendered trace analysis redundant/)
    ).toBeVisible();

    // 7. View Audit History
    const historyBtn = createdActionCard.getByRole("button", { name: "View Audit History" });
    await historyBtn.click();

    const historyDialog = page.getByRole("dialog", { name: /Audit History/ });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText("CREATED", { exact: true })).toBeVisible();
    await expect(historyDialog.getByText("CANCELLED", { exact: true })).toBeVisible();

    const closeHistoryBtn = historyDialog.getByRole("button", { name: "Close" }).last();
    await closeHistoryBtn.click();
    await expect(historyDialog).not.toBeVisible();

    // 8. Test Resolution Gate Failure
    // Ticket still has a PENDING seeded action ("Reset email password and verify MFA token.")
    const statusSelect = page.getByLabel("Status Transition");
    await statusSelect.selectOption("RESOLVED");

    const confirmStatusDialog = page.getByRole("dialog", { name: /Change Status to Resolved/i });
    await expect(confirmStatusDialog).toBeVisible();
    await confirmStatusDialog.getByRole("button", { name: "Confirm Status Change" }).click();

    // Resolution Gate alert banner is shown
    const gateBanner = page.locator(".resolution-gate-banner");
    await expect(gateBanner).toBeVisible();
    await expect(
      gateBanner.getByText("CANNOT RESOLVE TICKET: RESOLUTION REQUIREMENTS NOT MET")
    ).toBeVisible();
    await expect(gateBanner.getByText(/Zero PENDING Actions Taken/)).toBeVisible();

    // Dismiss Alert
    await gateBanner.getByRole("button", { name: "Dismiss Alert" }).first().click();
    await expect(gateBanner).not.toBeVisible();

    // 9. Complete the outstanding PENDING action
    const pendingSeedActionCard = actionsSection.locator("li.action-item-card", {
      hasText: "Reset email password and verify MFA token.",
    });
    const completeActionBtn = pendingSeedActionCard.getByRole("button", { name: "Complete Action" });
    await completeActionBtn.click();

    const completeDialog = page.getByRole("dialog", { name: /Complete Action Taken/ });
    await expect(completeDialog).toBeVisible();

    // Validation: result < 3 chars
    await completeDialog.getByLabel(/Documented Result/).fill("ok");
    await completeDialog.getByRole("button", { name: "Confirm Completion" }).click();
    await expect(
      completeDialog.getByText("Documented result must be at least 3 characters.")
    ).toBeVisible();

    // Fill valid result
    await completeDialog
      .getByLabel(/Documented Result/)
      .fill("MFA token synchronized; mailbox password successfully reset and confirmed.");
    await completeDialog.getByRole("button", { name: "Confirm Completion" }).click();
    await expect(completeDialog).not.toBeVisible();

    await expect(pendingSeedActionCard.locator(".action-badge-completed")).toBeVisible();

    // 10. Attempt Resolution again - should now succeed!
    await statusSelect.selectOption("RESOLVED");
    const confirmStatusDialog2 = page.getByRole("dialog", { name: /Change Status to Resolved/i });
    await expect(confirmStatusDialog2).toBeVisible();
    await confirmStatusDialog2.getByRole("button", { name: "Confirm Status Change" }).click();

    // Status updated to Resolved
    await expect(page.getByText("Ticket status updated to Resolved.")).toBeVisible();
    await expect(page.locator(".status-badge.status-resolved")).toBeVisible();

    // Mutation controls are now hidden (terminal ticket)
    await expect(actionsSection.getByRole("button", { name: "+ Add Action Taken" })).not.toBeVisible();
    await expect(actionsSection.getByRole("button", { name: "Complete Action" })).not.toBeVisible();
    await expect(actionsSection.getByRole("button", { name: "Cancel Action" })).not.toBeVisible();

    // 11. Check responsiveness: no horizontal scroll
    await checkNoHorizontalScroll(page);
  });

  test("Requester views own ticket actions in read-only mode without staff controls", async ({
    page,
  }) => {
    // 1. Log in as Requester (Amina Rahman)
    await loginUser(page, "amina.rahman@toktickit.local");

    // 2. Navigate to requester My Tickets
    await page.goto("/tickets");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

    const viewTicketBtn = page
      .locator("tr, .mobile-ticket-card", { hasText: "Cannot access university email" })
      .filter({ visible: true })
      .getByRole("button", { name: /View Details/i });
    await expect(viewTicketBtn).toBeVisible();
    await viewTicketBtn.click();

    await page.waitForURL(/\/tickets\/\d+/);

    // 3. Verify Actions Taken by IT Staff section
    const actionsHeading = page.getByRole("heading", { name: "Actions Taken by IT Staff" });
    await expect(actionsHeading).toBeVisible();

    // Verify actions and status badges are rendered
    await expect(page.getByText("Checked server exchange logs for blocked IP.")).toBeVisible();
    await expect(page.getByText("COMPLETED").first()).toBeVisible();

    // Verify staff mutation and history controls are completely absent
    await expect(page.getByRole("button", { name: "+ Add Action Taken" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Action" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel Action" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Details" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "View Audit History" })).not.toBeVisible();

    // Check responsiveness: no horizontal scroll
    await checkNoHorizontalScroll(page);
  });
});
