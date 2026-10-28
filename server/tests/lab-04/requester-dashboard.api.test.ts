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

const schemaName = `lab4_req_dash_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let requesterUser: { id: number; email: string };
let otherRequester: { id: number; email: string };
let staffA: { id: number; email: string };

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
});

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

describe("Requester Role Dashboard & Drill-Down API", () => {
  it("TEST-DASH-05: Requester queries personal dashboard with accurate scoping", async () => {
    const session = await createTestSession(db, requesterUser.id);

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const { metrics, recentTickets, recentActivity } = res.body.data;

    expect(typeof (metrics.activeTicketsCount ?? metrics.openTicketsCount)).toBe("number");
    expect(typeof (metrics.awaitingRequesterCount ?? metrics.awaitingInputTicketsCount)).toBe("number");
    expect(typeof (metrics.resolvedClosedCount ?? metrics.resolvedTicketsCount)).toBe("number");

    const items = recentTickets ?? recentActivity;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);

    if (items.length > 0) {
      const item = items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("ticketNumber");
      expect(item).toHaveProperty("summary");
      expect(item).toHaveProperty("currentStatus");
      expect(item).toHaveProperty("latestPublicUpdate");
      expect(item).toHaveProperty("updatedAt");

      // Verify ownership in DB
      const ticketInDb = await db.ticket.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(ticketInDb.requesterId).toBe(requesterUser.id);
    }
  });

  it("TEST-DASH-06: Requester dashboard privacy check excludes internal notes and audit history", async () => {
    const session = await createTestSession(db, requesterUser.id);

    // Create a ticket for requesterUser with an internal note and action history
    const ticket = await db.ticket.findFirstOrThrow({
      where: { requesterId: requesterUser.id },
    });

    const secretNoteText = "INTERNAL_CONFIDENTIAL_INVESTIGATION_NOTE_12345";
    await db.internalNote.create({
      data: {
        ticketId: ticket.id,
        authorId: staffA.id,
        content: secretNoteText,
      },
    });

    // Touch ticket updatedAt so it appears at top of recent tickets
    await db.ticket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() },
    });

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const jsonString = JSON.stringify(res.body);

    // Verify secret internal note content is absent
    expect(jsonString).not.toContain(secretNoteText);
    expect(jsonString).not.toContain("internalNotes");
    expect(jsonString).not.toContain("actionHistory");
    expect(jsonString).not.toContain("ActionTakenHistory");
  });

  it("TEST-DASH-07: Requester with zero submitted tickets queries dashboard", async () => {
    const email = `new.requester.${randomUUID()}@toktickit.local`;
    const newRequester = await db.user.create({
      data: {
        email,
        normalizedEmail: email.toLowerCase(),
        name: "New Requester",
        passwordHash: "hash",
        role: "REQUESTER",
        mustChangePassword: false,
        isActive: true,
      },
    });

    const session = await createTestSession(db, newRequester.id);

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const { metrics, recentTickets, recentActivity } = res.body.data;
    const active = metrics.activeTicketsCount ?? metrics.openTicketsCount;
    const awaiting = metrics.awaitingRequesterCount ?? metrics.awaitingInputTicketsCount;
    const resolved = metrics.resolvedClosedCount ?? metrics.resolvedTicketsCount;

    expect(active).toBe(0);
    expect(awaiting).toBe(0);
    expect(resolved).toBe(0);

    const items = recentTickets ?? recentActivity;
    expect(items).toEqual([]);
  });

  it("TEST-DASH-08: IT Staff attempts to query Requester dashboard endpoint", async () => {
    const staffSession = await createTestSession(db, staffA.id);

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", staffSession.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const resUnauth = await request(app).get("/api/requester/dashboard");
    expect(resUnauth.status).toBe(401);
    expect(["UNAUTHENTICATED", "AUTHENTICATION_REQUIRED"]).toContain(resUnauth.body.error.code);
  });

  it("TEST-DASH-13: GET /api/tickets?statusGroup=active & statusGroup=resolved_closed", async () => {
    const session = await createTestSession(db, requesterUser.id);

    // 1. statusGroup=active
    const resActive = await request(app)
      .get("/api/tickets?statusGroup=active")
      .set("Cookie", session.cookie);

    expect(resActive.status).toBe(200);
    expect(resActive.body.query.statusGroup).toBe("active");
    const activeStatuses: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
    for (const ticket of resActive.body.data) {
      expect(activeStatuses).toContain(ticket.currentStatus);
    }

    // 2. statusGroup=resolved_closed
    const resResolved = await request(app)
      .get("/api/tickets?statusGroup=resolved_closed")
      .set("Cookie", session.cookie);

    expect(resResolved.status).toBe(200);
    expect(resResolved.body.query.statusGroup).toBe("resolved_closed");
    const resolvedClosedStatuses: TicketStatus[] = ["RESOLVED", "CLOSED"];
    for (const ticket of resResolved.body.data) {
      expect(resolvedClosedStatuses).toContain(ticket.currentStatus);
    }
  });
});
