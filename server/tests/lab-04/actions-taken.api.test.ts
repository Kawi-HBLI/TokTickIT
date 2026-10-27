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

const schemaName = `lab4_actions_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let requesterUser: { id: number; email: string };
let otherRequester: { id: number; email: string };
let staffA: { id: number; email: string };
let staffB: { id: number; email: string };
let adminUser: { id: number; email: string };
let inactiveStaff: { id: number; email: string };

let openTicketId: number;
let inProgressTicketId: number;
let resolvedTicketId: number;
let cancelledTicketId: number;

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

  requesterUser = await db.user.findFirstOrThrow({ where: { email: "amina.rahman@toktickit.local" }, select: { id: true, email: true } });
  otherRequester = await db.user.findFirstOrThrow({ where: { email: "ben.carter@toktickit.local" }, select: { id: true, email: true } });
  staffA = await db.user.findFirstOrThrow({ where: { email: "ethan.brooks@toktickit.local" }, select: { id: true, email: true } });
  staffB = await db.user.findFirstOrThrow({ where: { email: "gavin.lee@toktickit.local" }, select: { id: true, email: true } });
  adminUser = await db.user.findFirstOrThrow({ where: { email: "harper.morgan@toktickit.local" }, select: { id: true, email: true } });
  inactiveStaff = await db.user.findFirstOrThrow({ where: { email: "inactive.staff@toktickit.local" }, select: { id: true, email: true } });

  const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
  const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  // Create isolated tickets for test scenarios
  const tOpen = await db.ticket.create({
    data: {
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "Open Ticket for Actions Test",
      description: "Detailed description",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "OPEN",
      ownerId: staffA.id,
      idempotencyKey: randomUUID(),
    },
  });
  openTicketId = tOpen.id;

  const tInProgress = await db.ticket.create({
    data: {
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "In Progress Ticket",
      description: "Detailed description",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      ownerId: staffA.id,
      idempotencyKey: randomUUID(),
    },
  });
  inProgressTicketId = tInProgress.id;

  const tResolved = await db.ticket.create({
    data: {
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "Resolved Terminal Ticket",
      description: "Detailed description",
      requestedPriority: "LOW",
      itPriority: "LOW",
      currentStatus: "RESOLVED",
      ownerId: staffA.id,
      idempotencyKey: randomUUID(),
    },
  });
  resolvedTicketId = tResolved.id;

  const tCancelled = await db.ticket.create({
    data: {
      requesterId: requesterUser.id,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: "Cancelled Terminal Ticket",
      description: "Detailed description",
      requestedPriority: "LOW",
      itPriority: "LOW",
      currentStatus: "CANCELLED",
      idempotencyKey: randomUUID(),
    },
  });
  cancelledTicketId = tCancelled.id;
}, 40000);

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

describe("Actions Taken API (server/tests/lab-04/actions-taken.api.test.ts)", () => {
  describe("Role Authorization & Visibility (TEST-ACT-13, TEST-ACT-14)", () => {
    it("Requester can view actions on own ticket in read-only format", async () => {
      // Create an action first as staff
      const staffSession = await createTestSession(db, staffA.id);
      await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Investigated network connectivity" });

      const reqSession = await createTestSession(db, requesterUser.id);
      const res = await request(app)
        .get(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", reqSession.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.ticketId).toBe(openTicketId);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].description).toBe("Investigated network connectivity");
    });

    it("Requester receives identical safe 404 when querying ticket owned by someone else or non-existent", async () => {
      const otherReqSession = await createTestSession(db, otherRequester.id);
      const resOther = await request(app)
        .get(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", otherReqSession.cookie);

      const resNonExistent = await request(app)
        .get("/api/tickets/999999/actions")
        .set("Cookie", otherReqSession.cookie);

      expect(resOther.status).toBe(404);
      expect(resOther.body.error.code).toBe("TICKET_NOT_FOUND");
      expect(resNonExistent.status).toBe(404);
      expect(resNonExistent.body.error.code).toBe("TICKET_NOT_FOUND");
      expect(resOther.body).toEqual(resNonExistent.body);
    });

    it("Requester is forbidden from creating actions (403 FORBIDDEN)", async () => {
      const reqSession = await createTestSession(db, requesterUser.id);
      const res = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", reqSession.cookie)
        .set("X-CSRF-Token", reqSession.csrfToken)
        .send({ description: "Requester unauthorized action" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("Requester is forbidden from editing actions or viewing history", async () => {
      const reqSession = await createTestSession(db, requesterUser.id);
      const patchRes = await request(app)
        .patch("/api/actions/1")
        .set("Cookie", reqSession.cookie)
        .set("X-CSRF-Token", reqSession.csrfToken)
        .send({ description: "Unauthorized edit", version: 1 });
      expect(patchRes.status).toBe(403);

      const historyRes = await request(app)
        .get("/api/actions/1/history")
        .set("Cookie", reqSession.cookie);
      expect(historyRes.status).toBe(403);
    });

    it("Unauthenticated request is rejected (401 AUTHENTICATION_REQUIRED)", async () => {
      const res = await request(app).get(`/api/tickets/${openTicketId}/actions`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("Missing or invalid CSRF token is rejected (403 CSRF_INVALID)", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const res = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", "invalid-token")
        .send({ description: "CSRF test action" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CSRF_INVALID");
    });
  });

  describe("Action Creation & Validation (TEST-ACT-01 to TEST-ACT-06, TEST-ACT-15)", () => {
    it("IT Staff creates Action Taken with initial PENDING status and CREATED history", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const res = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({
          description: "Cleaned dusty fan and applied thermal paste",
          assigneeId: staffA.id,
          followUpRequired: true,
          followUpNote: "Check thermal sensors tomorrow",
          attachmentNotes: "thermal-benchmarks.png",
        });

      expect(res.status).toBe(201);
      expect(res.headers.location).toMatch(/^\/api\/actions\/\d+$/);
      const action = res.body.data;
      expect(action.status).toBe("PENDING");
      expect(action.version).toBe(1);
      expect(action.createdBy.id).toBe(staffA.id);
      expect(action.assignee.id).toBe(staffA.id);
      expect(action.followUpRequired).toBe(true);
      expect(action.followUpNote).toBe("Check thermal sensors tomorrow");

      // Verify history entry
      const historyRes = await request(app)
        .get(`/api/actions/${action.id}/history`)
        .set("Cookie", staffSession.cookie);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.total).toBe(1);
      expect(historyRes.body.data.items[0].eventType).toBe("CREATED");
      expect(historyRes.body.data.items[0].actor.id).toBe(staffA.id);
    });

    it("Enforces description length of 5–2,000 characters (positive & negative boundaries)", async () => {
      const staffSession = await createTestSession(db, staffA.id);

      // Negative boundary: 4 characters
      const resShort = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "1234" });
      expect(resShort.status).toBe(400);
      expect(resShort.body.error.code).toBe("VALIDATION_ERROR");

      // Negative boundary: 2,001 characters
      const resLong = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "a".repeat(2001) });
      expect(resLong.status).toBe(400);
      expect(resLong.body.error.code).toBe("VALIDATION_ERROR");

      // Positive boundary: exactly 5 characters
      const resMinValid = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "12345" });
      expect(resMinValid.status).toBe(201);
      expect(resMinValid.body.data.description).toBe("12345");

      // Positive boundary: exactly 2,000 characters
      const maxDesc = "b".repeat(2000);
      const resMaxValid = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: maxDesc });
      expect(resMaxValid.status).toBe(201);
      expect(resMaxValid.body.data.description).toBe(maxDesc);
    });

    it("Rejects invalid field types and enforces 1,000 char maximum for followUpNote and attachmentNotes", async () => {
      const staffSession = await createTestSession(db, staffA.id);

      // Rejects non-boolean followUpRequired (string, number, array, object, null)
      for (const invalidBool of ["true", 1, null, [true], { required: true }]) {
        const resBool = await request(app)
          .post(`/api/tickets/${openTicketId}/actions`)
          .set("Cookie", staffSession.cookie)
          .set("X-CSRF-Token", staffSession.csrfToken)
          .send({ description: "Valid action description", followUpRequired: invalidBool });
        expect(resBool.status).toBe(400);
        expect(resBool.body.error.code).toBe("VALIDATION_ERROR");
      }

      // Rejects followUpNote > 1,000 characters
      const resLongFollowUp = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid action description", followUpRequired: true, followUpNote: "f".repeat(1001) });
      expect(resLongFollowUp.status).toBe(400);
      expect(resLongFollowUp.body.error.code).toBe("VALIDATION_ERROR");

      // Rejects non-string followUpNote
      const resNonStrFollowUp = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid action description", followUpRequired: true, followUpNote: 12345 });
      expect(resNonStrFollowUp.status).toBe(400);
      expect(resNonStrFollowUp.body.error.code).toBe("VALIDATION_ERROR");

      // Rejects attachmentNotes > 1,000 characters
      const resLongAttachment = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid action description", attachmentNotes: "n".repeat(1001) });
      expect(resLongAttachment.status).toBe(400);
      expect(resLongAttachment.body.error.code).toBe("VALIDATION_ERROR");

      // Rejects non-string attachmentNotes
      const resNonStrAttachment = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid action description", attachmentNotes: ["note1"] });
      expect(resNonStrAttachment.status).toBe(400);
      expect(resNonStrAttachment.body.error.code).toBe("VALIDATION_ERROR");

      // Positive boundaries: 1,000 chars for followUpNote and attachmentNotes
      const resValidNotes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({
          description: "Action with max notes",
          followUpRequired: true,
          followUpNote: "f".repeat(1000),
          attachmentNotes: "a".repeat(1000),
        });
      expect(resValidNotes.status).toBe(201);
      expect(resValidNotes.body.data.followUpNote).toBe("f".repeat(1000));
      expect(resValidNotes.body.data.attachmentNotes).toBe("a".repeat(1000));
    });

    it("Rejects inactive assignee or assignee with REQUESTER role (422 INVALID_ACTION_ASSIGNEE)", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const resInactive = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid description", assigneeId: inactiveStaff.id });
      expect(resInactive.status).toBe(422);
      expect(resInactive.body.error.code).toBe("INVALID_ACTION_ASSIGNEE");

      const resRequester = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Valid description", assigneeId: requesterUser.id });
      expect(resRequester.status).toBe(422);
      expect(resRequester.body.error.code).toBe("INVALID_ACTION_ASSIGNEE");
    });

    it("Rejects followUpRequired: true without followUpNote (422 FOLLOW_UP_NOTE_REQUIRED)", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const res = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Follow-up test", followUpRequired: true });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("FOLLOW_UP_NOTE_REQUIRED");
    });

    it("Rejects action creation on terminal RESOLVED ticket (422 TICKET_TERMINAL_IMMUTABLE)", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const res = await request(app)
        .post(`/api/tickets/${resolvedTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Cannot add to resolved ticket" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");
    });

    it("Rejects action creation on terminal CANCELLED ticket (422 TICKET_TERMINAL_IMMUTABLE)", async () => {
      const staffSession = await createTestSession(db, staffA.id);
      const res = await request(app)
        .post(`/api/tickets/${cancelledTicketId}/actions`)
        .set("Cookie", staffSession.cookie)
        .set("X-CSRF-Token", staffSession.csrfToken)
        .send({ description: "Cannot add to cancelled ticket" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");
    });
  });

  describe("Decoupled Completion Attribution (TEST-ACT-08, TEST-ACT-25, TEST-ACT-26)", () => {
    it("Staff B completes an action assigned to Staff A, attributing completedById to Staff B", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const sessionB = await createTestSession(db, staffB.id);

      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Cross-staff completion test action", assigneeId: staffA.id });
      const actionId = createRes.body.data.id;

      const completeRes = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionB.cookie)
        .set("X-CSRF-Token", sessionB.csrfToken)
        .send({ status: "COMPLETED", result: "Completed by Staff B successfully", version: 1 });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe("COMPLETED");
      expect(completeRes.body.data.assignee.id).toBe(staffA.id);
      expect(completeRes.body.data.completedBy.id).toBe(staffB.id);
      expect(completeRes.body.data.version).toBe(2);

      // Verify history
      const historyRes = await request(app)
        .get(`/api/actions/${actionId}/history`)
        .set("Cookie", sessionB.cookie);
      expect(historyRes.body.data.items[1].eventType).toBe("COMPLETED");
      expect(historyRes.body.data.items[1].actor.id).toBe(staffB.id);
    });

    it("Staff B completes an unassigned action, attributing completedById to Staff B", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const sessionB = await createTestSession(db, staffB.id);

      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Unassigned action test" });
      const actionId = createRes.body.data.id;

      const completeRes = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionB.cookie)
        .set("X-CSRF-Token", sessionB.csrfToken)
        .send({ status: "COMPLETED", result: "Completed unassigned action with valid result", version: 1 });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.assignee).toBeNull();
      expect(completeRes.body.data.completedBy.id).toBe(staffB.id);
    });

    it("Rejects completion without result or result < 3 characters (422 ACTION_RESULT_REQUIRED)", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Result required validation action" });
      const actionId = createRes.body.data.id;

      const resEmpty = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "COMPLETED", result: "", version: 1 });
      expect(resEmpty.status).toBe(422);
      expect(resEmpty.body.error.code).toBe("ACTION_RESULT_REQUIRED");

      const resShort = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "COMPLETED", result: "ok", version: 1 });
      expect(resShort.status).toBe(422);
      expect(resShort.body.error.code).toBe("ACTION_RESULT_REQUIRED");
    });
  });

  describe("Cancellation & Reason Validation (TEST-ACT-10, TEST-ACT-11)", () => {
    it("Staff cancels action with mandatory cancellationReason", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Action to be cancelled" });
      const actionId = createRes.body.data.id;

      const cancelRes = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "CANCELLED", cancellationReason: "Hardware replacement deemed redundant", version: 1 });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe("CANCELLED");
      expect(cancelRes.body.data.cancellationReason).toBe("Hardware replacement deemed redundant");
      expect(cancelRes.body.data.cancelledAt).not.toBeNull();
    });

    it("Rejects cancellation without cancellationReason (422 CANCELLATION_REASON_REQUIRED)", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Action to test missing reason" });
      const actionId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "CANCELLED", version: 1 });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("CANCELLATION_REASON_REQUIRED");
    });
  });

  describe("Terminal State Immutability (TEST-ACT-12, TEST-RES-05)", () => {
    it("Rejects editing or altering status on COMPLETED action (422 ACTION_TERMINAL_IMMUTABLE)", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Terminal action test" });
      const actionId = createRes.body.data.id;

      await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "COMPLETED", result: "Completed initial run", version: 1 });

      // Attempt edit
      const editRes = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Attempted edit after completion", version: 2 });
      expect(editRes.status).toBe(422);
      expect(editRes.body.error.code).toBe("ACTION_TERMINAL_IMMUTABLE");

      // Attempt status change
      const statusRes = await request(app)
        .patch(`/api/actions/${actionId}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "CANCELLED", cancellationReason: "Try to cancel completed", version: 2 });
      expect(statusRes.status).toBe(422);
      expect(statusRes.body.error.code).toBe("ACTION_TERMINAL_IMMUTABLE");
    });

    it("Rejects editing actions on a CANCELLED ticket (422 TICKET_TERMINAL_IMMUTABLE)", async () => {
      // First seed an action directly on the cancelled ticket to test edit prohibition
      const actionOnCancelled = await db.actionTaken.create({
        data: {
          ticketId: cancelledTicketId,
          createdById: staffA.id,
          status: "PENDING",
          description: "Frozen action on cancelled ticket",
          version: 1,
        },
      });

      const sessionA = await createTestSession(db, staffA.id);
      const editRes = await request(app)
        .patch(`/api/actions/${actionOnCancelled.id}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Attempting edit on cancelled ticket", version: 1 });

      expect(editRes.status).toBe(422);
      expect(editRes.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");

      const statusRes = await request(app)
        .patch(`/api/actions/${actionOnCancelled.id}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ status: "COMPLETED", result: "Attempting completion", version: 1 });

      expect(statusRes.status).toBe(422);
      expect(statusRes.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");
    });
  });

  describe("Stale Version Conflicts (TEST-ACT-07, AC-16)", () => {
    it("Rejects edit with stale version (409 ACTION_VERSION_CONFLICT)", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Stale version test action" });
      const actionId = createRes.body.data.id;

      // First edit succeeds
      await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "First edit update", version: 1 });

      // Stale second edit submits old version 1
      const staleRes = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({ description: "Stale update submission", version: 1 });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe("ACTION_VERSION_CONFLICT");
    });
  });

  describe("Follow-Up Audit Consistency & Normalization (Defect 1)", () => {
    it("Disabling followUpRequired normalizes followUpNote to null and logs accurate history audit", async () => {
      const sessionA = await createTestSession(db, staffA.id);

      // 1. Create an Action with follow-up required and a note
      const createRes = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          description: "Follow-up audit consistency test action",
          followUpRequired: true,
          followUpNote: "Call vendor tomorrow morning",
        });

      expect(createRes.status).toBe(201);
      const actionId = createRes.body.data.id;
      expect(createRes.body.data.followUpRequired).toBe(true);
      expect(createRes.body.data.followUpNote).toBe("Call vendor tomorrow morning");

      // 2. Disable follow-up without submitting replacement note
      const editRes1 = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          version: 1,
          followUpRequired: false,
        });

      expect(editRes1.status).toBe(200);
      expect(editRes1.body.data.followUpRequired).toBe(false);
      expect(editRes1.body.data.followUpNote).toBeNull();

      // Check database row
      const dbAction1 = await db.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
      expect(dbAction1.followUpRequired).toBe(false);
      expect(dbAction1.followUpNote).toBeNull();

      // Check history records
      const historyRes1 = await request(app)
        .get(`/api/actions/${actionId}/history`)
        .set("Cookie", sessionA.cookie);

      expect(historyRes1.status).toBe(200);
      expect(historyRes1.body.data.total).toBe(2);
      const updateHistory1 = historyRes1.body.data.items[1];
      expect(updateHistory1.eventType).toBe("UPDATED");
      expect(updateHistory1.changes.followUpRequired).toEqual({ before: true, after: false });
      expect(updateHistory1.changes.followUpNote).toEqual({ before: "Call vendor tomorrow morning", after: null });

      // 3. Re-enable follow-up with new note
      const editRes2 = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          version: 2,
          followUpRequired: true,
          followUpNote: "Active follow up note v2",
        });
      expect(editRes2.status).toBe(200);

      // 4. Disable follow-up while supplying a replacement note (which must be normalized to null)
      const editRes3 = await request(app)
        .patch(`/api/actions/${actionId}`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          version: 3,
          followUpRequired: false,
          followUpNote: "Supplied note that should become null",
        });

      expect(editRes3.status).toBe(200);
      expect(editRes3.body.data.followUpRequired).toBe(false);
      expect(editRes3.body.data.followUpNote).toBeNull();

      const dbAction3 = await db.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
      expect(dbAction3.followUpRequired).toBe(false);
      expect(dbAction3.followUpNote).toBeNull();

      const historyRes3 = await request(app)
        .get(`/api/actions/${actionId}/history`)
        .set("Cookie", sessionA.cookie);

      const updateHistory3 = historyRes3.body.data.items[3];
      expect(updateHistory3.changes.followUpRequired).toEqual({ before: true, after: false });
      expect(updateHistory3.changes.followUpNote).toEqual({ before: "Active follow up note v2", after: null });
    });
  });

  describe("Durable Idempotency & Creation Replay (TEST-ACT-17, TEST-ACT-18, TEST-ACT-21 to TEST-ACT-24)", () => {
    it("Replaying create request with identical Idempotency-Key returns 200 OK and cached response", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const key = `idem-${randomUUID()}`;
      const payload = {
        description: "Durable idempotent action payload",
        assigneeId: staffA.id,
        followUpRequired: false,
        idempotencyKey: key,
      };

      const res1 = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send(payload);

      expect(res1.status).toBe(201);
      const originalActionId = res1.body.data.id;

      // Replay identical request
      const res2 = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.headers["idempotency-replayed"]).toBe("true");
      expect(res2.body.data.id).toBe(originalActionId);

      // Verify no duplicate history entries
      const historyRes = await request(app)
        .get(`/api/actions/${originalActionId}/history`)
        .set("Cookie", sessionA.cookie);
      expect(historyRes.body.data.total).toBe(1);
    });

    it("Replay succeeds even if the ticket transitioned to terminal RESOLVED or CLOSED", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const key = `idem-terminal-${randomUUID()}`;

      // Create a fresh ticket that we will resolve
      const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
      const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
      const ticketToResolve = await db.ticket.create({
        data: {
          requesterId: requesterUser.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: "Ticket to resolve for replay test",
          description: "Desc",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "IN_PROGRESS",
          ownerId: staffA.id,
          idempotencyKey: randomUUID(),
        },
      });

      const payload = {
        description: "Action created before resolution",
        assigneeId: staffA.id,
        idempotencyKey: key,
      };

      const res1 = await request(app)
        .post(`/api/tickets/${ticketToResolve.id}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send(payload);
      expect(res1.status).toBe(201);

      // Transition ticket to RESOLVED directly in DB
      await db.ticket.update({
        where: { id: ticketToResolve.id },
        data: { currentStatus: "RESOLVED" },
      });

      // Retry request with same key and payload on now RESOLVED ticket
      const resRetry = await request(app)
        .post(`/api/tickets/${ticketToResolve.id}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send(payload);

      expect(resRetry.status).toBe(200);
      expect(resRetry.headers["idempotency-replayed"]).toBe("true");
      expect(resRetry.body.data.id).toBe(res1.body.data.id);
    });

    it("Replaying with same Idempotency-Key but modified payload returns 409 IDEMPOTENCY_CONFLICT", async () => {
      const sessionA = await createTestSession(db, staffA.id);
      const key = `idem-conflict-${randomUUID()}`;

      await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          description: "Original description for conflict test",
          idempotencyKey: key,
        });

      const resConflict = await request(app)
        .post(`/api/tickets/${openTicketId}/actions`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          description: "Completely different description using same key",
          idempotencyKey: key,
        });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    });
  });
});
