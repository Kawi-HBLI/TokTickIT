import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab4_workflow_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let staffUser: { id: number; email: string };
let otherStaff: { id: number; email: string };
let requesterUser: { id: number; email: string };

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
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
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
}, 40000);

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

describe("Ticket Workflow & Resolution Gate (server/tests/lab-04/ticket-workflow.api.test.ts)", () => {
  async function createHelperTicket(params: {
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELLED" | "REOPENED";
    ownerId?: number | null;
  }) {
    const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
    const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    return db.ticket.create({
      data: {
        requesterId: requesterUser.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: `Test Ticket ${randomUUID()}`,
        description: "Test description for ticket workflow",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: params.status ?? "IN_PROGRESS",
        ownerId: params.ownerId !== undefined ? params.ownerId : staffUser.id,
        idempotencyKey: randomUUID(),
      },
    });
  }

  describe("Resolution Gate Enforcement (TEST-RES-01 to TEST-RES-04)", () => {
    it("TEST-RES-01: Successfully transitions to RESOLVED when owner assigned, 1+ completed action, and 0 pending actions", async () => {
      const session = await createTestSession(db, staffUser.id);
      const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffUser.id });

      // Add completed action
      await db.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: staffUser.id,
          assigneeId: staffUser.id,
          status: "COMPLETED",
          completedById: staffUser.id,
          completedAt: new Date(),
          description: "Configured VPN client",
          result: "Verified connection established successfully",
        },
      });

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "RESOLVED",
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStatus).toBe("RESOLVED");
      expect(res.body.data.previousStatus).toBe("IN_PROGRESS");
    });

    it("TEST-RES-02: Rejects transition to RESOLVED when ownerId is null (422 RESOLUTION_GATE_NO_OWNER)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: null });

      // Add completed action
      await db.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: staffUser.id,
          status: "COMPLETED",
          completedById: staffUser.id,
          completedAt: new Date(),
          description: "Action done but ticket has no owner",
          result: "Everything verified",
        },
      });

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "RESOLVED",
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("RESOLUTION_GATE_NO_OWNER");
    });

    it("TEST-RES-03: Rejects transition to RESOLVED when 0 completed actions exist (422 RESOLUTION_GATE_NO_COMPLETED_ACTION)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffUser.id });

      // No actions added to ticket
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "RESOLVED",
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("RESOLUTION_GATE_NO_COMPLETED_ACTION");
    });

    it("TEST-RES-04: Rejects transition to RESOLVED when pending actions remain (422 RESOLUTION_GATE_PENDING_ACTIONS)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffUser.id });

      // Add 1 completed action
      await db.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: staffUser.id,
          status: "COMPLETED",
          completedById: staffUser.id,
          completedAt: new Date(),
          description: "Step 1 completed",
          result: "Done successfully",
        },
      });

      // Add 1 pending action
      await db.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: staffUser.id,
          status: "PENDING",
          description: "Step 2 still waiting",
        },
      });

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "RESOLVED",
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("RESOLUTION_GATE_PENDING_ACTIONS");
    });
  });

  describe("Terminal State Immutability & Reopening (TEST-RES-05, TEST-RES-06)", () => {
    it("TEST-RES-05: Rejects creating an Action Taken on RESOLVED or CLOSED tickets (422 TICKET_TERMINAL_IMMUTABLE)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const resolvedTicket = await createHelperTicket({ status: "RESOLVED", ownerId: staffUser.id });
      const closedTicket = await createHelperTicket({ status: "CLOSED", ownerId: staffUser.id });

      const resResolved = await request(app)
        .post(`/api/tickets/${resolvedTicket.id}/actions`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({ description: "Cannot create on resolved ticket" });

      expect(resResolved.status).toBe(422);
      expect(resResolved.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");

      const resClosed = await request(app)
        .post(`/api/tickets/${closedTicket.id}/actions`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({ description: "Cannot create on closed ticket" });

      expect(resClosed.status).toBe(422);
      expect(resClosed.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");
    });

    it("TEST-RES-06: Reopening a RESOLVED or CLOSED ticket to REOPENED succeeds; subsequent action creation succeeds", async () => {
      const session = await createTestSession(db, staffUser.id);
      const resolvedTicket = await createHelperTicket({ status: "RESOLVED", ownerId: staffUser.id });

      // Reopen ticket
      const reopenRes = await request(app)
        .patch(`/api/staff/tickets/${resolvedTicket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "REOPENED",
          expectedUpdatedAt: resolvedTicket.updatedAt.toISOString(),
        });

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.data.currentStatus).toBe("REOPENED");

      // Now create action on REOPENED ticket
      const actionRes = await request(app)
        .post(`/api/tickets/${resolvedTicket.id}/actions`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({ description: "Investigating reopened issue" });

      expect(actionRes.status).toBe(201);
      expect(actionRes.body.data.status).toBe("PENDING");
    });
  });

  describe("Status Transition Matrix & Concurrency (TEST-RES-07 to TEST-RES-10)", () => {
    it("TEST-RES-07: Transition from CANCELLED to REOPENED or any other status is prohibited (409 INVALID_STATUS_TRANSITION)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const cancelledTicket = await createHelperTicket({ status: "CANCELLED", ownerId: null });

      const res = await request(app)
        .patch(`/api/staff/tickets/${cancelledTicket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "REOPENED",
          expectedUpdatedAt: cancelledTicket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("TEST-RES-08: Active-to-CLOSED shortcut (OPEN -> CLOSED) is prohibited (409 INVALID_STATUS_TRANSITION)", async () => {
      const session = await createTestSession(db, staffUser.id);
      const openTicket = await createHelperTicket({ status: "OPEN", ownerId: staffUser.id });

      const res = await request(app)
        .patch(`/api/staff/tickets/${openTicket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "CLOSED",
          expectedUpdatedAt: openTicket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("Same-status transition (CLOSED -> CLOSED) returns 409 INVALID_STATUS_TRANSITION", async () => {
      const session = await createTestSession(db, staffUser.id);
      const closedTicket = await createHelperTicket({ status: "CLOSED", ownerId: staffUser.id });

      const res = await request(app)
        .patch(`/api/staff/tickets/${closedTicket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "CLOSED",
          expectedUpdatedAt: closedTicket.updatedAt.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("TEST-RES-09: Stale expectedUpdatedAt returns 409 TICKET_VERSION_CONFLICT", async () => {
      const session = await createTestSession(db, staffUser.id);
      const ticket = await createHelperTicket({ status: "OPEN", ownerId: staffUser.id });

      const staleDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();

      const res = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send({
          status: "IN_PROGRESS",
          expectedUpdatedAt: staleDate,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TICKET_VERSION_CONFLICT");
    });

    it("TEST-RES-10: Legacy ticket query: retrieving existing resolved/closed tickets from Lab 3 succeeds without backfilled actions", async () => {
      const session = await createTestSession(db, staffUser.id);
      const legacyResolved = await createHelperTicket({ status: "RESOLVED", ownerId: staffUser.id });

      const res = await request(app)
        .get(`/api/staff/tickets/${legacyResolved.id}`)
        .set("Cookie", session.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(legacyResolved.id);
      expect(res.body.data.currentStatus).toBe("RESOLVED");

      // Verify actions list for legacy ticket returns empty array
      const actionsRes = await request(app)
        .get(`/api/tickets/${legacyResolved.id}/actions`)
        .set("Cookie", session.cookie);

      expect(actionsRes.status).toBe(200);
      expect(actionsRes.body.data.items).toEqual([]);
      expect(actionsRes.body.data.total).toBe(0);
    });
  });
});
