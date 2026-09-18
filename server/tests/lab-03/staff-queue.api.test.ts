import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { TicketPriority, TicketStatus } from "@prisma/client";

// Mock auth middleware to easily simulate different roles
vi.mock("../../src/auth.js", () => ({
  requireAuth: vi.fn((req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } });
      return;
    }
    if (!req.auth.user.isActive) {
      res.status(403).json({ error: { code: "ACCOUNT_INACTIVE", message: "This account cannot access the application." } });
      return;
    }
    if (req.auth.user.mustChangePassword) {
      res.status(403).json({ error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Change your password before using the application." } });
      return;
    }
    next();
  }),
}));

const mockPrisma = {
  ticket: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const { staffQueueRouter, requireStaff } = await import("../../src/staff-queue.js");

function createTestApp(role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR" | null = "IT_STAFF", userId = 10) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) {
      req.auth = {
        user: {
          id: userId,
          name: "Test User",
          email: "test@toktickit.local",
          role,
          isActive: true,
          mustChangePassword: false,
        } as never,
        sessionId: 1,
        csrfToken: "csrf-token",
      };
    }
    next();
  });
  app.use("/api/staff", staffQueueRouter);
  return app;
}

describe("API-QUEUE-01 & API-QUEUE-02: Staff Ticket Queue API", () => {
  it("enforces authentication and role authorization", async () => {
    const unauthApp = createTestApp(null);
    const resUnauth = await request(unauthApp).get("/api/staff/tickets");
    expect(resUnauth.status).toBe(401);
    expect(resUnauth.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const requesterApp = createTestApp("REQUESTER");
    const resRequester = await request(requesterApp).get("/api/staff/tickets");
    expect(resRequester.status).toBe(403);
    expect(resRequester.body.error.code).toBe("FORBIDDEN");
  });

  it("returns paginated ticket queue with default metadata for IT Staff and Administrator", async () => {
    const fakeTickets = [
      {
        id: 1,
        ticketNumber: "TKT-2026-000001",
        createdAt: new Date("2026-09-10T10:00:00Z"),
        updatedAt: new Date("2026-09-12T12:00:00Z"),
        summary: "VPN Connection Drop",
        requestedPriority: "HIGH" as TicketPriority,
        itPriority: "HIGH" as TicketPriority,
        currentStatus: "IN_PROGRESS" as TicketStatus,
        requesterResolutionIndicatedAt: null,
        requester: { id: 2, name: "Alice Requester", email: "alice@example.com" },
        category: { id: 3, name: "Network" },
        owner: { id: 10, name: "Bob Staff", email: "bob@example.com" },
      },
    ];

    mockPrisma.ticket.count.mockResolvedValue(1);
    mockPrisma.ticket.findMany.mockResolvedValue(fakeTickets);

    const app = createTestApp("IT_STAFF", 10);
    const res = await request(app).get("/api/staff/tickets");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 1,
      ticketNumber: "TKT-2026-000001",
      summary: "VPN Connection Drop",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      requester: { id: 2, name: "Alice Requester", email: "alice@example.com" },
      category: { id: 3, name: "Network" },
      owner: { id: 10, name: "Bob Staff", email: "bob@example.com" },
    });
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
    expect(res.body.query).toMatchObject({
      q: "",
      status: null,
      requestedPriority: null,
      itPriority: null,
      categoryId: null,
      owner: null,
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
  });

  it("handles search and combinable filters correctly", async () => {
    mockPrisma.ticket.count.mockReset();
    mockPrisma.ticket.findMany.mockReset();
    mockPrisma.ticket.count.mockResolvedValue(15);
    mockPrisma.ticket.findMany.mockResolvedValue([]);

    const app = createTestApp("ADMINISTRATOR", 99);
    const res = await request(app)
      .get("/api/staff/tickets")
      .query({
        q: "VPN",
        status: "OPEN",
        requestedPriority: "HIGH",
        itPriority: "MEDIUM",
        categoryId: "3",
        owner: "me",
        sortBy: "createdAt",
        sortDirection: "asc",
        page: "2",
        pageSize: "10",
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 15,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });

    // Check where clause passed to Prisma
    const whereArg = mockPrisma.ticket.findMany.mock.calls[0][0].where;
    expect(whereArg.currentStatus).toBe("OPEN");
    expect(whereArg.requestedPriority).toBe("HIGH");
    expect(whereArg.itPriority).toBe("MEDIUM");
    expect(whereArg.categoryId).toBe(3);
    expect(whereArg.ownerId).toBe(99);
    expect(whereArg.OR).toBeDefined();
  });

  it("returns 400 INVALID_QUERY for malformed query parameters", async () => {
    const app = createTestApp("IT_STAFF");

    const resUnknown = await request(app).get("/api/staff/tickets?bogus=yes");
    expect(resUnknown.status).toBe(400);
    expect(resUnknown.body.error.code).toBe("INVALID_QUERY");

    const resBadPage = await request(app).get("/api/staff/tickets?page=-5");
    expect(resBadPage.status).toBe(400);
    expect(resBadPage.body.error.code).toBe("INVALID_QUERY");

    const resBadPriority = await request(app).get("/api/staff/tickets?itPriority=SUPER");
    expect(resBadPriority.status).toBe(400);
    expect(resBadPriority.body.error.code).toBe("INVALID_QUERY");
  });

  it("provides GET /api/staff/assignees returning eligible staff and admin users", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 10, name: "Bob Staff", email: "bob@example.com", role: "IT_STAFF" },
      { id: 12, name: "Carol Admin", email: "carol@example.com", role: "ADMINISTRATOR" },
    ]);

    const app = createTestApp("IT_STAFF");
    const res = await request(app).get("/api/staff/assignees");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 10, name: "Bob Staff", email: "bob@example.com", role: "IT_STAFF" },
      { id: 12, name: "Carol Admin", email: "carol@example.com", role: "ADMINISTRATOR" },
    ]);
  });
});
