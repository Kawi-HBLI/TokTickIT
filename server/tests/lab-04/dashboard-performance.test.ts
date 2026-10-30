import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient, TicketPriority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { hashPassword, INITIAL_PASSWORD, normalizeEmail } from "../../src/auth-crypto.js";
import {
  administratorUsers,
  categories,
  relatedSystems,
  requesterUsers,
  staffUsers,
} from "../../prisma/seed-data.js";

const schemaName = `lab4_perf_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;

let requesterUser: { id: number; email: string };
let otherRequesterB: { id: number; email: string };
let otherRequesterC: { id: number; email: string };
let staffA: { id: number; email: string };
let staffB: { id: number; email: string };
let adminUser: { id: number; email: string };

let staffSession: { cookie: string; csrfToken: string };
let requesterSession: { cookie: string; csrfToken: string };

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
  execFileSync(
    process.execPath,
    [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
      timeout: 30000,
    }
  );

  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  vi.spyOn(prismaModule, "getPrisma").mockImplementation(() => db);

  for (const category of categories) {
    await db.category.upsert({
      where: { name: category.name },
      update: { isActive: category.isActive },
      create: category,
    });
  }

  for (const relatedSystem of relatedSystems) {
    await db.relatedSystem.upsert({
      where: { name: relatedSystem.name },
      update: {
        description: relatedSystem.description,
        isActive: relatedSystem.isActive,
      },
      create: relatedSystem,
    });
  }

  const users = [
    ...requesterUsers.map((user) => ({ ...user, role: "REQUESTER" as const })),
    ...staffUsers.map((user) => ({ ...user, role: "IT_STAFF" as const })),
    ...administratorUsers.map((user) => ({ ...user, role: "ADMINISTRATOR" as const })),
  ];

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        department: u.department,
        normalizedEmail: normalizeEmail(u.email),
        mustChangePassword: false,
      },
      create: {
        ...u,
        normalizedEmail: normalizeEmail(u.email),
        passwordHash: await hashPassword(INITIAL_PASSWORD),
        mustChangePassword: false,
      },
    });
  }

  requesterUser = await db.user.findFirstOrThrow({
    where: { email: "amina.rahman@toktickit.local" },
    select: { id: true, email: true },
  });
  otherRequesterB = await db.user.findFirstOrThrow({
    where: { email: "ben.carter@toktickit.local" },
    select: { id: true, email: true },
  });
  otherRequesterC = await db.user.findFirstOrThrow({
    where: { email: "chalida.srisuk@toktickit.local" },
    select: { id: true, email: true },
  });
  staffA = await db.user.findFirstOrThrow({
    where: { email: "ethan.brooks@toktickit.local" },
    select: { id: true, email: true },
  });
  staffB = await db.user.findFirstOrThrow({
    where: { email: "gavin.lee@toktickit.local" },
    select: { id: true, email: true },
  });
  adminUser = await db.user.findFirstOrThrow({
    where: { email: "harper.morgan@toktickit.local" },
    select: { id: true, email: true },
  });

  staffSession = await createTestSession(db, staffA.id);
  requesterSession = await createTestSession(db, requesterUser.id);

  const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
  const system = await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  // Build 500 tickets with documented distribution:
  // 1. Amina (1..75):
  //    - 1..40: Active (20 unassigned NEW/OPEN, 10 Staff A IN_PROGRESS, 10 Staff B IN_PROGRESS)
  //    - 41..55: Active WAITING_FOR_REQUESTER (5 unassigned, 5 Staff A, 5 Staff B)
  //    - 56..75: Terminal (10 RESOLVED, 10 CLOSED) (10 Staff A, 10 Staff B)
  // 2. Ben (76..300):
  //    - 76..170: Unassigned active (95 tickets)
  //    - 171..230: Staff A active (60 tickets)
  //    - 231..280: Staff B active (50 tickets)
  //    - 281..300: Terminal (20 tickets: 10 RESOLVED, 10 CLOSED)
  // 3. Chalida (301..500):
  //    - 301..365: Staff A active (65 tickets)
  //    - 366..420: Staff B active (55 tickets)
  //    - 421..460: Admin active (40 tickets)
  //    - 461..500: Terminal (40 tickets: 20 RESOLVED, 10 CLOSED, 10 CANCELLED)
  // Total: 120 unassigned active + 140 Staff A active + 120 Staff B active + 40 Admin active + 80 terminal = 500 tickets.
  const ticketData: any[] = [];
  const now = new Date();

  for (let i = 1; i <= 500; i++) {
    const pad = String(i).padStart(5, "0");
    const ticketNumber = `TKT-PRF-${pad}`;

    let reqId = otherRequesterB.id;
    let ownerId: number | null = null;
    let currentStatus: TicketStatus = "OPEN";
    let itPriority: TicketPriority = "MEDIUM";
    let requestedPriority: TicketPriority = "MEDIUM";

    if (i <= 75) {
      // Amina
      reqId = requesterUser.id;
      if (i <= 20) {
        ownerId = null;
        currentStatus = i % 2 === 0 ? "NEW" : "OPEN";
      } else if (i <= 30) {
        ownerId = staffA.id;
        currentStatus = "IN_PROGRESS";
      } else if (i <= 40) {
        ownerId = staffB.id;
        currentStatus = "IN_PROGRESS";
      } else if (i <= 45) {
        ownerId = null;
        currentStatus = "WAITING_FOR_REQUESTER";
      } else if (i <= 50) {
        ownerId = staffA.id;
        currentStatus = "WAITING_FOR_REQUESTER";
      } else if (i <= 55) {
        ownerId = staffB.id;
        currentStatus = "WAITING_FOR_REQUESTER";
      } else if (i <= 65) {
        ownerId = staffA.id;
        currentStatus = "RESOLVED";
      } else {
        ownerId = staffB.id;
        currentStatus = "CLOSED";
      }
    } else if (i <= 300) {
      // Ben
      reqId = otherRequesterB.id;
      if (i <= 170) {
        ownerId = null;
        currentStatus = i % 3 === 0 ? "NEW" : "OPEN";
      } else if (i <= 230) {
        ownerId = staffA.id;
        currentStatus = i % 2 === 0 ? "IN_PROGRESS" : "OPEN";
      } else if (i <= 280) {
        ownerId = staffB.id;
        currentStatus = i % 2 === 0 ? "IN_PROGRESS" : "OPEN";
      } else if (i <= 290) {
        ownerId = staffA.id;
        currentStatus = "RESOLVED";
      } else {
        ownerId = staffB.id;
        currentStatus = "CLOSED";
      }
    } else {
      // Chalida
      reqId = otherRequesterC.id;
      if (i <= 365) {
        ownerId = staffA.id;
        currentStatus = i % 4 === 0 ? "WAITING_FOR_REQUESTER" : i % 2 === 0 ? "IN_PROGRESS" : "OPEN";
      } else if (i <= 420) {
        ownerId = staffB.id;
        currentStatus = i % 4 === 0 ? "WAITING_FOR_REQUESTER" : i % 2 === 0 ? "IN_PROGRESS" : "OPEN";
      } else if (i <= 460) {
        ownerId = adminUser.id;
        currentStatus = "IN_PROGRESS";
      } else if (i <= 480) {
        ownerId = staffA.id;
        currentStatus = "RESOLVED";
      } else if (i <= 490) {
        ownerId = staffB.id;
        currentStatus = "CLOSED";
      } else {
        ownerId = null;
        currentStatus = "CANCELLED";
      }
    }

    const updatedAt = new Date(now.getTime() - (500 - i) * 60 * 1000);

    ticketData.push({
      ticketNumber,
      requesterId: reqId,
      idempotencyKey: `idemp-perf-${i}`,
      categoryId: category.id,
      relatedSystemId: system.id,
      summary: `Performance smoke ticket ${i}`,
      description: `Description for performance smoke ticket ${i}`,
      requestedPriority,
      itPriority,
      currentStatus,
      ownerId,
      createdAt: updatedAt,
      updatedAt,
    });
  }

  await db.ticket.createMany({ data: ticketData });

  // Retrieve ticket IDs for adding actions and comments
  const createdTickets = await db.ticket.findMany({
    select: { id: true, requesterId: true, ownerId: true, currentStatus: true },
    orderBy: { id: "asc" },
  });

  const actionsData: any[] = [];
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 0, 0));
  const yesterdayUtc = new Date(startOfTodayUtc.getTime() - 24 * 60 * 60 * 1000);

  // Add representative actions:
  // 1. Pending actions assigned to Staff A on active tickets (25 actions)
  const staffAActiveTickets = createdTickets.filter((t) => t.ownerId === staffA.id && t.currentStatus !== "RESOLVED" && t.currentStatus !== "CLOSED" && t.currentStatus !== "CANCELLED");
  for (let j = 0; j < 25 && j < staffAActiveTickets.length; j++) {
    actionsData.push({
      ticketId: staffAActiveTickets[j].id,
      assigneeId: staffA.id,
      createdById: staffA.id,
      status: "PENDING",
      description: `Staff A pending diagnostic action ${j + 1}`,
      version: 1,
    });
  }

  // 2. Actions completed today by Staff A (15 actions)
  for (let j = 25; j < 40 && j < staffAActiveTickets.length; j++) {
    actionsData.push({
      ticketId: staffAActiveTickets[j].id,
      assigneeId: staffA.id,
      createdById: staffA.id,
      completedById: staffA.id,
      status: "COMPLETED",
      description: `Staff A completed action ${j + 1}`,
      result: `Resolved issue cleanly on item ${j + 1}`,
      completedAt: new Date(startOfTodayUtc.getTime() + (j - 25) * 60 * 1000),
      version: 2,
    });
  }

  // 3. Actions completed yesterday by Staff A (10 actions)
  for (let j = 40; j < 50 && j < staffAActiveTickets.length; j++) {
    actionsData.push({
      ticketId: staffAActiveTickets[j].id,
      assigneeId: staffA.id,
      createdById: staffA.id,
      completedById: staffA.id,
      status: "COMPLETED",
      description: `Staff A completed yesterday action ${j + 1}`,
      result: `Resolved issue yesterday ${j + 1}`,
      completedAt: new Date(yesterdayUtc.getTime() + (j - 40) * 60 * 1000),
      version: 2,
    });
  }

  // 4. Pending actions for Staff B (25 actions)
  const staffBActiveTickets = createdTickets.filter((t) => t.ownerId === staffB.id && t.currentStatus !== "RESOLVED" && t.currentStatus !== "CLOSED" && t.currentStatus !== "CANCELLED");
  for (let j = 0; j < 25 && j < staffBActiveTickets.length; j++) {
    actionsData.push({
      ticketId: staffBActiveTickets[j].id,
      assigneeId: staffB.id,
      createdById: staffB.id,
      status: "PENDING",
      description: `Staff B pending action ${j + 1}`,
      version: 1,
    });
  }

  // 5. Actions on Amina's tickets (assigned to & completed by Staff B to exercise activity selection)
  const aminaTickets = createdTickets.filter((t) => t.requesterId === requesterUser.id);
  for (let j = 0; j < 25 && j < aminaTickets.length; j++) {
    actionsData.push({
      ticketId: aminaTickets[j].id,
      assigneeId: staffB.id,
      createdById: staffB.id,
      completedById: j % 2 === 0 ? staffB.id : null,
      status: j % 2 === 0 ? "COMPLETED" : "PENDING",
      description: `Action on requester ticket ${j + 1}`,
      result: j % 2 === 0 ? `Completed verification for item ${j + 1}` : null,
      completedAt: j % 2 === 0 ? new Date(now.getTime() - j * 10 * 60 * 1000) : null,
      version: j % 2 === 0 ? 2 : 1,
    });
  }

  await db.actionTaken.createMany({ data: actionsData });

  // Add Public Comments on Amina's tickets (30 comments)
  const commentsData: any[] = [];
  for (let k = 0; k < 30 && k < aminaTickets.length; k++) {
    commentsData.push({
      ticketId: aminaTickets[k].id,
      authorId: k % 2 === 0 ? requesterUser.id : staffB.id,
      content: `Public activity comment ${k + 1} regarding workstation`,
      createdAt: new Date(now.getTime() - k * 5 * 60 * 1000),
    });
  }
  await db.publicComment.createMany({ data: commentsData });

  // Add Internal Notes on Amina's tickets (20 notes, staff only)
  const notesData: any[] = [];
  for (let n = 0; n < 20 && n < aminaTickets.length; n++) {
    notesData.push({
      ticketId: aminaTickets[n].id,
      authorId: staffB.id,
      content: `Confidential internal note ${n + 1} for engineering only`,
      createdAt: new Date(now.getTime() - n * 12 * 60 * 1000),
    });
  }
  await db.internalNote.createMany({ data: notesData });
}, 45000);

afterAll(async () => {
  await db?.$disconnect();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

function calculateP95(samples: number[]): { p95: number; index: number; formula: string } {
  const sorted = [...samples].sort((a, b) => a - b);
  // Nearest-rank method: index = ceil(0.95 * N) - 1
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return {
    p95: sorted[index],
    index,
    formula: "sorted[Math.ceil(0.95 * N) - 1]",
  };
}

describe("Dashboard Performance Measurement (TEST-PERF-01)", () => {
  it("measures /api/staff/dashboard and /api/requester/dashboard under 500-ticket load with p95 < 200ms", async () => {
    const SAMPLE_COUNT = 35;
    const WARMUP_COUNT = 5;

    // --- 1. Staff Dashboard ---
    // Warmup
    for (let w = 0; w < WARMUP_COUNT; w++) {
      const res = await request(app)
        .get("/api/staff/dashboard")
        .set("Cookie", staffSession.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.metrics).toBeDefined();
    }

    // Verify correct results before accepting timings
    const initialStaffRes = await request(app)
      .get("/api/staff/dashboard")
      .set("Cookie", staffSession.cookie);
    expect(initialStaffRes.status).toBe(200);
    const staffMetrics = initialStaffRes.body.data.metrics;
    expect(staffMetrics.openTicketsCount).toBe(420);
    expect(staffMetrics.unassignedTicketsCount).toBe(120);
    expect(staffMetrics.pendingActionsCount).toBe(25);
    expect(staffMetrics.completedActionsTodayCount).toBe(15);
    expect(staffMetrics.myAssignedTicketsCount).toBe(140);
    expect(initialStaffRes.body.data.myAssignedWork.length).toBeLessThanOrEqual(5);
    expect(initialStaffRes.body.data.unassignedQueue.items.length).toBeLessThanOrEqual(5);

    // Collect 35 samples
    const staffDurations: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t0 = process.hrtime.bigint();
      const res = await request(app)
        .get("/api/staff/dashboard")
        .set("Cookie", staffSession.cookie);
      const t1 = process.hrtime.bigint();
      expect(res.status).toBe(200);
      const ms = Number(t1 - t0) / 1_000_000;
      staffDurations.push(ms);
    }

    const staffP95Info = calculateP95(staffDurations);
    console.log(`[TEST-PERF-01] Staff Dashboard: N=${SAMPLE_COUNT}, p95=${staffP95Info.p95.toFixed(2)}ms (samples: min=${Math.min(...staffDurations).toFixed(2)}ms, max=${Math.max(...staffDurations).toFixed(2)}ms, avg=${(staffDurations.reduce((a, b) => a + b) / SAMPLE_COUNT).toFixed(2)}ms)`);

    expect(staffP95Info.p95).toBeLessThan(200);

    // --- 2. Requester Dashboard ---
    // Warmup
    for (let w = 0; w < WARMUP_COUNT; w++) {
      const res = await request(app)
        .get("/api/requester/dashboard")
        .set("Cookie", requesterSession.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.metrics).toBeDefined();
    }

    // Verify correct results before accepting timings
    const initialReqRes = await request(app)
      .get("/api/requester/dashboard")
      .set("Cookie", requesterSession.cookie);
    expect(initialReqRes.status).toBe(200);
    const reqMetrics = initialReqRes.body.data.metrics;
    expect(reqMetrics.activeTicketsCount).toBe(55); // 75 total, 20 resolved/closed
    expect(reqMetrics.awaitingRequesterCount).toBe(15);
    expect(reqMetrics.resolvedClosedCount).toBe(20);
    expect(initialReqRes.body.data.recentTickets.length).toBeLessThanOrEqual(5);

    // Verify privacy: no internal notes in requester response
    const jsonStr = JSON.stringify(initialReqRes.body);
    expect(jsonStr).not.toContain("Confidential internal note");

    // Collect 35 samples
    const reqDurations: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t0 = process.hrtime.bigint();
      const res = await request(app)
        .get("/api/requester/dashboard")
        .set("Cookie", requesterSession.cookie);
      const t1 = process.hrtime.bigint();
      expect(res.status).toBe(200);
      const ms = Number(t1 - t0) / 1_000_000;
      reqDurations.push(ms);
    }

    const reqP95Info = calculateP95(reqDurations);
    console.log(`[TEST-PERF-01] Requester Dashboard: N=${SAMPLE_COUNT}, p95=${reqP95Info.p95.toFixed(2)}ms (samples: min=${Math.min(...reqDurations).toFixed(2)}ms, max=${Math.max(...reqDurations).toFixed(2)}ms, avg=${(reqDurations.reduce((a, b) => a + b) / SAMPLE_COUNT).toFixed(2)}ms)`);

    expect(reqP95Info.p95).toBeLessThan(200);
  });
});
