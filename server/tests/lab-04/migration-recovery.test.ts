import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";

const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsRoot = join(serverRoot, "prisma", "migrations");
const schemaName = `lab4_recovery_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let staffUser: { id: number; email: string };
let otherStaff: { id: number; email: string };
let requesterUser: { id: number; email: string };
let testTicketId: number;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createTestSession(prisma: PrismaClient, userId: number) {
  const rawToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: tokenHash(rawToken),
      csrfToken,
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  return {
    cookie: `toktickit_session=${rawToken}`,
    csrfToken,
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schemaName);
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8",
    timeout: 30000,
  });

  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  vi.spyOn(prismaModule, "getPrisma").mockImplementation(() => db);

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
          const action = await tx.actionTaken.create({
            data: {
              ticketId: testTicketId,
              createdById: staffUser.id,
              status: "PENDING",
              description: "Action that should roll back",
            },
          });

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

      const finalActionCount = await db.actionTaken.count({ where: { ticketId: testTicketId } });
      const finalHistoryCount = await db.actionTakenHistory.count({ where: { ticketId: testTicketId } });

      expect(finalActionCount).toBe(initialActionCount);
      expect(finalHistoryCount).toBe(initialHistoryCount);
    });
  });

  describe("State Timeline Reconstruction (TEST-HIST-03)", () => {
    it("Exercises actual API service path (create, edit, reassign, complete) and verifies timeline reconstruction", async () => {
      const sessionA = await createTestSession(db, staffUser.id);
      const sessionB = await createTestSession(db, otherStaff.id);

      // Step 1: Create action via API
      const createRes = await request(app)
        .post(`/api/tickets/${testTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          description: "Initial diagnostic scan performed on workstation",
        });

      expect(createRes.status).toBe(201);
      const actionId = createRes.body.data.id;
      expect(createRes.body.data.version).toBe(1);
      expect(createRes.body.data.status).toBe("PENDING");

      // Step 2: Edit description via API
      const editRes = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          description: "Updated diagnostic scan v2 with memory dump analysis",
          version: 1,
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.version).toBe(2);

      // Step 3: Reassign to Staff B via API
      const reassignRes = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          assigneeId: otherStaff.id,
          version: 2,
        });

      expect(reassignRes.status).toBe(200);
      expect(reassignRes.body.data.version).toBe(3);
      expect(reassignRes.body.data.assignee.id).toBe(otherStaff.id);

      // Step 4: Complete action via API by Staff B
      const completeRes = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionB.cookie)
        .set("X-CSRF-Token", sessionB.csrfToken)
        .send({
          status: "COMPLETED",
          result: "Diagnostics clean and memory sticks seated properly",
          version: 3,
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.version).toBe(4);
      expect(completeRes.body.data.status).toBe("COMPLETED");
      expect(completeRes.body.data.completedBy.id).toBe(otherStaff.id);

      // Step 5: Query history endpoint via API
      const historyRes = await request(app)
        .get(`/api/actions/${actionId}/history`)
        .set("Cookie", sessionA.cookie);

      expect(historyRes.status).toBe(200);
      const items = historyRes.body.data.items;
      expect(items.length).toBe(4);

      // Verify event 0: CREATED
      expect(items[0].eventType).toBe("CREATED");
      expect(items[0].versionAfter).toBe(1);
      expect(items[0].versionBefore).toBeNull();
      expect(items[0].actor.id).toBe(staffUser.id);
      expect(items[0].changes.description.after).toBe("Initial diagnostic scan performed on workstation");

      // Verify event 1: UPDATED
      expect(items[1].eventType).toBe("UPDATED");
      expect(items[1].versionAfter).toBe(2);
      expect(items[1].versionBefore).toBe(1);
      expect(items[1].actor.id).toBe(staffUser.id);
      expect(items[1].changes.description).toEqual({
        before: "Initial diagnostic scan performed on workstation",
        after: "Updated diagnostic scan v2 with memory dump analysis",
      });

      // Verify event 2: ASSIGNED
      expect(items[2].eventType).toBe("ASSIGNED");
      expect(items[2].versionAfter).toBe(3);
      expect(items[2].versionBefore).toBe(2);
      expect(items[2].actor.id).toBe(staffUser.id);
      expect(items[2].changes.assignee).toEqual({
        beforeId: null,
        afterId: otherStaff.id,
      });

      // Verify event 3: COMPLETED
      expect(items[3].eventType).toBe("COMPLETED");
      expect(items[3].versionAfter).toBe(4);
      expect(items[3].versionBefore).toBe(3);
      expect(items[3].actor.id).toBe(otherStaff.id);
      expect(items[3].changes.status).toEqual({ before: "PENDING", after: "COMPLETED" });
      expect(items[3].changes.result.after).toBe("Diagnostics clean and memory sticks seated properly");
    });
  });

  describe("Populated Lab 3 to Lab 4 Migration Preservation (TEST-MIGR-01)", () => {
    it("deploys pre-Lab-4 migrations, populates representative Lab 3 records, applies Lab 4 migration, and verifies 100% preservation", async () => {
      const migSchema = `lab4_mig_preserv_${randomUUID().replaceAll("-", "")}`;
      const url = new URL(process.env.DATABASE_URL!);
      url.searchParams.set("schema", migSchema);
      const migSchemaUrl = url.toString();

      const tempRoot = await mkdtemp(join(tmpdir(), "toktickit-lab4-mig-"));
      await mkdir(join(tempRoot, "migrations"), { recursive: true });
      await cp(join(serverRoot, "prisma", "schema.prisma"), join(tempRoot, "schema.prisma"));
      await cp(join(migrationsRoot, "migration_lock.toml"), join(tempRoot, "migrations", "migration_lock.toml"));

      const require = createRequire(import.meta.url);
      const runMigrate = () => {
        execFileSync(process.execPath, [
          require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", join(tempRoot, "schema.prisma"),
        ], {
          cwd: serverRoot,
          env: { ...process.env, DATABASE_URL: migSchemaUrl },
          encoding: "utf8",
          timeout: 60000,
        });
      };

      // 1. Deploy pre-Lab-4 migrations
      const preMigrations = [
        "20260815043555_init_category",
        "20260829153000_lab2_data_foundation",
        "20260831040000_preserve_ticket_number_digits",
        "20260904073000_ticket_creation_receipt",
        "20260916090000_lab3_authentication_foundation",
        "20260916100000_lab3_workflow_discussion_foundation",
      ];
      for (const m of preMigrations) {
        await cp(join(migrationsRoot, m), join(tempRoot, "migrations", m), { recursive: true });
      }
      runMigrate();

      const migDb = new PrismaClient({ datasources: { db: { url: migSchemaUrl } } });
      await migDb.$connect();

      try {
        // 2. Populate representative legacy Lab 3 records
        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."User" ("id", "email", "normalizedEmail", "name", "passwordHash", "role", "department", "isActive", "mustChangePassword", "createdAt", "updatedAt")
          VALUES
            (101, 'requester.legacy@test.local', 'requester.legacy@test.local', 'Legacy Requester', 'hash1', 'REQUESTER', 'Finance', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (102, 'staff.legacy@test.local', 'staff.legacy@test.local', 'Legacy Staff', 'hash2', 'IT_STAFF', 'IT Support', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."Category" ("id", "name", "isActive", "createdAt", "updatedAt")
          VALUES (201, 'Hardware Incident', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."RelatedSystem" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
          VALUES (201, 'Dell Laptops', 'Laptop hardware support', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."Ticket" (
            "id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId",
            "summary", "description", "requestedPriority", "itPriority", "currentStatus",
            "ownerId", "idempotencyKey", "createdAt", "updatedAt",
            "requesterResolutionIndicatedAt", "requesterResolutionIndicatedById"
          )
          VALUES
            (301, 'TKT-2026-00301', 101, 201, 201, 'Legacy Open Ticket', 'Testing open preservation', 'HIGH', 'HIGH', 'OPEN', 102, 'idemp-leg-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL),
            (302, 'TKT-2026-00302', 101, 201, 201, 'Legacy Resolved Ticket', 'Testing resolved preservation', 'MEDIUM', 'MEDIUM', 'RESOLVED', 102, 'idemp-leg-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 101)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."PublicComment" ("id", "ticketId", "authorId", "content", "createdAt")
          VALUES (401, 301, 101, 'Legacy public comment text', CURRENT_TIMESTAMP)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."InternalNote" ("id", "ticketId", "authorId", "content", "createdAt")
          VALUES (402, 301, 102, 'Legacy internal note text', CURRENT_TIMESTAMP)
        `);

        await migDb.$executeRawUnsafe(`
          INSERT INTO "${migSchema}"."Attachment" ("id", "ticketId", "originalName", "storedName", "mimeType", "sizeBytes", "isRemoved", "createdAt")
          VALUES (403, 301, 'legacy.log', 'stored-legacy.log', 'text/plain', 1234, false, CURRENT_TIMESTAMP)
        `);

        // Adjust sequences past max IDs
        await migDb.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${migSchema}"."User"', 'id'), 150, true)`);
        await migDb.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${migSchema}"."Ticket"', 'id'), 350, true)`);

        // 3. Deploy Lab 4 migration
        await cp(join(migrationsRoot, "20261027120000_lab4_actions_workflow"), join(tempRoot, "migrations", "20261027120000_lab4_actions_workflow"), { recursive: true });
        runMigrate();

        // 4. Verify 100% preservation of legacy rows and relationships
        const users = await migDb.user.findMany({ where: { id: { in: [101, 102] } }, orderBy: { id: "asc" } });
        expect(users.length).toBe(2);
        expect(users[0].email).toBe("requester.legacy@test.local");
        expect(users[1].email).toBe("staff.legacy@test.local");

        const tickets = await migDb.ticket.findMany({
          where: { id: { in: [301, 302] } },
          include: {
            requester: true,
            owner: true,
            publicComments: true,
            internalNotes: true,
            attachments: true,
            actionsTaken: true,
          },
          orderBy: { id: "asc" },
        });
        expect(tickets.length).toBe(2);
        expect(tickets[0].summary).toBe("Legacy Open Ticket");
        expect(tickets[0].owner?.name).toBe("Legacy Staff");
        expect(tickets[0].publicComments[0].content).toBe("Legacy public comment text");
        expect(tickets[0].internalNotes[0].content).toBe("Legacy internal note text");
        expect(tickets[0].attachments[0].originalName).toBe("legacy.log");
        expect(tickets[0].actionsTaken).toEqual([]); // New relation cleanly empty for legacy ticket

        expect(tickets[1].currentStatus).toBe("RESOLVED");
        expect(tickets[1].requesterResolutionIndicatedAt).not.toBeNull();

        // 5. Verify new Lab 4 capability: add an ActionTaken to the preserved ticket
        const newAction = await migDb.actionTaken.create({
          data: {
            ticketId: 301,
            createdById: 102,
            assigneeId: 102,
            status: "PENDING",
            description: "Post-migration action on legacy ticket",
          },
        });
        expect(newAction.id).toBeGreaterThan(0);
        expect(newAction.ticketId).toBe(301);

        // Verify trigger is installed and enforces immutability
        const newHistory = await migDb.actionTakenHistory.create({
          data: {
            actionId: newAction.id,
            ticketId: 301,
            actorId: 102,
            eventType: "CREATED",
            version: 1,
            snapshot: { changes: {} },
          },
        });

        let triggerRejected = false;
        try {
          await migDb.$executeRawUnsafe(`DELETE FROM "${migSchema}"."ActionTakenHistory" WHERE id = ${newHistory.id}`);
        } catch {
          triggerRejected = true;
        }
        expect(triggerRejected).toBe(true);
      } finally {
        await migDb.$disconnect();
        await rm(tempRoot, { recursive: true, force: true });
        await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${migSchema}" CASCADE`);
      }
    }, 60000);
  });

  describe("Seed Idempotency & Sequence Integrity (TEST-MIGR-02, TEST-MIGR-03)", () => {
    it("TEST-MIGR-02: Repeated seeding is idempotent and preserves exact Action and history counts", async () => {
      const initialActions = await db.actionTaken.count();
      const initialHistory = await db.actionTakenHistory.count();

      // Re-run seedDatabase multiple times
      await seedDatabase(db, { seedActions: true });
      await seedDatabase(db, { seedActions: true });

      const finalActions = await db.actionTaken.count();
      const finalHistory = await db.actionTakenHistory.count();

      expect(finalActions).toBe(initialActions);
      expect(finalHistory).toBe(initialHistory);
    });

    it("TEST-MIGR-03: Sequence state and subsequent collision-free allocation", async () => {
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

  describe("Genuine Database Backup & Restore Rehearsal (TEST-RECOV-01)", () => {
    it("performs actual pg_dump and pg_restore into separate disposable database, verifying 100% row counts, FKs, sequences, collision-free allocations, and trigger immutability", async () => {
      const runId = randomUUID().replaceAll("-", "").slice(0, 10);
      const srcDbName = `toktickit_recov_src_${runId}`;
      const dstDbName = `toktickit_recov_dst_${runId}`;
      const dumpFile = `/tmp/toktickit_recov_${runId}.dump`;

      const createdDatabases: string[] = [];
      let dumpFileCreated = false;

      const execDocker = (args: string[]) => {
        return execFileSync("docker", ["exec", "toktickit-db", ...args], {
          encoding: "utf8",
          timeout: 30000,
        });
      };

      let srcPrisma: PrismaClient | null = null;
      let dstPrisma: PrismaClient | null = null;

      try {
        // 1. Create uniquely named disposable source database
        execDocker(["psql", "-U", "toktickit", "-d", "postgres", "-c", `CREATE DATABASE "${srcDbName}";`]);
        createdDatabases.push(srcDbName);

        const srcUrl = new URL(process.env.DATABASE_URL!);
        srcUrl.pathname = `/${srcDbName}`;
        srcUrl.searchParams.delete("schema");

        // 2. Deploy all Prisma migrations on source database
        execFileSync(
          process.execPath,
          [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"],
          {
            cwd: serverRoot,
            env: { ...process.env, DATABASE_URL: srcUrl.toString() },
            encoding: "utf8",
            timeout: 30000,
          }
        );

        srcPrisma = new PrismaClient({ datasources: { db: { url: srcUrl.toString() } } });
        await srcPrisma.$connect();

        // Confirm Prisma and Docker target the same local PostgreSQL cluster instance
        const dockerSystemId = execDocker([
          "psql", "-U", "toktickit", "-d", "postgres", "-t", "-A", "-c",
          "SELECT system_identifier FROM pg_control_system();",
        ]).trim();

        const [prismaControl] = await srcPrisma.$queryRawUnsafe<Array<{ system_identifier: string | bigint }>>(
          "SELECT system_identifier::text FROM pg_control_system();"
        );
        expect(String(prismaControl.system_identifier)).toBe(dockerSystemId);

        // 3. Populate representative Lab 4 data
        await seedDatabase(srcPrisma, { seedActions: true });

        // Add additional representative action, history, and attachment records
        const extraTicket = await srcPrisma.ticket.findFirstOrThrow({ where: { currentStatus: "IN_PROGRESS" } });
        const staff = await srcPrisma.user.findFirstOrThrow({ where: { role: "IT_STAFF", isActive: true } });

        const extraAction = await srcPrisma.actionTaken.create({
          data: {
            ticketId: extraTicket.id,
            createdById: staff.id,
            assigneeId: staff.id,
            status: "PENDING",
            description: "Rehearsal verification action for disaster recovery test",
          },
        });

        const extraHistory = await srcPrisma.actionTakenHistory.create({
          data: {
            actionId: extraAction.id,
            ticketId: extraTicket.id,
            actorId: staff.id,
            eventType: "CREATED",
            version: 1,
            snapshot: { summary: "Created in source DB before backup" },
          },
        });

        const extraAttachment = await srcPrisma.attachment.create({
          data: {
            ticketId: extraTicket.id,
            originalName: "system_diagnostic_report.pdf",
            storedName: `diag-recovery-${runId}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: 1048576,
            isRemoved: false,
          },
        });

        // Retain source values for deep comparison after restoration
        const sourceTicketValues = {
          id: extraTicket.id,
          summary: extraTicket.summary,
          description: extraTicket.description,
          requesterId: extraTicket.requesterId,
          ownerId: extraTicket.ownerId,
          currentStatus: extraTicket.currentStatus,
        };

        const sourceActionValues = {
          id: extraAction.id,
          ticketId: extraAction.ticketId,
          createdById: extraAction.createdById,
          description: extraAction.description,
          status: extraAction.status,
        };

        const sourceHistoryValues = {
          id: extraHistory.id,
          actionId: extraHistory.actionId,
          ticketId: extraHistory.ticketId,
          actorId: extraHistory.actorId,
          eventType: extraHistory.eventType,
          version: extraHistory.version,
          snapshot: extraHistory.snapshot,
        };

        const sourceAttachmentValues = {
          id: extraAttachment.id,
          ticketId: extraAttachment.ticketId,
          originalName: extraAttachment.originalName,
          storedName: extraAttachment.storedName,
          mimeType: extraAttachment.mimeType,
          sizeBytes: extraAttachment.sizeBytes,
          isRemoved: extraAttachment.isRemoved,
        };

        // Introduce intentional sequence gaps to verify collision-free allocation
        await srcPrisma.$executeRawUnsafe(`SELECT setval('"ActionTaken_id_seq"', 500, true);`);
        await srcPrisma.$executeRawUnsafe(`SELECT setval('"ActionTakenHistory_id_seq"', 600, true);`);

        // 4. Record pre-dump source invariants
        const srcCounts = {
          users: await srcPrisma.user.count(),
          categories: await srcPrisma.category.count(),
          relatedSystems: await srcPrisma.relatedSystem.count(),
          tickets: await srcPrisma.ticket.count(),
          attachments: await srcPrisma.attachment.count(),
          publicComments: await srcPrisma.publicComment.count(),
          internalNotes: await srcPrisma.internalNote.count(),
          actionsTaken: await srcPrisma.actionTaken.count(),
          actionTakenHistory: await srcPrisma.actionTakenHistory.count(),
        };

        const seqRows = await srcPrisma.$queryRawUnsafe<Array<{ sequence_name: string }>>(
          `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY sequence_name;`
        );
        const sequenceNames = seqRows.map((r) => r.sequence_name);

        const srcSequences = new Map<string, { last_value: string; is_called: boolean }>();
        for (const seq of sequenceNames) {
          const [row] = await srcPrisma.$queryRawUnsafe<Array<{ last_value: bigint | number | string; is_called: boolean }>>(
            `SELECT last_value::text, is_called FROM "${seq}"`
          );
          srcSequences.set(seq, { last_value: String(row.last_value), is_called: row.is_called });
        }

        console.log("[TEST-RECOV-01] ACTUAL_ROW_COUNTS:" + JSON.stringify(srcCounts));
        console.log("[TEST-RECOV-01] ACTUAL_SEQUENCES:" + JSON.stringify(Object.fromEntries(srcSequences)));

        // 5. Perform genuine custom-format pg_dump
        execDocker(["pg_dump", "-U", "toktickit", "-d", srcDbName, "-Fc", "-f", dumpFile]);
        dumpFileCreated = true;

        // 6. Create uniquely named disposable target database
        execDocker(["psql", "-U", "toktickit", "-d", "postgres", "-c", `CREATE DATABASE "${dstDbName}";`]);
        createdDatabases.push(dstDbName);

        // 7. Perform genuine pg_restore into separate target database
        execDocker(["pg_restore", "-U", "toktickit", "-d", dstDbName, dumpFile]);

        // 8. Connect to target database
        const dstUrl = new URL(process.env.DATABASE_URL!);
        dstUrl.pathname = `/${dstDbName}`;
        dstUrl.searchParams.delete("schema");

        dstPrisma = new PrismaClient({ datasources: { db: { url: dstUrl.toString() } } });
        await dstPrisma.$connect();

        // 9. Verify Table Row Counts match 100% across all relations
        const dstCounts = {
          users: await dstPrisma.user.count(),
          categories: await dstPrisma.category.count(),
          relatedSystems: await dstPrisma.relatedSystem.count(),
          tickets: await dstPrisma.ticket.count(),
          attachments: await dstPrisma.attachment.count(),
          publicComments: await dstPrisma.publicComment.count(),
          internalNotes: await dstPrisma.internalNote.count(),
          actionsTaken: await dstPrisma.actionTaken.count(),
          actionTakenHistory: await dstPrisma.actionTakenHistory.count(),
        };
        expect(dstCounts).toEqual(srcCounts);
        expect(dstCounts.tickets).toBeGreaterThan(0);
        expect(dstCounts.attachments).toBeGreaterThan(0);
        expect(dstCounts.actionsTaken).toBeGreaterThan(0);
        expect(dstCounts.actionTakenHistory).toBeGreaterThan(0);

        // 10. Verify Restored Data and IDs Preserved with Valid FK Relationships
        const restoredTicket = await dstPrisma.ticket.findUniqueOrThrow({
          where: { id: sourceTicketValues.id },
          include: { requester: true, owner: true, actionsTaken: true, attachments: true },
        });
        expect(restoredTicket.id).toBe(sourceTicketValues.id);
        expect(restoredTicket.summary).toBe(sourceTicketValues.summary);
        expect(restoredTicket.description).toBe(sourceTicketValues.description);
        expect(restoredTicket.requesterId).toBe(sourceTicketValues.requesterId);
        expect(restoredTicket.ownerId).toBe(sourceTicketValues.ownerId);
        expect(restoredTicket.currentStatus).toBe(sourceTicketValues.currentStatus);
        expect(restoredTicket.requester.id).toBe(sourceTicketValues.requesterId);
        expect(restoredTicket.owner?.id).toBe(sourceTicketValues.ownerId);

        const restoredAction = await dstPrisma.actionTaken.findUniqueOrThrow({
          where: { id: sourceActionValues.id },
          include: { ticket: true, createdBy: true, history: true },
        });
        expect(restoredAction.id).toBe(sourceActionValues.id);
        expect(restoredAction.description).toBe(sourceActionValues.description);
        expect(restoredAction.ticketId).toBe(sourceTicketValues.id);
        expect(restoredAction.createdById).toBe(staff.id);
        expect(restoredAction.ticket.id).toBe(sourceTicketValues.id);
        expect(restoredAction.createdBy.id).toBe(staff.id);

        const restoredHistory = await dstPrisma.actionTakenHistory.findUniqueOrThrow({
          where: { id: sourceHistoryValues.id },
          include: { action: true, ticket: true, actor: true },
        });
        expect(restoredHistory.id).toBe(sourceHistoryValues.id);
        expect(restoredHistory.actionId).toBe(sourceHistoryValues.actionId);
        expect(restoredHistory.ticketId).toBe(sourceHistoryValues.ticketId);
        expect(restoredHistory.actorId).toBe(sourceHistoryValues.actorId);
        expect(restoredHistory.eventType).toBe(sourceHistoryValues.eventType);
        expect(restoredHistory.version).toBe(sourceHistoryValues.version);
        expect(restoredHistory.snapshot).toEqual(sourceHistoryValues.snapshot);
        expect(restoredHistory.action.id).toBe(sourceActionValues.id);
        expect(restoredHistory.ticket.id).toBe(sourceTicketValues.id);
        expect(restoredHistory.actor.id).toBe(staff.id);

        const restoredAttachment = await dstPrisma.attachment.findUniqueOrThrow({
          where: { id: sourceAttachmentValues.id },
          include: { ticket: true },
        });
        expect(restoredAttachment.id).toBe(sourceAttachmentValues.id);
        expect(restoredAttachment.ticketId).toBe(sourceAttachmentValues.ticketId);
        expect(restoredAttachment.originalName).toBe(sourceAttachmentValues.originalName);
        expect(restoredAttachment.storedName).toBe(sourceAttachmentValues.storedName);
        expect(restoredAttachment.mimeType).toBe(sourceAttachmentValues.mimeType);
        expect(restoredAttachment.sizeBytes).toBe(sourceAttachmentValues.sizeBytes);
        expect(restoredAttachment.isRemoved).toBe(sourceAttachmentValues.isRemoved);
        expect(restoredAttachment.ticket.id).toBe(sourceTicketValues.id);

        // 11. Verify Sequence States Match (last_value and is_called) before subsequent allocations
        for (const seq of sequenceNames) {
          const [row] = await dstPrisma.$queryRawUnsafe<Array<{ last_value: bigint | number | string; is_called: boolean }>>(
            `SELECT last_value::text, is_called FROM "${seq}"`
          );
          const srcSeq = srcSequences.get(seq)!;
          expect({ seq, last_value: String(row.last_value), is_called: row.is_called }).toEqual({
            seq,
            last_value: srcSeq.last_value,
            is_called: srcSeq.is_called,
          });
        }

        // 12. Verify Collision-Free Subsequent Allocations (advancing cleanly from gap)
        const postRestoreAction = await dstPrisma.actionTaken.create({
          data: {
            ticketId: extraTicket.id,
            createdById: staff.id,
            assigneeId: staff.id,
            status: "PENDING",
            description: "Post-restore allocation test advancing from sequence gap",
          },
        });
        expect(postRestoreAction.id).toBe(501);

        const postRestoreHistory = await dstPrisma.actionTakenHistory.create({
          data: {
            actionId: postRestoreAction.id,
            ticketId: extraTicket.id,
            actorId: staff.id,
            eventType: "CREATED",
            version: 1,
            snapshot: { summary: "Created post-restore" },
          },
        });
        expect(postRestoreHistory.id).toBe(601);

        // 13. Verify Restored History Triggers Continue to Reject Direct UPDATE and DELETE
        let updateError: Error | null = null;
        try {
          await dstPrisma.$executeRawUnsafe(
            `UPDATE "ActionTakenHistory" SET "version" = 999 WHERE id = ${postRestoreHistory.id}`
          );
        } catch (err: any) {
          updateError = err;
        }
        expect(updateError).not.toBeNull();
        expect(updateError?.message).toMatch(/immutable and cannot be updated or deleted/i);

        let deleteError: Error | null = null;
        try {
          await dstPrisma.$executeRawUnsafe(
            `DELETE FROM "ActionTakenHistory" WHERE id = ${postRestoreHistory.id}`
          );
        } catch (err: any) {
          deleteError = err;
        }
        expect(deleteError).not.toBeNull();
        expect(deleteError?.message).toMatch(/immutable and cannot be updated or deleted/i);
      } finally {
        // 14. Clean up disposable databases and dump file with strict error tracking
        const cleanupErrors: string[] = [];

        if (srcPrisma) {
          try {
            await srcPrisma.$disconnect();
          } catch (err: any) {
            cleanupErrors.push(`srcPrisma disconnect error: ${err.message}`);
          }
        }
        if (dstPrisma) {
          try {
            await dstPrisma.$disconnect();
          } catch (err: any) {
            cleanupErrors.push(`dstPrisma disconnect error: ${err.message}`);
          }
        }

        if (dumpFileCreated) {
          try {
            execDocker(["rm", "-f", dumpFile]);
          } catch (err: any) {
            cleanupErrors.push(`dump file removal error: ${err.message}`);
          }
        }

        for (const dbName of createdDatabases) {
          try {
            execDocker([
              "psql", "-U", "toktickit", "-d", "postgres", "-c",
              `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
            ]);
            execDocker(["psql", "-U", "toktickit", "-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${dbName}";`]);
          } catch (err: any) {
            cleanupErrors.push(`DROP DATABASE ${dbName} error: ${err.message}`);
          }
        }

        // Verify databases are gone
        try {
          const remainingDbs = execDocker([
            "psql", "-U", "toktickit", "-d", "postgres", "-t", "-A", "-c",
            "SELECT datname FROM pg_database;",
          ]).trim().split(/\r?\n/).map((s) => s.trim());
          for (const dbName of createdDatabases) {
            if (remainingDbs.includes(dbName)) {
              cleanupErrors.push(`Database ${dbName} still exists in pg_database after cleanup.`);
            }
          }
        } catch (err: any) {
          cleanupErrors.push(`Verification of database cleanup error: ${err.message}`);
        }

        // Verify dump file is gone
        if (dumpFileCreated) {
          try {
            const dumpCheck = execDocker([
              "sh", "-c", `if [ -f "${dumpFile}" ]; then echo "EXISTS"; else echo "GONE"; fi`,
            ]).trim();
            if (dumpCheck !== "GONE") {
              cleanupErrors.push(`Dump file ${dumpFile} still exists after cleanup.`);
            }
          } catch (err: any) {
            cleanupErrors.push(`Verification of dump file cleanup error: ${err.message}`);
          }
        }

        if (cleanupErrors.length > 0) {
          throw new Error(`TEST-RECOV-01 cleanup verification failed:\n${cleanupErrors.join("\n")}`);
        }
      }
    }, 90000);
  });
});
