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

const schemaName = `lab2_list_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;
let requesterAId: number;
let requesterBId: number;
let inactiveRequesterId: number;
let category1Id: number;
let category2Id: number;
let inactiveCategoryId: number;
let systemId: number;

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
  inactiveRequesterId = (await db.requesterUser.findFirstOrThrow({ where: { isActive: false } })).id;

  const categories = await db.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  category1Id = categories[0].id;
  category2Id = categories[1].id;
  inactiveCategoryId = (await db.category.create({ data: { id: 2001, name: "Inactive Test Cat", isActive: false } })).id;

  systemId = (await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

  // Seed sample tickets for Requester A
  const t1 = await db.ticket.create({
    data: {
      requesterId: requesterAId,
      categoryId: category1Id,
      relatedSystemId: systemId,
      summary: "Network VPN disconnects constantly",
      description: "VPN drops every 5 minutes when connecting from home.",
      requestedPriority: "HIGH",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2026-09-01T10:00:00Z"),
      updatedAt: new Date("2026-09-01T10:00:00Z"),
    },
  });

  const t2 = await db.ticket.create({
    data: {
      requesterId: requesterAId,
      categoryId: category2Id,
      relatedSystemId: systemId,
      summary: "Monitor screen flickering issue",
      description: "The second display flickers intermittently.",
      requestedPriority: "LOW",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2026-09-02T10:00:00Z"),
      updatedAt: new Date("2026-09-02T12:00:00Z"),
    },
  });

  const t3 = await db.ticket.create({
    data: {
      requesterId: requesterAId,
      categoryId: category1Id,
      relatedSystemId: systemId,
      summary: "Server access token expired",
      description: "Cannot access development server with current token.",
      requestedPriority: "CRITICAL",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2026-09-03T08:00:00Z"),
      updatedAt: new Date("2026-09-03T15:00:00Z"),
    },
  });

  // Attachments for t1 (1 active, 1 removed)
  await db.attachment.createMany({
    data: [
      {
        ticketId: t1.id,
        originalName: "vpn-log.txt",
        storedName: randomUUID(),
        mimeType: "text/plain",
        sizeBytes: 1024,
        isRemoved: false,
      },
      {
        ticketId: t1.id,
        originalName: "old-diagnostic.pdf",
        storedName: randomUUID(),
        mimeType: "application/pdf",
        sizeBytes: 2048,
        isRemoved: true,
        removalReason: "Superceded by newer logs",
        removedAt: new Date(),
        removedByRequesterId: requesterAId,
      },
    ],
  });

  // Seed sample ticket for Requester B
  await db.ticket.create({
    data: {
      requesterId: requesterBId,
      categoryId: category1Id,
      relatedSystemId: systemId,
      summary: "Requester B confidential ticket",
      description: "This should never be visible to Requester A.",
      requestedPriority: "MEDIUM",
      idempotencyKey: randomUUID(),
      createdAt: new Date("2026-09-04T09:00:00Z"),
      updatedAt: new Date("2026-09-04T09:00:00Z"),
    },
  });
}, 40000);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await db?.$disconnect();
  if (!/^lab2_list_test_[a-f0-9]{32}$/.test(schemaName)) throw new Error("Unsafe schema cleanup");
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
});

describe("GET /api/tickets - My Tickets API", () => {
  describe("API-LIST-01: Ownership scoping and context enforcement", () => {
    it("returns only tickets owned by Requester A", async () => {
      const res = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.totalItems).toBe(3);
      expect(res.body.data.every((t: any) => !t.summary.includes("Requester B"))).toBe(true);

      // Active attachment count should only count non-removed attachments
      const vpnTicket = res.body.data.find((t: any) => t.summary.includes("VPN"));
      expect(vpnTicket.activeAttachmentCount).toBe(1);
    });

    it("returns only tickets owned by Requester B", async () => {
      const res = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(requesterBId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary).toBe("Requester B confidential ticket");
      expect(res.body.pagination.totalItems).toBe(1);
    });

    it("rejects request without x-requester-id header with 400", async () => {
      const res = await request(app).get("/api/tickets");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("REQUESTER_CONTEXT_REQUIRED");
    });

    it("rejects inactive requester with 400", async () => {
      const res = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(inactiveRequesterId));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUESTER_CONTEXT");
    });
  });

  describe("API-LIST-02: Search and filtering", () => {
    it("filters tickets by case-insensitive partial summary match", async () => {
      const res = await request(app)
        .get("/api/tickets?search=flickering")
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary).toContain("flickering");
      expect(res.body.pagination.totalItems).toBe(1);
    });

    it("filters tickets by partial ticketNumber match", async () => {
      const listRes = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(requesterAId));
      const firstTicketNum = listRes.body.data[0].ticketNumber;
      const partialNum = firstTicketNum.slice(-5);

      const res = await request(app)
        .get(`/api/tickets?search=${partialNum}`)
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.ticketNumber === firstTicketNum)).toBe(true);
    });

    it("combines categoryId and requestedPriority filters", async () => {
      const res = await request(app)
        .get(`/api/tickets?categoryId=${category1Id}&requestedPriority=CRITICAL`)
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary).toContain("Server access token");
      expect(res.body.data[0].requestedPriority).toBe("CRITICAL");
    });

    it("rejects filter referencing inactive Category with 400", async () => {
      const res = await request(app)
        .get(`/api/tickets?categoryId=${inactiveCategoryId}`)
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_QUERY");
      expect(res.body.error.fields).toEqual(
        expect.arrayContaining([{ field: "categoryId", message: "Category does not exist or is inactive." }]),
      );
    });
  });

  describe("API-LIST-03: Sorting, pagination, boundaries, and validation", () => {
    it("sorts by updatedAt desc by default with ticketNumber desc secondary sort", async () => {
      const res = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].summary).toContain("Server access token"); // updated 15:00
      expect(res.body.data[1].summary).toContain("Monitor screen flickering"); // updated 12:00
      expect(res.body.data[2].summary).toContain("Network VPN"); // updated 10:00
    });

    it("sorts by requestedPriority desc (CRITICAL -> HIGH -> MEDIUM -> LOW)", async () => {
      const res = await request(app)
        .get("/api/tickets?sortBy=requestedPriority&sortOrder=desc")
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].requestedPriority).toBe("CRITICAL");
      expect(res.body.data[1].requestedPriority).toBe("HIGH");
      expect(res.body.data[2].requestedPriority).toBe("LOW");
    });

    it("paginates correctly with page and pageSize", async () => {
      const page1 = await request(app)
        .get("/api/tickets?page=1&pageSize=10")
        .set("x-requester-id", String(requesterAId));

      expect(page1.status).toBe(200);
      expect(page1.body.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 3,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });

      // Requesting page 2 when totalPages is 1 returns empty data with accurate metadata
      const page2 = await request(app)
        .get("/api/tickets?page=2&pageSize=10")
        .set("x-requester-id", String(requesterAId));

      expect(page2.status).toBe(200);
      expect(page2.body.data).toEqual([]);
      expect(page2.body.pagination.page).toBe(2);
      expect(page2.body.pagination.totalItems).toBe(3);
      expect(page2.body.pagination.totalPages).toBe(1);
    });

    it("rejects invalid page or pageSize with 400 Bad Request", async () => {
      const res1 = await request(app)
        .get("/api/tickets?page=0")
        .set("x-requester-id", String(requesterAId));
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe("INVALID_QUERY");

      const res2 = await request(app)
        .get("/api/tickets?pageSize=15")
        .set("x-requester-id", String(requesterAId));
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe("INVALID_QUERY");
    });

    it("rejects invalid sortBy or sortOrder with 400", async () => {
      const res = await request(app)
        .get("/api/tickets?sortBy=unknown&sortOrder=diagonal")
        .set("x-requester-id", String(requesterAId));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_QUERY");
    });
  });

  describe("API-LIST-04: Empty state vs no search results", () => {
    it("returns 200 with empty data when Requester owns 0 tickets", async () => {
      const activeRequesters = await db.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
      const requesterC = activeRequesters[2]; // owns 0 tickets

      const res = await request(app)
        .get("/api/tickets")
        .set("x-requester-id", String(requesterC.id));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.totalItems).toBe(0);
      expect(res.body.query.search).toBe("");
    });

    it("returns 200 with empty data and preserved query when search matches nothing", async () => {
      const res = await request(app)
        .get("/api/tickets?search=nonexistent-ticket-query-12345")
        .set("x-requester-id", String(requesterAId));

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.totalItems).toBe(0);
      expect(res.body.query.search).toBe("nonexistent-ticket-query-12345");
    });
  });

  describe("API-LIST-05: Unexpected database failure", () => {
    it("returns the documented safe list-failure response", async () => {
      const countSpy = vi.spyOn(db.ticket, "count").mockRejectedValueOnce(new Error("database unavailable"));

      try {
        const res = await request(app)
          .get("/api/tickets")
          .set("x-requester-id", String(requesterAId));

        expect(res.status).toBe(500);
        expect(res.body.error).toMatchObject({
          code: "TICKET_LIST_FAILED",
          retryable: true,
        });
      } finally {
        countSpy.mockRestore();
      }
    });
  });
});
