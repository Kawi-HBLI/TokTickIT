import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TicketPriority, TicketStatus } from "@prisma/client";

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
  requireCsrf: vi.fn((req, res, next) => {
    const token = req.get("X-CSRF-Token");
    if (!token || token !== "csrf-token") {
      res.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is missing or invalid." } });
      return;
    }
    next();
  }),
}));

const mockPrisma = {
  ticket: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  internalNote: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  attachment: {
    findUnique: vi.fn(),
  },
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const { staffQueueRouter } = await import("../../src/staff-queue.js");
const { attachmentsRouter } = await import("../../src/attachments-router.js");

function createTestApp(role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR" | null = "IT_STAFF", userId = 10) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) {
      req.auth = {
        user: {
          id: userId,
          name: "Test Staff",
          email: "staff@toktickit.local",
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
  app.use("/api/attachments", attachmentsRouter);
  return app;
}

describe("API-DETAIL-01, API-OPS-01, API-OPS-02: Staff Ticket Detail & Operations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API-DETAIL-01: Staff Ticket Detail", () => {
    it("enforces authentication and staff role authorization", async () => {
      const unauthApp = createTestApp(null);
      const resUnauth = await request(unauthApp).get("/api/staff/tickets/1");
      expect(resUnauth.status).toBe(401);
      expect(resUnauth.body.error.code).toBe("AUTHENTICATION_REQUIRED");

      const reqApp = createTestApp("REQUESTER");
      const resReq = await request(reqApp).get("/api/staff/tickets/1");
      expect(resReq.status).toBe(403);
      expect(resReq.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when ticket is not found", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);
      const app = createTestApp("IT_STAFF");
      const res = await request(app).get("/api/staff/tickets/999");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("TICKET_NOT_FOUND");
    });

    it("returns complete operational ticket detail with public comments, internal notes, and attachments", async () => {
      const updatedAt = new Date("2026-09-12T10:00:00.000Z");
      const mockTicket = {
        id: 1,
        ticketNumber: "TKT-2026-000001",
        createdAt: new Date("2026-09-10T08:00:00.000Z"),
        updatedAt,
        summary: "VPN is broken",
        description: "Cannot connect to VPN from home.",
        category: { id: 2, name: "Network" },
        relatedSystem: { id: 3, name: "GlobalProtect" },
        requester: { id: 5, name: "Amina Rahman", email: "amina@example.com" },
        owner: { id: 10, name: "Ethan Brooks", email: "ethan@example.com" },
        requestedPriority: "HIGH" as TicketPriority,
        itPriority: "CRITICAL" as TicketPriority,
        currentStatus: "IN_PROGRESS" as TicketStatus,
        requesterResolutionIndicatedAt: new Date("2026-09-11T12:00:00.000Z"),
        requesterResolutionIndicatedBy: { id: 5, name: "Amina Rahman" },
        publicComments: [
          {
            id: 1,
            content: "We are checking server logs.",
            createdAt: new Date("2026-09-10T09:00:00.000Z"),
            author: { id: 10, name: "Ethan Brooks", role: "IT_STAFF" },
          },
        ],
        internalNotes: [
          {
            id: 1,
            content: "Server node 4 had gateway timeout.",
            createdAt: new Date("2026-09-10T09:05:00.000Z"),
            author: { id: 10, name: "Ethan Brooks", role: "IT_STAFF" },
          },
        ],
        attachments: [
          {
            id: 1,
            originalName: "error.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            createdAt: new Date("2026-09-10T08:01:00.000Z"),
            isRemoved: false,
            removalReason: null,
            removedAt: null,
          },
        ],
      };

      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      const app = createTestApp("IT_STAFF");
      const res = await request(app).get("/api/staff/tickets/1");

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.ticketNumber).toBe("TKT-2026-000001");
      expect(res.body.data.requestedPriority).toBe("HIGH");
      expect(res.body.data.itPriority).toBe("CRITICAL");
      expect(res.body.data.currentStatus).toBe("IN_PROGRESS");
      expect(res.body.data.requesterResolutionIndicatedAt).toBe("2026-09-11T12:00:00.000Z");
      expect(res.body.data.requesterResolutionIndicatedBy.name).toBe("Amina Rahman");
      expect(res.body.data.publicComments).toHaveLength(1);
      expect(res.body.data.internalNotes).toHaveLength(1);
      expect(res.body.data.attachments).toHaveLength(1);
    });
  });

  describe("API-OPS-01: Claim, Owner Assignment, and IT Priority", () => {
    it("claims an unassigned ticket atomically", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, ownerId: null });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        owner: { id: 10, name: "Test Staff", email: "staff@toktickit.local" },
        updatedAt: new Date("2026-09-12T12:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF", 10);
      const res = await request(app)
        .post("/api/staff/tickets/1/claim")
        .set("X-CSRF-Token", "csrf-token");

      expect(res.status).toBe(200);
      expect(res.body.data.owner.id).toBe(10);
      expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 1, ownerId: null },
        data: { ownerId: 10 },
      });
    });

    it("rejects claim when ticket is already assigned (409 Conflict)", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, ownerId: 8 });
      const app = createTestApp("IT_STAFF", 10);
      const res = await request(app)
        .post("/api/staff/tickets/1/claim")
        .set("X-CSRF-Token", "csrf-token");

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");
    });

    it("updates ticket owner with optimistic concurrency and valid assignee", async () => {
      const expectedUpdatedAt = "2026-09-12T10:00:00.000Z";
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 12,
        name: "Marcus Vance",
        email: "marcus@example.com",
        role: "IT_STAFF",
        isActive: true,
      });
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        updatedAt: new Date(expectedUpdatedAt),
      });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        owner: { id: 12, name: "Marcus Vance", email: "marcus@example.com" },
        updatedAt: new Date("2026-09-12T11:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/owner")
        .set("X-CSRF-Token", "csrf-token")
        .send({ ownerId: 12, expectedUpdatedAt });

      expect(res.status).toBe(200);
      expect(res.body.data.owner.id).toBe(12);
    });

    it("rejects owner assignment to an ineligible assignee (Requester or inactive)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 5,
        name: "Requester User",
        email: "req@example.com",
        role: "REQUESTER",
        isActive: true,
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/owner")
        .set("X-CSRF-Token", "csrf-token")
        .send({ ownerId: 5, expectedUpdatedAt: "2026-09-12T10:00:00.000Z" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ASSIGNEE_NOT_ELIGIBLE");
    });

    it("rejects owner assignment on version conflict (409)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 12,
        role: "IT_STAFF",
        isActive: true,
      });
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        updatedAt: new Date("2026-09-12T11:00:00.000Z"), // Different from expected
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/owner")
        .set("X-CSRF-Token", "csrf-token")
        .send({ ownerId: 12, expectedUpdatedAt: "2026-09-12T10:00:00.000Z" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TICKET_VERSION_CONFLICT");
    });

    it("updates IT priority without changing requested priority", async () => {
      const expectedUpdatedAt = "2026-09-12T10:00:00.000Z";
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        updatedAt: new Date(expectedUpdatedAt),
        requestedPriority: "MEDIUM",
      });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        requestedPriority: "MEDIUM",
        itPriority: "CRITICAL",
        updatedAt: new Date("2026-09-12T11:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/priority")
        .set("X-CSRF-Token", "csrf-token")
        .send({ itPriority: "CRITICAL", expectedUpdatedAt });

      expect(res.status).toBe(200);
      expect(res.body.data.requestedPriority).toBe("MEDIUM");
      expect(res.body.data.itPriority).toBe("CRITICAL");
    });

    it("rejects attempt to mutate requested priority via priority endpoint", async () => {
      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/priority")
        .set("X-CSRF-Token", "csrf-token")
        .send({
          itPriority: "HIGH",
          requestedPriority: "LOW",
          expectedUpdatedAt: "2026-09-12T10:00:00.000Z",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toContain("Requested Priority cannot be changed");
    });
  });

  describe("API-OPS-02: Status Transitions & Indication Clearing", () => {
    it("updates ticket status according to transition matrix", async () => {
      const expectedUpdatedAt = "2026-09-12T10:00:00.000Z";
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        currentStatus: "NEW",
        updatedAt: new Date(expectedUpdatedAt),
      });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        currentStatus: "IN_PROGRESS",
        requesterResolutionIndicatedAt: null,
        requesterResolutionIndicatedBy: null,
        updatedAt: new Date("2026-09-12T11:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/status")
        .set("X-CSRF-Token", "csrf-token")
        .send({ status: "IN_PROGRESS", expectedUpdatedAt });

      expect(res.status).toBe(200);
      expect(res.body.data.previousStatus).toBe("NEW");
      expect(res.body.data.currentStatus).toBe("IN_PROGRESS");
    });

    it("rejects invalid status transition (409 INVALID_STATUS_TRANSITION)", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        currentStatus: "NEW",
        updatedAt: new Date("2026-09-12T10:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF");
      // NEW -> RESOLVED is not allowed by the matrix
      const res = await request(app)
        .patch("/api/staff/tickets/1/status")
        .set("X-CSRF-Token", "csrf-token")
        .send({ status: "RESOLVED", expectedUpdatedAt: "2026-09-12T10:00:00.000Z" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("clears resolution indication atomically when transitioning to RESOLVED", async () => {
      const expectedUpdatedAt = "2026-09-12T10:00:00.000Z";
      mockPrisma.ticket.findUnique.mockResolvedValue({
        id: 1,
        currentStatus: "IN_PROGRESS",
        updatedAt: new Date(expectedUpdatedAt),
      });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        currentStatus: "RESOLVED",
        requesterResolutionIndicatedAt: null,
        requesterResolutionIndicatedBy: null,
        updatedAt: new Date("2026-09-12T11:00:00.000Z"),
      });

      const app = createTestApp("IT_STAFF");
      const res = await request(app)
        .patch("/api/staff/tickets/1/status")
        .set("X-CSRF-Token", "csrf-token")
        .send({ status: "RESOLVED", expectedUpdatedAt });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStatus).toBe("RESOLVED");
      expect(res.body.data.requesterResolutionIndicatedAt).toBeNull();
      expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStatus: "RESOLVED",
            requesterResolutionIndicatedAt: null,
            requesterResolutionIndicatedById: null,
          }),
        })
      );
    });
  });
});
