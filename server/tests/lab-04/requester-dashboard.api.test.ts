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

  it("promotes an older sixth ticket to the top when receiving the newest public comment", async () => {
    const testRequester = await db.user.create({
      data: {
        email: `sixth.comment.${randomUUID()}@toktickit.local`,
        normalizedEmail: `sixth.comment.${randomUUID()}@toktickit.local`,
        name: "Sixth Comment User",
        passwordHash: "hash",
        role: "REQUESTER",
        mustChangePassword: false,
        isActive: true,
      },
    });
    const session = await createTestSession(db, testRequester.id);
    const category = await db.category.findFirstOrThrow();
    const system = await db.relatedSystem.findFirstOrThrow();

    const baseTime = Date.now();

    // Create 5 newer tickets (updated 1 hour ago)
    for (let i = 1; i <= 5; i++) {
      await db.ticket.create({
        data: {
          ticketNumber: `TCK-NEWER-${i}-${randomUUID().slice(0, 6)}`,
          requesterId: testRequester.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: `Newer ticket ${i}`,
          description: `Description ${i}`,
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
          currentStatus: "OPEN",
          idempotencyKey: randomUUID(),
          createdAt: new Date(baseTime - 3600000 + i * 1000),
          updatedAt: new Date(baseTime - 3600000 + i * 1000),
        },
      });
    }

    // Create older 6th ticket (updated 5 days ago)
    const olderTicket = await db.ticket.create({
      data: {
        ticketNumber: `TCK-OLDER-6-${randomUUID().slice(0, 6)}`,
        requesterId: testRequester.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: "Older sixth ticket",
        description: "Older description",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "OPEN",
        idempotencyKey: randomUUID(),
        createdAt: new Date(baseTime - 5 * 86400000),
        updatedAt: new Date(baseTime - 5 * 86400000),
      },
    });

    // Staff posts the newest public comment on olderTicket at current time
    const commentTime = new Date(baseTime);
    const commentContent = "Staff provided updated instructions on older ticket.";
    await db.publicComment.create({
      data: {
        ticketId: olderTicket.id,
        authorId: staffA.id,
        content: commentContent,
        createdAt: commentTime,
      },
    });

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const recentTickets = res.body.data.recentTickets;
    expect(recentTickets.length).toBe(5);

    // Older ticket 6 must be at index 0 (top of the preview list)
    expect(recentTickets[0].id).toBe(olderTicket.id);
    expect(recentTickets[0].latestPublicUpdate).toBe(`Staff commented: ${commentContent}`);
    // Displayed message and activity timestamp must agree
    expect(recentTickets[0].updatedAt).toBe(commentTime.toISOString());
  });

  it("promotes an older ticket to the top when receiving a new public action update", async () => {
    const testRequester = await db.user.create({
      data: {
        email: `action.update.${randomUUID()}@toktickit.local`,
        normalizedEmail: `action.update.${randomUUID()}@toktickit.local`,
        name: "Action Update User",
        passwordHash: "hash",
        role: "REQUESTER",
        mustChangePassword: false,
        isActive: true,
      },
    });
    const session = await createTestSession(db, testRequester.id);
    const category = await db.category.findFirstOrThrow();
    const system = await db.relatedSystem.findFirstOrThrow();

    const baseTime = Date.now();

    // Create 5 newer tickets (updated 1 hour ago)
    for (let i = 1; i <= 5; i++) {
      await db.ticket.create({
        data: {
          ticketNumber: `TCK-ACTION-NEWER-${i}-${randomUUID().slice(0, 6)}`,
          requesterId: testRequester.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: `Newer ticket ${i}`,
          description: `Description ${i}`,
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
          currentStatus: "OPEN",
          idempotencyKey: randomUUID(),
          createdAt: new Date(baseTime - 3600000 + i * 1000),
          updatedAt: new Date(baseTime - 3600000 + i * 1000),
        },
      });
    }

    // Create older ticket (updated 5 days ago)
    const olderTicket = await db.ticket.create({
      data: {
        ticketNumber: `TCK-ACTION-OLDER-${randomUUID().slice(0, 6)}`,
        requesterId: testRequester.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: "Older ticket receiving action",
        description: "Older description",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "IN_PROGRESS",
        idempotencyKey: randomUUID(),
        createdAt: new Date(baseTime - 5 * 86400000),
        updatedAt: new Date(baseTime - 5 * 86400000),
      },
    });

    // Staff completes an action on olderTicket at current time
    const actionTime = new Date(baseTime);
    const actionResult = "Replaced faulty network interface card.";
    await db.actionTaken.create({
      data: {
        ticketId: olderTicket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "Hardware replacement",
        result: actionResult,
        completedById: staffA.id,
        completedAt: actionTime,
        updatedAt: actionTime,
      },
    });

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const recentTickets = res.body.data.recentTickets;
    expect(recentTickets.length).toBe(5);

    // Older ticket must be at index 0
    expect(recentTickets[0].id).toBe(olderTicket.id);
    expect(recentTickets[0].latestPublicUpdate).toBe(`Action completed: ${actionResult}`);
    // Displayed message and activity timestamp must agree
    expect(recentTickets[0].updatedAt).toBe(actionTime.toISOString());
  });

  it("displays the status message when a status transition occurs after an existing comment/action", async () => {
    const testRequester = await db.user.create({
      data: {
        email: `status.trans.${randomUUID()}@toktickit.local`,
        normalizedEmail: `status.trans.${randomUUID()}@toktickit.local`,
        name: "Status Transition User",
        passwordHash: "hash",
        role: "REQUESTER",
        mustChangePassword: false,
        isActive: true,
      },
    });
    const session = await createTestSession(db, testRequester.id);
    const category = await db.category.findFirstOrThrow();
    const system = await db.relatedSystem.findFirstOrThrow();

    const baseTime = Date.now();

    // Create ticket
    const ticket = await db.ticket.create({
      data: {
        ticketNumber: `TCK-TRANS-${randomUUID().slice(0, 6)}`,
        requesterId: testRequester.id,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: "Ticket with comment then status update",
        description: "Description",
        requestedPriority: "HIGH",
        itPriority: "HIGH",
        currentStatus: "OPEN",
        idempotencyKey: randomUUID(),
        createdAt: new Date(baseTime - 7200000),
        updatedAt: new Date(baseTime - 7200000),
      },
    });

    // 1. Earlier comment 2 hours ago
    const oldCommentTime = new Date(baseTime - 7200000);
    await db.publicComment.create({
      data: {
        ticketId: ticket.id,
        authorId: staffA.id,
        content: "Old comment 2 hours ago",
        createdAt: oldCommentTime,
      },
    });

    // 2. Earlier action 1 hour ago
    const oldActionTime = new Date(baseTime - 3600000);
    await db.actionTaken.create({
      data: {
        ticketId: ticket.id,
        createdById: staffA.id,
        assigneeId: staffA.id,
        status: "COMPLETED",
        description: "Older action 1 hour ago",
        result: "Old action result",
        completedById: staffA.id,
        completedAt: oldActionTime,
        updatedAt: oldActionTime,
      },
    });

    // 3. Status transition occurs at current time (now)
    const transitionTime = new Date(baseTime);
    await db.ticket.update({
      where: { id: ticket.id },
      data: {
        currentStatus: "RESOLVED",
        updatedAt: transitionTime,
      },
    });

    const res = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    const recentTickets = res.body.data.recentTickets;
    const targetItem = recentTickets.find((t: any) => t.id === ticket.id);
    expect(targetItem).toBeDefined();

    // Verify the status message is displayed, NOT overridden by the older comment/action
    expect(targetItem.latestPublicUpdate).toBe("Ticket status is resolved.");
    expect(targetItem.latestPublicUpdate).not.toContain("Old comment");
    expect(targetItem.latestPublicUpdate).not.toContain("Older action");

    // Displayed message and activity timestamp must agree with the transition time
    expect(targetItem.updatedAt).toBe(transitionTime.toISOString());
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
