import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

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
    update: vi.fn(),
  },
  attachment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  publicComment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const { app } = await import("../../src/app.js");
const { createTicketRouter } = await import("../../src/create-ticket.js");
const { attachmentsRouter } = await import("../../src/attachments-router.js");

function createAuthApp(user: { id: number; name: string; role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"; isActive: boolean } | null = null, csrf = "test-csrf") {
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    if (user) {
      req.auth = {
        user: {
          ...user,
          email: "user@toktickit.local",
          normalizedEmail: "user@toktickit.local",
          department: "Testing",
          mustChangePassword: false,
          passwordChangedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never,
        sessionId: 1,
        csrfToken: csrf,
      };
    }
    next();
  });
  testApp.use("/api/tickets", createTicketRouter);
  testApp.use("/api/attachments", attachmentsRouter);
  return testApp;
}

describe("API-AUTHZ-02: Requester migration API surface and cross-requester protection", () => {
  it("removes the public Development Requester list", async () => {
    const response = await request(app).get("/api/requesters");
    expect(response.status).toBe(404);
  });

  it("does not advertise the legacy requester identity header in CORS", async () => {
    const response = await request(app)
      .options("/api/tickets")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "x-requester-id");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-headers"] ?? "").not.toMatch(/x-requester-id/i);
  });

  it("returns 401 AUTHENTICATION_REQUIRED for unauthenticated requests", async () => {
    const unauthApp = createAuthApp(null);

    const resList = await request(unauthApp).get("/api/tickets");
    expect(resList.status).toBe(401);
    expect(resList.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const resDetail = await request(unauthApp).get("/api/tickets/1");
    expect(resDetail.status).toBe(401);
    expect(resDetail.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const resComments = await request(unauthApp).get("/api/tickets/1/public-comments");
    expect(resComments.status).toBe(401);
    expect(resComments.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const resPostComment = await request(unauthApp).post("/api/tickets/1/public-comments").send({ content: "test" });
    expect(resPostComment.status).toBe(401);
    expect(resPostComment.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const resResolve = await request(unauthApp).post("/api/tickets/1/resolution-indication").send({ expectedUpdatedAt: new Date().toISOString() });
    expect(resResolve.status).toBe(401);
    expect(resResolve.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns safe 404 TICKET_NOT_FOUND when requester accesses another requester's ticket detail", async () => {
    const requesterA = { id: 10, name: "Requester A", role: "REQUESTER" as const, isActive: true };
    const authApp = createAuthApp(requesterA);

    // Mock ticket belonging to requester B (id: 20)
    mockPrisma.ticket.findFirst.mockResolvedValueOnce(null);

    const res = await request(authApp).get("/api/tickets/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TICKET_NOT_FOUND");
    // Verify query filtered by authenticated requesterId
    expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requesterId: 10 }),
      })
    );
  });

  it("returns safe 404 TICKET_NOT_FOUND for cross-requester public comments list and create", async () => {
    const requesterA = { id: 10, name: "Requester A", role: "REQUESTER" as const, isActive: true };
    const authApp = createAuthApp(requesterA);

    // Ticket exists but belongs to requester B (id: 20)
    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 50, requesterId: 20 });

    const getRes = await request(authApp).get("/api/tickets/50/public-comments");
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe("TICKET_NOT_FOUND");

    const postRes = await request(authApp)
      .post("/api/tickets/50/public-comments")
      .set("X-CSRF-Token", "test-csrf")
      .send({ content: "Unauthorized comment" });
    expect(postRes.status).toBe(404);
    expect(postRes.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("returns safe 404 TICKET_NOT_FOUND for cross-requester resolution indication", async () => {
    const requesterA = { id: 10, name: "Requester A", role: "REQUESTER" as const, isActive: true };
    const authApp = createAuthApp(requesterA);

    // Ticket belonging to Requester B, so findFirst with requesterId: 10 returns null
    mockPrisma.ticket.findFirst.mockResolvedValueOnce(null);

    const res = await request(authApp)
      .post("/api/tickets/50/resolution-indication")
      .set("X-CSRF-Token", "test-csrf")
      .send({ expectedUpdatedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("returns safe 404 ATTACHMENT_NOT_FOUND for cross-requester attachment download and removal", async () => {
    const requesterA = { id: 10, name: "Requester A", role: "REQUESTER" as const, isActive: true };
    const authApp = createAuthApp(requesterA);

    // Mock attachment owned by requester B
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    const downloadRes = await request(authApp).get("/api/attachments/100/download");
    expect(downloadRes.status).toBe(404);
    expect(downloadRes.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    const deleteRes = await request(authApp)
      .delete("/api/attachments/100")
      .set("X-CSRF-Token", "test-csrf")
      .send({ reason: "Removal of attachment" });
    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body.error.code).toBe("ATTACHMENT_NOT_FOUND");
  });
});
