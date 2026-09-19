import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

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
  },
  publicComment: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  internalNote: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

const { createTicketRouter } = await import("../../src/create-ticket.js");
const { staffQueueRouter } = await import("../../src/staff-queue.js");

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
  app.use("/api/tickets", createTicketRouter);
  app.use("/api/staff", staffQueueRouter);
  return app;
}

describe("API-DISC-01 & API-DISC-02: Public Comments & Internal Notes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API-DISC-01: Public Comments", () => {
    it("allows IT Staff and Administrator to list public comments", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, requesterId: 5 });
      mockPrisma.publicComment.findMany.mockResolvedValue([
        {
          id: 1,
          content: "First public comment",
          createdAt: new Date("2026-09-12T08:00:00.000Z"),
          author: { id: 5, name: "Requester Name", role: "REQUESTER" },
        },
      ]);

      const staffApp = createTestApp("IT_STAFF", 10);
      const res = await request(staffApp).get("/api/tickets/1/public-comments");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe("First public comment");
    });

    it("allows IT Staff to create a public comment", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1, requesterId: 5 });
      mockPrisma.publicComment.create.mockResolvedValue({
        id: 2,
        ticketId: 1,
        authorId: 10,
        content: "Staff reply to user",
        createdAt: new Date("2026-09-12T09:00:00.000Z"),
        author: { id: 10, name: "Test Staff", role: "IT_STAFF" },
      });

      const staffApp = createTestApp("IT_STAFF", 10);
      const res = await request(staffApp)
        .post("/api/tickets/1/public-comments")
        .set("X-CSRF-Token", "csrf-token")
        .send({ content: "Staff reply to user" });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe("Staff reply to user");
      expect(res.body.data.author.role).toBe("IT_STAFF");
    });
  });

  describe("API-DISC-02: Internal Notes", () => {
    it("rejects Requester access to Internal Notes with 403 FORBIDDEN", async () => {
      const reqApp = createTestApp("REQUESTER", 5);
      const resGet = await request(reqApp).get("/api/staff/tickets/1/internal-notes");
      expect(resGet.status).toBe(403);
      expect(resGet.body.error.code).toBe("FORBIDDEN");

      const resPost = await request(reqApp)
        .post("/api/staff/tickets/1/internal-notes")
        .set("X-CSRF-Token", "csrf-token")
        .send({ content: "Sneaky internal note" });
      expect(resPost.status).toBe(403);
      expect(resPost.body.error.code).toBe("FORBIDDEN");
    });

    it("allows IT Staff to create an Internal Note", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.internalNote.create.mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: 10,
        content: "Investigating database locks.",
        createdAt: new Date("2026-09-12T10:00:00.000Z"),
        author: { id: 10, name: "Test Staff", role: "IT_STAFF" },
      });

      const staffApp = createTestApp("IT_STAFF", 10);
      const res = await request(staffApp)
        .post("/api/staff/tickets/1/internal-notes")
        .set("X-CSRF-Token", "csrf-token")
        .send({ content: "Investigating database locks." });

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe("/api/staff/tickets/1/internal-notes/1");
      expect(res.body.data.content).toBe("Investigating database locks.");
      expect(res.body.data.author.role).toBe("IT_STAFF");
    });

    it("validates internal note length (1 to 4000 characters)", async () => {
      const staffApp = createTestApp("IT_STAFF", 10);

      const resEmpty = await request(staffApp)
        .post("/api/staff/tickets/1/internal-notes")
        .set("X-CSRF-Token", "csrf-token")
        .send({ content: "   " });
      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error.code).toBe("VALIDATION_ERROR");

      const resTooLong = await request(staffApp)
        .post("/api/staff/tickets/1/internal-notes")
        .set("X-CSRF-Token", "csrf-token")
        .send({ content: "x".repeat(4001) });
      expect(resTooLong.status).toBe(400);
      expect(resTooLong.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows IT Staff to list internal notes", async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.internalNote.findMany.mockResolvedValue([
        {
          id: 1,
          content: "Investigating database locks.",
          createdAt: new Date("2026-09-12T10:00:00.000Z"),
          author: { id: 10, name: "Test Staff", role: "IT_STAFF" },
        },
      ]);

      const staffApp = createTestApp("IT_STAFF", 10);
      const res = await request(staffApp).get("/api/staff/tickets/1/internal-notes");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.count).toBe(1);
    });
  });
});
