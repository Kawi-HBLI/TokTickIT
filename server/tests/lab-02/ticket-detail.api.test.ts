import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab2_detail_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;
let requesterAId: number;
let requesterBId: number;
let categoryId: number;
let systemId: number;
let ticketAId: number;
let ticketBId: number;

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
    },
  );
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await seedDatabase(db);

  const activeRequesters = await db.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  requesterAId = activeRequesters[0].id;
  requesterBId = activeRequesters[1].id;

  const categories = await db.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  categoryId = categories[0].id;
  systemId = (await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

  // Ticket for Requester A
  const tA = await db.ticket.create({
    data: {
      requesterId: requesterAId,
      categoryId,
      relatedSystemId: systemId,
      summary: "Laptop keyboard not responding",
      description: "Several keys (Enter, Space, Backspace) do not register keypresses.",
      requestedPriority: "HIGH",
      idempotencyKey: randomUUID(),
    },
  });
  ticketAId = tA.id;

  // Add an active attachment and a removed attachment to Ticket A
  await db.attachment.create({
    data: {
      ticketId: ticketAId,
      originalName: "keyboard-diagnostic.png",
      storedName: `${randomUUID()}.png`,
      mimeType: "image/png",
      sizeBytes: 102400,
      isRemoved: false,
    },
  });

  await db.attachment.create({
    data: {
      ticketId: ticketAId,
      originalName: "old-photo.jpg",
      storedName: `${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 51200,
      isRemoved: true,
      removalReason: "Uploaded wrong keyboard model photo",
      removedAt: new Date("2026-08-30T10:00:00.000Z"),
      removedByRequesterId: requesterAId,
    },
  });

  // Ticket for Requester B
  const tB = await db.ticket.create({
    data: {
      requesterId: requesterBId,
      categoryId,
      relatedSystemId: systemId,
      summary: "VPN access expired",
      description: "Cannot connect to campus VPN since this morning.",
      requestedPriority: "MEDIUM",
      idempotencyKey: randomUUID(),
    },
  });
  ticketBId = tB.id;

  (prismaModule as unknown as { client: PrismaClient }).client = db;
}, 40000);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(async () => {
  if (db) await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
});

describe("Ticket Detail API (API-DETAIL-01 to API-DETAIL-02)", () => {
  it("API-DETAIL-01: retrieves complete owned read-only ticket details and attachment metadata", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketAId}`)
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const t = res.body.data;
    expect(t.id).toBe(ticketAId);
    expect(t.ticketNumber).toMatch(/^TKT-2026-\d{5}$/);
    expect(t.summary).toBe("Laptop keyboard not responding");
    expect(t.description).toBe("Several keys (Enter, Space, Backspace) do not register keypresses.");
    expect(t.requestedPriority).toBe("HIGH");
    expect(t.itPriority).toBeNull();
    expect(t.currentStatus).toBe("NEW");
    expect(t.ticketOwner).toBeNull();
    expect(t.requester.id).toBe(requesterAId);
    expect(t.requester.name).toBeDefined();
    expect(t.category.id).toBe(categoryId);
    expect(t.relatedSystem.id).toBe(systemId);

    // Verify attachments metadata
    expect(t.attachments).toHaveLength(2);
    const [att1, att2] = t.attachments;
    expect(att1.originalName).toBe("keyboard-diagnostic.png");
    expect(att1.mimeType).toBe("image/png");
    expect(att1.isRemoved).toBe(false);
    expect(att1.removalReason).toBeNull();
    // Security check: storedName and path must NOT be exposed
    expect(att1.storedName).toBeUndefined();
    expect(att1.path).toBeUndefined();

    expect(att2.originalName).toBe("old-photo.jpg");
    expect(att2.isRemoved).toBe(true);
    expect(att2.removalReason).toBe("Uploaded wrong keyboard model photo");
    expect(att2.removedAt).toBeDefined();
    expect(att2.storedName).toBeUndefined();
    expect(att2.path).toBeUndefined();
  });

  it("API-DETAIL-02: returns safe 404 for missing ticket or differently owned ticket without disclosure", async () => {
    // 1. Missing ticket
    const missingRes = await request(app)
      .get("/api/tickets/999999")
      .set("x-requester-id", String(requesterAId));

    expect(missingRes.status).toBe(404);
    expect(missingRes.body.error).toEqual({
      code: "TICKET_NOT_FOUND",
      message: "Ticket not found.",
      retryable: false,
    });
    expect(missingRes.body.data).toBeUndefined();

    // 2. Cross-requester ticket (Requester A attempting to view Requester B's ticket)
    const crossRes = await request(app)
      .get(`/api/tickets/${ticketBId}`)
      .set("x-requester-id", String(requesterAId));

    expect(crossRes.status).toBe(404);
    // Crucial: Exact same error shape and message, no disclosure of ticket existence
    expect(crossRes.body.error).toEqual({
      code: "TICKET_NOT_FOUND",
      message: "Ticket not found.",
      retryable: false,
    });
    expect(crossRes.body.data).toBeUndefined();

    // 3. Malformed ticket ID returns 400
    const malformedRes = await request(app)
      .get("/api/tickets/abc")
      .set("x-requester-id", String(requesterAId));
    expect(malformedRes.status).toBe(400);
    expect(malformedRes.body.error.code).toBe("VALIDATION_ERROR");
  });
});
