import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient, TicketPriority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab4_staff_dash_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let requesterUser: { id: number; email: string };
let staffA: { id: number; email: string };
let staffB: { id: number; email: string };
let adminUser: { id: number; email: string };

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
  staffA = await db.user.findFirstOrThrow({ where: { email: "ethan.brooks@toktickit.local" }, select: { id: true, email: true } });
  staffB = await db.user.findFirstOrThrow({ where: { email: "gavin.lee@toktickit.local" }, select: { id: true, email: true } });
  adminUser = await db.user.findFirstOrThrow({ where: { email: "harper.morgan@toktickit.local" }, select: { id: true, email: true } });
});

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

describe("IT Staff Role Dashboard & Drill-Down API", () => {
  it("TEST-DASH-01: IT Staff queries dashboard with populated seed data", async () => {
    const session = await createTestSession(db, staffA.id);

    const res = await request(app)
      .get("/api/staff/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const { metrics, myWork, unassignedQueue, recentActions } = res.body.data;

    expect(typeof metrics.openTicketsCount).toBe("number");
    expect(typeof metrics.pendingActionsCount).toBe("number");
    expect(typeof metrics.unassignedTicketsCount).toBe("number");
    expect(typeof (metrics.completedActionsTodayCount ?? metrics.completedTodayCount)).toBe("number");

    expect(myWork).toBeDefined();
    expect(Array.isArray(myWork.items)).toBe(true);
    expect(myWork.items.length).toBeLessThanOrEqual(5);

    if (myWork.items.length > 0) {
      const item = myWork.items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("ticketNumber");
      expect(item).toHaveProperty("summary");
      expect(item).toHaveProperty("requestedPriority");
      expect(item).toHaveProperty("itPriority");
      expect(item).toHaveProperty("currentStatus");
      expect(item).toHaveProperty("pendingActionsCount");
      expect(item).toHaveProperty("updatedAt");
    }

    expect(unassignedQueue).toBeDefined();
    expect(Array.isArray(unassignedQueue.items)).toBe(true);
    expect(unassignedQueue.items.length).toBeLessThanOrEqual(5);

    expect(Array.isArray(recentActions)).toBe(true);
    expect(recentActions.length).toBeLessThanOrEqual(10);
    if (recentActions.length > 0) {
      const action = recentActions[0];
      expect(action).toHaveProperty("id");
      expect(action).toHaveProperty("ticketId");
      expect(action).toHaveProperty("ticketNumber");
      expect(action).toHaveProperty("description");
      expect(action).toHaveProperty("status");
    }
  });

  it("TEST-DASH-02: Completed Actions Today UTC boundary check", async () => {
    const session = await createTestSession(db, staffA.id);

    const ticket = await db.ticket.findFirstOrThrow({
      where: { currentStatus: "IN_PROGRESS" },
    });

    const now = new Date();
    const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
    const todayMorningUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 1, 0));
    const todayNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));

    // Clear completed actions by staffA to test boundary cleanly
    await db.actionTaken.deleteMany({
      where: { completedById: staffA.id },
    });

    // 1. Action completed yesterday 23:59:59 UTC by staffA (excluded)
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "Action completed yesterday at 23:59:59 UTC",
        result: "Completed successfully yesterday",
        completedById: staffA.id,
        completedAt: yesterdayUtc,
      },
    });

    // 2. Action completed today at 00:00:01 UTC by staffA (included)
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "Action completed today at 00:00:01 UTC",
        result: "Completed early this morning",
        completedById: staffA.id,
        completedAt: todayMorningUtc,
      },
    });

    // 3. Action completed today by staffB (excluded from staffA's count)
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffB.id,
        status: "COMPLETED",
        description: "Action completed today by staffB",
        result: "Completed by staffB",
        completedById: staffB.id,
        completedAt: todayNoonUtc,
      },
    });

    const res = await request(app)
      .get("/api/staff/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const count = res.body.data.metrics.completedActionsTodayCount ?? res.body.data.metrics.completedTodayCount;
    expect(count).toBe(1);
  });

  it("TEST-DASH-03: IT Staff queries dashboard with zero tickets in database", async () => {
    const emptySchema = `empty_staff_dash_${randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("schema", emptySchema);
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
      timeout: 30000,
    });

    const emptyDb = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    vi.spyOn(prismaModule, "getPrisma").mockImplementation(() => emptyDb);

    try {
      const staffUser = await emptyDb.user.create({
        data: {
          email: "clean.staff@toktickit.local",
          normalizedEmail: "clean.staff@toktickit.local",
          name: "Clean Staff",
          passwordHash: "hash",
          role: "IT_STAFF",
          mustChangePassword: false,
          isActive: true,
        },
      });

      const session = await createTestSession(emptyDb, staffUser.id);

      const res = await request(app)
        .get("/api/staff/dashboard")
        .set("Cookie", session.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.metrics.openTicketsCount).toBe(0);
      expect(res.body.data.metrics.pendingActionsCount).toBe(0);
      expect(res.body.data.metrics.unassignedTicketsCount).toBe(0);
      const todayCount = res.body.data.metrics.completedActionsTodayCount ?? res.body.data.metrics.completedTodayCount;
      expect(todayCount).toBe(0);
      expect(res.body.data.myWork.items).toEqual([]);
      expect(res.body.data.unassignedQueue.items).toEqual([]);
      expect(res.body.data.recentActions).toEqual([]);
    } finally {
      vi.spyOn(prismaModule, "getPrisma").mockImplementation(() => db);
      await emptyDb.$disconnect();
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`);
    }
  });

  it("TEST-DASH-04: Requester attempts to query IT Staff dashboard endpoint", async () => {
    const session = await createTestSession(db, requesterUser.id);

    const res = await request(app)
      .get("/api/staff/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const resUnauth = await request(app).get("/api/staff/dashboard");
    expect(resUnauth.status).toBe(401);
    expect(["UNAUTHENTICATED", "AUTHENTICATION_REQUIRED"]).toContain(resUnauth.body.error.code);

    const adminSession = await createTestSession(db, adminUser.id);
    const resAdmin = await request(app)
      .get("/api/staff/dashboard")
      .set("Cookie", adminSession.cookie);
    expect(resAdmin.status).toBe(200);
  });

  it("TEST-DASH-09: GET /api/staff/tickets?statusGroup=active", async () => {
    const session = await createTestSession(db, staffA.id);

    const res = await request(app)
      .get("/api/staff/tickets?statusGroup=active")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.query.statusGroup).toBe("active");
    expect(res.body.data.length).toBeGreaterThan(0);

    const terminalStatuses: TicketStatus[] = ["RESOLVED", "CLOSED", "CANCELLED"];
    for (const ticket of res.body.data) {
      expect(terminalStatuses).not.toContain(ticket.currentStatus);
    }
  });

  it("TEST-DASH-10: GET /api/staff/tickets?owner=unassigned&statusGroup=active", async () => {
    const session = await createTestSession(db, staffA.id);

    const res = await request(app)
      .get("/api/staff/tickets?owner=unassigned&statusGroup=active")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.query.owner).toBe("unassigned");
    expect(res.body.query.statusGroup).toBe("active");

    for (const ticket of res.body.data) {
      expect(ticket.owner).toBeNull();
      expect(["RESOLVED", "CLOSED", "CANCELLED"]).not.toContain(ticket.currentStatus);
    }
  });

  it("TEST-DASH-11: GET /api/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active excludes cancelled tickets", async () => {
    const session = await createTestSession(db, staffA.id);

    // Create an active ticket with a pending action assigned to staffA
    const activeTicket = await db.ticket.findFirstOrThrow({
      where: { currentStatus: "IN_PROGRESS" },
    });
    await db.actionTaken.create({
      data: {
        ticketId: activeTicket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "PENDING",
        description: "Active pending action for staffA",
      },
    });

    // Create a CANCELLED ticket with a pending action assigned to staffA
    const category = await db.category.findFirstOrThrow();
    const system = await db.relatedSystem.findFirstOrThrow();
    const cancelledTicket = await db.ticket.create({
      data: {
        ticketNumber: `TCK-CANCELLED-${randomUUID().slice(0, 8)}`,
        requesterId: requesterUser.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: "Cancelled ticket with pending action",
        description: "Description of cancelled ticket",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "CANCELLED",
        idempotencyKey: randomUUID(),
      },
    });
    await db.actionTaken.create({
      data: {
        ticketId: cancelledTicket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "PENDING",
        description: "Frozen pending action on cancelled ticket",
      },
    });

    const res = await request(app)
      .get("/api/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const returnedIds = res.body.data.map((t: any) => t.id);
    expect(returnedIds).toContain(activeTicket.id);
    expect(returnedIds).not.toContain(cancelledTicket.id);
  });

  it("TEST-DASH-12: GET /api/staff/tickets?completedBy=me&completedDate=today returns distinct tickets", async () => {
    const session = await createTestSession(db, staffA.id);

    const ticket = await db.ticket.findFirstOrThrow({
      where: { currentStatus: "IN_PROGRESS" },
    });

    const now = new Date();
    // Add two completed actions to the same ticket today by staffA
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "First completed action today",
        result: "Done 1",
        completedById: staffA.id,
        completedAt: now,
      },
    });
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "Second completed action today",
        result: "Done 2",
        completedById: staffA.id,
        completedAt: now,
      },
    });

    const res = await request(app)
      .get("/api/staff/tickets?completedBy=me&completedDate=today")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.query.completedBy).toBe("me");
    expect(res.body.query.completedDate).toBe("today");

    // Verify distinct tickets: ticket.id must appear at most once in res.body.data
    const ticketIds = res.body.data.map((t: any) => t.id);
    const matchingCount = ticketIds.filter((id: number) => id === ticket.id).length;
    expect(matchingCount).toBe(1);
  });
});
