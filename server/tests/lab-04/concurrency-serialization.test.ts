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

const schemaName = `lab4_concurrency_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let staffA: { id: number; email: string };
let staffB: { id: number; email: string };
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

  staffA = await db.user.findFirstOrThrow({ where: { email: "ethan.brooks@toktickit.local" }, select: { id: true, email: true } });
  staffB = await db.user.findFirstOrThrow({ where: { email: "gavin.lee@toktickit.local" }, select: { id: true, email: true } });
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

describe("Concurrency & Parent Row Lock Serialization (server/tests/lab-04/concurrency-serialization.test.ts)", () => {
  async function createHelperTicket(params: {
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    ownerId?: number | null;
  }) {
    const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
    const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    return db.ticket.create({
      data: {
        requesterId: requesterUser.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: `Concurrency Test Ticket ${randomUUID()}`,
        description: "Test description for concurrency serialization",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: params.status ?? "IN_PROGRESS",
        ownerId: params.ownerId !== undefined ? params.ownerId : staffA.id,
        idempotencyKey: randomUUID(),
      },
    });
  }

  it("TEST-CONC-01: Action Creation vs Ticket Resolution race condition serialization", async () => {
    // Run 10 concurrent iterations where Thread A attempts resolution while Thread B attempts to add a PENDING action
    for (let i = 0; i < 10; i++) {
      const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffA.id });

      // Add one existing completed action so ticket meets prerequisite for resolution
      await db.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: staffA.id,
          status: "COMPLETED",
          completedById: staffA.id,
          completedAt: new Date(),
          description: `Existing initial work ${i}`,
          result: "Done and verified",
        },
      });

      const sessionA = await createTestSession(db, staffA.id);
      const sessionB = await createTestSession(db, staffB.id);

      // Thread A: Resolve Ticket
      const resolvePromise = request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Cookie", sessionA.cookie)
        .set("X-CSRF-Token", sessionA.csrfToken)
        .send({
          status: "RESOLVED",
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        });

      // Thread B: Create new PENDING action
      const createPromise = request(app)
        .post(`/api/tickets/${ticket.id}/actions`)
        .set("Cookie", sessionB.cookie)
        .set("X-CSRF-Token", sessionB.csrfToken)
        .send({
          description: `Concurrent action ${i}`,
          idempotencyKey: randomUUID(),
        });

      const [resolveRes, createRes] = await Promise.all([resolvePromise, createPromise]);

      // Exactly two valid outcomes:
      // Case 1: Resolution locked first -> Resolve succeeds (200), Action creation fails (422 TICKET_TERMINAL_IMMUTABLE)
      // Case 2: Creation locked first -> Action creation succeeds (201), Resolve fails (422 RESOLUTION_GATE_PENDING_ACTIONS)
      if (resolveRes.status === 200) {
        expect(resolveRes.body.data.currentStatus).toBe("RESOLVED");
        expect(createRes.status).toBe(422);
        expect(createRes.body.error.code).toBe("TICKET_TERMINAL_IMMUTABLE");
      } else {
        expect(resolveRes.status).toBe(422);
        expect(resolveRes.body.error.code).toBe("RESOLUTION_GATE_PENDING_ACTIONS");
        expect(createRes.status).toBe(201);
      }

      // Invariant: In 0% of runs is a resolved ticket left with pending actions
      const finalTicket = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      const pendingActions = await db.actionTaken.count({
        where: { ticketId: ticket.id, status: "PENDING" },
      });

      if (finalTicket.currentStatus === "RESOLVED") {
        expect(pendingActions).toBe(0);
      }
    }
  }, 30000);

  it("TEST-CONC-02: Action Completion vs Ticket Resolution lock serialization", async () => {
    const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffA.id });

    // Single pending action exists on the ticket
    const pendingAction = await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        status: "PENDING",
        description: "Sole pending action to be completed concurrently",
      },
    });

    const sessionA = await createTestSession(db, staffA.id);
    const sessionB = await createTestSession(db, staffB.id);

    // Thread A: Complete the pending action
    const completePromise = request(app)
      .patch(`/api/actions/${pendingAction.id}/status`)
      .set("Cookie", sessionA.cookie)
      .set("X-CSRF-Token", sessionA.csrfToken)
      .send({
        status: "COMPLETED",
        result: "Fix applied and verified",
        version: pendingAction.version,
      });

    // Thread B: Attempt to resolve the ticket
    const resolvePromise = request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set("Cookie", sessionB.cookie)
      .set("X-CSRF-Token", sessionB.csrfToken)
      .send({
        status: "RESOLVED",
        expectedUpdatedAt: ticket.updatedAt.toISOString(),
      });

    const [completeRes, resolveRes] = await Promise.all([completePromise, resolvePromise]);

    // Action completion must succeed (200)
    expect(completeRes.status).toBe(200);

    // Resolution outcome depends on lock order:
    // If resolution checked before completion committed: 422 RESOLUTION_GATE_PENDING_ACTIONS
    // If resolution checked after completion committed: 200 RESOLVED
    expect([200, 422]).toContain(resolveRes.status);

    // Verify invariants: database must be consistent
    const finalAction = await db.actionTaken.findUniqueOrThrow({ where: { id: pendingAction.id } });
    expect(finalAction.status).toBe("COMPLETED");
  });

  it("TEST-CONC-03: Concurrent Action Edits: exactly one succeeds, other fails with 409 ACTION_VERSION_CONFLICT", async () => {
    const ticket = await createHelperTicket({ status: "IN_PROGRESS", ownerId: staffA.id });

    const action = await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        status: "PENDING",
        description: "Initial description for conflict test",
        version: 1,
      },
    });

    const sessionA = await createTestSession(db, staffA.id);
    const sessionB = await createTestSession(db, staffB.id);

    // Two threads attempt to update the same action using the initial version = 1
    const editPromiseA = request(app)
      .patch(`/api/actions/${action.id}`)
      .set("Cookie", sessionA.cookie)
      .set("X-CSRF-Token", sessionA.csrfToken)
      .send({
        description: "Update from Thread A",
        version: 1,
      });

    const editPromiseB = request(app)
      .patch(`/api/actions/${action.id}`)
      .set("Cookie", sessionB.cookie)
      .set("X-CSRF-Token", sessionB.csrfToken)
      .send({
        description: "Update from Thread B",
        version: 1,
      });

    const [resA, resB] = await Promise.all([editPromiseA, editPromiseB]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const conflictRes = resA.status === 409 ? resA : resB;
    expect(conflictRes.body.error.code).toBe("ACTION_VERSION_CONFLICT");

    // Action version must now be 2
    const finalAction = await db.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(finalAction.version).toBe(2);
  });
});
