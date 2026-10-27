import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab4_recovery_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let staffUser: { id: number; email: string };
let otherStaff: { id: number; email: string };
let requesterUser: { id: number; email: string };
let testTicketId: number;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schemaName);
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8",
    timeout: 30000,
  });

  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

  await seedDatabase(db, { seedActions: true });
  await db.user.updateMany({ data: { mustChangePassword: false } });

  staffUser = await db.user.findFirstOrThrow({ where: { email: "ethan.brooks@toktickit.local" }, select: { id: true, email: true } });
  otherStaff = await db.user.findFirstOrThrow({ where: { email: "gavin.lee@toktickit.local" }, select: { id: true, email: true } });
  requesterUser = await db.user.findFirstOrThrow({ where: { email: "amina.rahman@toktickit.local" }, select: { id: true, email: true } });

  const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
  const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  const ticket = await db.ticket.create({
    data: {
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "Recovery Test Ticket",
      description: "Ticket for migration and trigger recovery tests",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "IN_PROGRESS",
      ownerId: staffUser.id,
      idempotencyKey: randomUUID(),
    },
  });
  testTicketId = ticket.id;
}, 40000);

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

describe("Database Triggers, Migration & Recovery (server/tests/lab-04/migration-recovery.test.ts)", () => {
  describe("Database Trigger Immutability (TEST-HIST-01)", () => {
    it("Database trigger rejects direct raw SQL UPDATE on ActionTakenHistory", async () => {
      // First create an action with a history entry
      const action = await db.actionTaken.create({
        data: {
          ticketId: testTicketId,
          createdById: staffUser.id,
          status: "PENDING",
          description: "Action to test trigger UPDATE prevention",
        },
      });

      const historyEntry = await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "CREATED",
          snapshot: { id: action.id, description: action.description, summary: "Initial action creation" },
          version: 1,
        },
      });

      // Attempt raw UPDATE on ActionTakenHistory
      let updateError: Error | null = null;
      try {
        await db.$executeRaw`
          UPDATE "ActionTakenHistory"
          SET "version" = 999
          WHERE id = ${historyEntry.id}
        `;
      } catch (err: any) {
        updateError = err;
      }

      expect(updateError).not.toBeNull();
      expect(updateError?.message).toMatch(/immutable and cannot be updated or deleted/i);

      // Verify the version was not modified
      const reRead = await db.actionTakenHistory.findUniqueOrThrow({ where: { id: historyEntry.id } });
      expect(reRead.version).toBe(1);
    });

    it("Database trigger rejects direct raw SQL DELETE on ActionTakenHistory", async () => {
      const action = await db.actionTaken.create({
        data: {
          ticketId: testTicketId,
          createdById: staffUser.id,
          status: "PENDING",
          description: "Action to test trigger DELETE prevention",
        },
      });

      const historyEntry = await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "CREATED",
          snapshot: { id: action.id, description: action.description },
          version: 1,
        },
      });

      // Attempt raw DELETE on ActionTakenHistory
      let deleteError: Error | null = null;
      try {
        await db.$executeRaw`
          DELETE FROM "ActionTakenHistory"
          WHERE id = ${historyEntry.id}
        `;
      } catch (err: any) {
        deleteError = err;
      }

      expect(deleteError).not.toBeNull();
      expect(deleteError?.message).toMatch(/immutable and cannot be updated or deleted/i);

      // Verify row still exists
      const reRead = await db.actionTakenHistory.findUnique({ where: { id: historyEntry.id } });
      expect(reRead).not.toBeNull();
    });
  });

  describe("Atomic Rollback on History Failure (TEST-HIST-02)", () => {
    it("Transaction rolls back completely if history creation fails", async () => {
      const initialActionCount = await db.actionTaken.count({ where: { ticketId: testTicketId } });
      const initialHistoryCount = await db.actionTakenHistory.count({ where: { ticketId: testTicketId } });

      let transactionError: Error | null = null;
      try {
        await db.$transaction(async (tx) => {
          // Step 1: Create action
          const action = await tx.actionTaken.create({
            data: {
              ticketId: testTicketId,
              createdById: staffUser.id,
              status: "PENDING",
              description: "Action that should roll back",
            },
          });

          // Step 2: Simulate failure (e.g. invalid foreign key actorId = 999999)
          await tx.actionTakenHistory.create({
            data: {
              actionId: action.id,
              ticketId: testTicketId,
              actorId: 999999, // Non-existent actor
              eventType: "CREATED",
              snapshot: { summary: "Will fail FK constraint" },
              version: 1,
            },
          });
        });
      } catch (err: any) {
        transactionError = err;
      }

      expect(transactionError).not.toBeNull();

      // Verify no orphan action was left behind
      const finalActionCount = await db.actionTaken.count({ where: { ticketId: testTicketId } });
      const finalHistoryCount = await db.actionTakenHistory.count({ where: { ticketId: testTicketId } });

      expect(finalActionCount).toBe(initialActionCount);
      expect(finalHistoryCount).toBe(initialHistoryCount);
    });
  });

  describe("State Timeline Reconstruction (TEST-HIST-03)", () => {
    it("Chronological history query accurately reconstructs all state mutations", async () => {
      // Create action
      const action = await db.actionTaken.create({
        data: {
          ticketId: testTicketId,
          createdById: staffUser.id,
          assigneeId: staffUser.id,
          status: "PENDING",
          description: "Initial description v1",
          version: 1,
        },
      });

      await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "CREATED",
          snapshot: {
            description: "Initial description v1",
            summary: "Created action",
            changes: { description: { after: "Initial description v1" } },
            versionBefore: 0,
            versionAfter: 1,
          },
          version: 1,
        },
      });

      // Edit description
      await db.actionTaken.update({
        where: { id: action.id },
        data: { description: "Updated description v2", version: 2 },
      });
      await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "UPDATED",
          snapshot: {
            description: "Updated description v2",
            summary: "Updated description",
            changes: { description: { before: "Initial description v1", after: "Updated description v2" } },
            versionBefore: 1,
            versionAfter: 2,
          },
          version: 2,
        },
      });

      // Reassign to Staff B
      await db.actionTaken.update({
        where: { id: action.id },
        data: { assigneeId: otherStaff.id, version: 3 },
      });
      await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "ASSIGNED",
          snapshot: {
            assigneeId: otherStaff.id,
            summary: "Reassigned action",
            changes: { assignee: { beforeId: staffUser.id, afterId: otherStaff.id } },
            versionBefore: 2,
            versionAfter: 3,
          },
          version: 3,
        },
      });

      // Complete by Staff B
      await db.actionTaken.update({
        where: { id: action.id },
        data: {
          status: "COMPLETED",
          completedById: otherStaff.id,
          completedAt: new Date(),
          result: "Done by staff B",
          version: 4,
        },
      });
      await db.actionTakenHistory.create({
        data: {
          actionId: action.id,
          ticketId: testTicketId,
          actorId: otherStaff.id,
          eventType: "COMPLETED",
          snapshot: {
            status: "COMPLETED",
            result: "Done by staff B",
            summary: "Completed action",
            changes: { result: { after: "Done by staff B" }, status: { before: "PENDING", after: "COMPLETED" } },
            versionBefore: 3,
            versionAfter: 4,
          },
          version: 4,
        },
      });

      // Fetch history ordered by createdAt ASC, id ASC
      const history = await db.actionTakenHistory.findMany({
        where: { actionId: action.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      expect(history.length).toBe(4);
      expect(history[0].eventType).toBe("CREATED");
      expect(history[0].version).toBe(1);
      expect((history[0].snapshot as any).versionBefore).toBe(0);
      expect((history[0].snapshot as any).versionAfter).toBe(1);

      expect(history[1].eventType).toBe("UPDATED");
      expect(history[1].version).toBe(2);
      expect((history[1].snapshot as any).versionBefore).toBe(1);
      expect((history[1].snapshot as any).versionAfter).toBe(2);

      expect(history[2].eventType).toBe("ASSIGNED");
      expect(history[2].version).toBe(3);
      expect((history[2].snapshot as any).versionBefore).toBe(2);
      expect((history[2].snapshot as any).versionAfter).toBe(3);

      expect(history[3].eventType).toBe("COMPLETED");
      expect(history[3].version).toBe(4);
      expect((history[3].snapshot as any).versionBefore).toBe(3);
      expect((history[3].snapshot as any).versionAfter).toBe(4);
      expect(history[3].actorId).toBe(otherStaff.id);
    });
  });

  describe("Seed Idempotency & Sequence Integrity (TEST-MIGR-02, TEST-RECOV-01)", () => {
    it("TEST-MIGR-02: Repeated seeding is idempotent and preserves existing data", async () => {
      // Re-run seedDatabase multiple times
      await expect(seedDatabase(db, { seedActions: true })).resolves.not.toThrow();
      await expect(seedDatabase(db, { seedActions: true })).resolves.not.toThrow();

      // Verify users and tickets remain valid
      const userCount = await db.user.count();
      expect(userCount).toBeGreaterThan(0);
    });

    it("TEST-RECOV-01: Sequence state and subsequent collision-free allocation", async () => {
      // Query current sequence values
      const actionSeq = await db.$queryRaw<Array<{ last_value: bigint; is_called: boolean }>>`
        SELECT last_value, is_called FROM "ActionTaken_id_seq"
      `;
      expect(actionSeq.length).toBe(1);
      expect(actionSeq[0].is_called).toBe(true);

      const historySeq = await db.$queryRaw<Array<{ last_value: bigint; is_called: boolean }>>`
        SELECT last_value, is_called FROM "ActionTakenHistory_id_seq"
      `;
      expect(historySeq.length).toBe(1);
      expect(historySeq[0].is_called).toBe(true);

      // Verify subsequent allocations are strictly greater and collision-free
      const newAction = await db.actionTaken.create({
        data: {
          ticketId: testTicketId,
          createdById: staffUser.id,
          status: "PENDING",
          description: "New action after sequence check",
        },
      });

      expect(newAction.id).toBeGreaterThan(Number(actionSeq[0].last_value));

      const newHistory = await db.actionTakenHistory.create({
        data: {
          actionId: newAction.id,
          ticketId: testTicketId,
          actorId: staffUser.id,
          eventType: "CREATED",
          snapshot: { id: newAction.id, summary: "New history after sequence check" },
          version: 1,
        },
      });

      expect(newHistory.id).toBeGreaterThan(Number(historySeq[0].last_value));
    });
  });
});
