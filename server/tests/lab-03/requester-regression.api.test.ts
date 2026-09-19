import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth.js")>();
  return {
    ...actual,
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
      if (req.get("X-CSRF-Token") !== req.auth?.csrfToken) {
        res.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is missing or invalid." } });
        return;
      }
      next();
    }),
  };
});

const mockPrisma = {
  ticket: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
  },
  attachment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  publicComment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const { createTicketRouter } = await import("../../src/create-ticket.js");

function createRequesterApp(requesterId = 15, csrf = "valid-csrf") {
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    req.auth = {
      user: {
        id: requesterId,
        name: "Test Requester",
        email: "requester@toktickit.local",
        normalizedEmail: "requester@toktickit.local",
        role: "REQUESTER",
        department: "Engineering",
        isActive: true,
        mustChangePassword: false,
        passwordChangedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      sessionId: 1,
      csrfToken: csrf,
    };
    next();
  });
  testApp.use("/api/tickets", createTicketRouter);
  return testApp;
}

describe("API-REQ-01 & API-REQ-02: Requester Workflow Regression and Discussion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("API-REQ-01: retrieves owned tickets list with search, filter, and pagination", async () => {
    const app = createRequesterApp(15);

    mockPrisma.ticket.count.mockResolvedValue(1);
    mockPrisma.ticket.findMany.mockResolvedValue([
      {
        id: 101,
        ticketNumber: "TKT-2026-000101",
        summary: "Cannot access internal VPN",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
        createdAt: new Date("2026-09-12T08:00:00.000Z"),
        updatedAt: new Date("2026-09-12T08:00:00.000Z"),
        category: { id: 1, name: "Network" },
        relatedSystem: { id: 2, name: "VPN Gateway" },
        _count: { attachments: 2 },
      },
    ]);

    const res = await request(app).get("/api/tickets?page=1&pageSize=10");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].ticketNumber).toBe("TKT-2026-000101");
    expect(res.body.pagination.totalItems).toBe(1);

    // Verify filter strictly bounded by authenticated requesterId (15)
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requesterId: 15 }),
      })
    );
  });

  it("API-REQ-01: retrieves owned ticket detail including resolution indication and attachments", async () => {
    const app = createRequesterApp(15);

    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: 101,
      ticketNumber: "TKT-2026-000101",
      summary: "Cannot access internal VPN",
      description: "Getting timeout on VPN client connection.",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      ticketOwner: null,
      requesterResolutionIndicatedAt: new Date("2026-09-12T10:00:00.000Z"),
      requesterResolutionIndicatedById: 15,
      createdAt: new Date("2026-09-12T08:00:00.000Z"),
      updatedAt: new Date("2026-09-12T10:00:00.000Z"),
      requester: { id: 15, name: "Test Requester", email: "requester@toktickit.local", department: "Engineering" },
      owner: { id: 5, name: "IT Staff Member", email: "staff@toktickit.local" },
      requesterResolutionIndicatedBy: { id: 15, name: "Test Requester" },
      category: { id: 1, name: "Network" },
      relatedSystem: { id: 2, name: "VPN Gateway" },
      attachments: [
        {
          id: 1,
          originalName: "error-log.txt",
          mimeType: "text/plain",
          sizeBytes: 1024,
          isRemoved: false,
          createdAt: new Date("2026-09-12T08:05:00.000Z"),
          removedAt: null,
          removalReason: null,
        },
      ],
    });

    const res = await request(app).get("/api/tickets/101");
    expect(res.status).toBe(200);
    expect(res.body.data.ticketNumber).toBe("TKT-2026-000101");
    expect(res.body.data.ticketOwner).toBe("IT Staff Member");
    expect(res.body.data.requesterResolutionIndicatedAt).toBe("2026-09-12T10:00:00.000Z");
    expect(res.body.data.requesterResolutionIndicatedBy).toEqual({ id: 15, name: "Test Requester" });
    expect(res.body.data.attachments).toHaveLength(1);
  });

  it("API-REQ-01: lists public comments in ascending order", async () => {
    const app = createRequesterApp(15);

    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 101, requesterId: 15 });
    mockPrisma.publicComment.findMany.mockResolvedValue([
      {
        id: 1,
        ticketId: 101,
        content: "First comment from user",
        createdAt: new Date("2026-09-12T08:10:00.000Z"),
        author: { id: 15, name: "Test Requester", role: "REQUESTER" },
      },
      {
        id: 2,
        ticketId: 101,
        content: "We are investigating the issue.",
        createdAt: new Date("2026-09-12T08:30:00.000Z"),
        author: { id: 5, name: "IT Staff Member", role: "IT_STAFF" },
      },
    ]);

    const res = await request(app).get("/api/tickets/101/public-comments");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(1);
    expect(res.body.data[1].id).toBe(2);
    expect(res.body.meta.count).toBe(2);
  });

  it("API-REQ-01: creates a public comment with trimmed content and CSRF", async () => {
    const app = createRequesterApp(15);

    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 101, requesterId: 15 });
    mockPrisma.publicComment.create.mockResolvedValue({
      id: 3,
      ticketId: 101,
      content: "Issue still persists after reboot.",
      createdAt: new Date("2026-09-12T09:00:00.000Z"),
      author: { id: 15, name: "Test Requester", role: "REQUESTER" },
    });

    const res = await request(app)
      .post("/api/tickets/101/public-comments")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ content: "  Issue still persists after reboot.  " });

    expect(res.status).toBe(201);
    expect(res.header.location).toBe("/api/tickets/101/public-comments/3");
    expect(res.body.data.content).toBe("Issue still persists after reboot.");
    expect(mockPrisma.publicComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: 101,
          authorId: 15,
          content: "Issue still persists after reboot.",
        }),
      })
    );
  });

  it("API-REQ-01: rejects empty or whitespace-only comments with 400 VALIDATION_ERROR", async () => {
    const app = createRequesterApp(15);

    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 101, requesterId: 15 });

    const res = await request(app)
      .post("/api/tickets/101/public-comments")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ content: "     " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("API-REQ-01: indicates problem resolved on eligible status with expectedUpdatedAt", async () => {
    const app = createRequesterApp(15);
    const updatedAt = new Date("2026-09-12T08:00:00.000Z");

    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: 101,
      requesterId: 15,
      currentStatus: "IN_PROGRESS",
      updatedAt,
      requesterResolutionIndicatedAt: null,
      requesterResolutionIndicatedBy: null,
    });

    mockPrisma.ticket.update.mockResolvedValue({
      id: 101,
      currentStatus: "IN_PROGRESS",
      requesterResolutionIndicatedAt: new Date("2026-09-12T08:15:00.000Z"),
      requesterResolutionIndicatedBy: { id: 15, name: "Test Requester" },
    });

    const res = await request(app)
      .post("/api/tickets/101/resolution-indication")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ expectedUpdatedAt: updatedAt.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.data.indicatedAt).toBe("2026-09-12T08:15:00.000Z");
    expect(res.body.data.indicatedBy).toEqual({ id: 15, name: "Test Requester" });
    expect(res.body.data.currentStatus).toBe("IN_PROGRESS");
  });

  it("API-REQ-01: returns 409 TICKET_VERSION_CONFLICT when expectedUpdatedAt is stale", async () => {
    const app = createRequesterApp(15);
    const currentUpdatedAt = new Date("2026-09-12T09:00:00.000Z");
    const staleUpdatedAt = new Date("2026-09-12T08:00:00.000Z");

    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: 101,
      requesterId: 15,
      currentStatus: "IN_PROGRESS",
      updatedAt: currentUpdatedAt,
      requesterResolutionIndicatedAt: null,
      requesterResolutionIndicatedBy: null,
    });

    const res = await request(app)
      .post("/api/tickets/101/resolution-indication")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ expectedUpdatedAt: staleUpdatedAt.toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_VERSION_CONFLICT");
  });

  it("API-REQ-01: returns 409 RESOLUTION_INDICATION_NOT_ALLOWED for ineligible status", async () => {
    const app = createRequesterApp(15);
    const updatedAt = new Date("2026-09-12T08:00:00.000Z");

    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: 101,
      requesterId: 15,
      currentStatus: "RESOLVED",
      updatedAt,
      requesterResolutionIndicatedAt: null,
      requesterResolutionIndicatedBy: null,
    });

    const res = await request(app)
      .post("/api/tickets/101/resolution-indication")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ expectedUpdatedAt: updatedAt.toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_INDICATION_NOT_ALLOWED");
  });

  it("API-REQ-01: is idempotent when resolution indication was already recorded", async () => {
    const app = createRequesterApp(15);
    const updatedAt = new Date("2026-09-12T08:00:00.000Z");
    const indicatedAt = new Date("2026-09-12T08:15:00.000Z");

    mockPrisma.ticket.findFirst.mockResolvedValue({
      id: 101,
      requesterId: 15,
      currentStatus: "IN_PROGRESS",
      updatedAt,
      requesterResolutionIndicatedAt: indicatedAt,
      requesterResolutionIndicatedBy: { id: 15, name: "Test Requester" },
    });

    const res = await request(app)
      .post("/api/tickets/101/resolution-indication")
      .set("X-CSRF-Token", "valid-csrf")
      .send({ expectedUpdatedAt: updatedAt.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.data.indicatedAt).toBe(indicatedAt.toISOString());
    // update is not called repeatedly
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });
});
