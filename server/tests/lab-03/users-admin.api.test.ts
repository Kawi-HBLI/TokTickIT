import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

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
    next();
  }),
  requireCsrf: vi.fn((req, res, next) => {
    const token = req.get("X-CSRF-Token");
    if (!token || token !== "mock-csrf-token") {
      res.status(403).json({ error: { code: "CSRF_INVALID", message: "The security token is missing or invalid." } });
      return;
    }
    next();
  }),
}));

const mockPrisma = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
  ticket: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $executeRaw: vi.fn().mockResolvedValue(1),
  $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock("../../src/auth-crypto.js", () => ({
  INITIAL_PASSWORD: "ChangeMe-2026!",
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  validatePassword: (pw: unknown, normalizedEmail?: string) => {
    if (typeof pw !== "string" || pw.trim().length === 0) return "Password is required.";
    if (pw.length < 12 || pw.length > 72) return "Password must contain 12-72 characters.";
    if (normalizedEmail && pw.toLowerCase() === normalizedEmail.toLowerCase()) return "Password must not equal email.";
    return null;
  },
  hashPassword: vi.fn(async (pw: string) => `scrypt$mockhash$${pw}`),
}));

import { adminUsersRouter } from "../../src/admin-users.js";

const adminUser = {
  id: 1,
  name: "Harper Morgan",
  email: "harper.morgan@toktickit.local",
  role: "ADMINISTRATOR" as UserRole,
  isActive: true,
  mustChangePassword: false,
};

const staffUser = {
  id: 2,
  name: "Marcus IT",
  email: "marcus@toktickit.local",
  role: "IT_STAFF" as UserRole,
  isActive: true,
  mustChangePassword: false,
};

function createTestApp(authContextUser: typeof adminUser | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authContextUser) {
      req.auth = {
        user: { ...authContextUser, createdAt: new Date(), updatedAt: new Date() } as any,
        sessionId: 1,
        csrfToken: "mock-csrf-token",
      };
    }
    next();
  });
  app.use("/api/admin/users", adminUsersRouter);
  return app;
}

describe("API-USER-01: User Listing and Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.ticket.updateMany.mockResolvedValue({ count: 0 });
  });

  it("lists users ordered by name then email with search and role filter", async () => {
    const app = createTestApp(adminUser);
    const mockUsers = [
      {
        id: 1,
        name: "Harper Morgan",
        email: "harper.morgan@toktickit.local",
        role: "ADMINISTRATOR" as UserRole,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ];
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);

    const res = await request(app)
      .get("/api/admin/users")
      .query({ q: "harper", role: "ADMINISTRATOR" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Harper Morgan");
    expect(res.body.data[0]).not.toHaveProperty("department");
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: "harper", mode: "insensitive" } },
              { email: { contains: "harper", mode: "insensitive" } },
            ],
          },
          { role: "ADMINISTRATOR" },
        ],
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: expect.any(Object),
    });
  });

  it("rejects unknown query parameters with 400 INVALID_QUERY", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .get("/api/admin/users")
      .query({ unknownParam: "test" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_QUERY");
  });

  it("rejects invalid role query parameter with 400 INVALID_QUERY", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .get("/api/admin/users")
      .query({ role: "SUPERUSER" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_QUERY");
  });

  it("creates user with administrator-provided initial password, returns 201 with Location header", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue(null); // No email conflict
    mockPrisma.user.create.mockResolvedValue({
      id: 10,
      name: "Daniel Craig",
      email: "daniel.craig@toktickit.local",
      role: "IT_STAFF" as UserRole,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
      updatedAt: new Date("2026-09-19T10:00:00.000Z"),
    });

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Daniel Craig",
        email: "daniel.craig@toktickit.local",
        role: "IT_STAFF",
        isActive: true,
        initialPassword: "AdminCustom-Pass-2026!",
      });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe("/api/admin/users/10");
    expect(res.body.data.name).toBe("Daniel Craig");
    expect(res.body.data.role).toBe("IT_STAFF");
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.data).not.toHaveProperty("password");
    expect(res.body.data).not.toHaveProperty("department");

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "Daniel Craig",
        email: "daniel.craig@toktickit.local",
        normalizedEmail: "daniel.craig@toktickit.local",
        role: "IT_STAFF",
        isActive: true,
        passwordHash: expect.stringContaining("scrypt$mockhash$AdminCustom-Pass-2026!"),
        mustChangePassword: true,
        passwordChangedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it("rejects duplicate email with 409 Conflict", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 5 });

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Duplicate User",
        email: "existing@toktickit.local",
        role: "REQUESTER",
        isActive: true,
        initialPassword: "AdminCustom-Pass-2026!",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects unknown body fields with 400 Validation Error", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "New User",
        email: "new@toktickit.local",
        role: "REQUESTER",
        isActive: true,
        initialPassword: "Valid-Password-123!",
        department: "Finance", // Department is out of scope and rejected
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-boolean isActive with 400 Validation Error", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Test User",
        email: "test.user@toktickit.local",
        role: "REQUESTER",
        isActive: "false",
        initialPassword: "Valid-Password-123!",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toHaveProperty("isActive");
  });

  it("rejects password shorter than 12 characters with 400 Validation Error", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Short Pw User",
        email: "short@toktickit.local",
        role: "REQUESTER",
        isActive: true,
        initialPassword: "short",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toHaveProperty("initialPassword");
  });
});

describe("API-USER-02: User Modification, Safety Invariants, and Ticket Unassignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.ticket.updateMany.mockResolvedValue({ count: 0 });
  });

  it("rejects non-administrators with 403 Forbidden", async () => {
    const app = createTestApp(staffUser);

    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("updates user, checks optimistic lock, and unassigns tickets on deactivation", async () => {
    const app = createTestApp(adminUser);
    const existingStaff = {
      id: 5,
      name: "Old Staff",
      email: "old.staff@toktickit.local",
      role: "IT_STAFF" as UserRole,
      isActive: true,
      updatedAt: new Date("2026-09-12T08:00:00.000Z"),
    };
    mockPrisma.user.findUnique.mockResolvedValue(existingStaff);
    mockPrisma.ticket.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.user.update.mockResolvedValue({
      ...existingStaff,
      name: "Updated Staff",
      isActive: false,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-13T09:00:00.000Z"),
      mustChangePassword: false,
    });

    const res = await request(app)
      .patch("/api/admin/users/5")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Updated Staff",
        isActive: false,
        expectedUpdatedAt: "2026-09-12T08:00:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Staff");
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.unassignedTicketCount).toBe(3);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 5 },
      data: { ownerId: null },
    });
  });

  it("unassigns owned tickets when role changes to REQUESTER", async () => {
    const app = createTestApp(adminUser);
    const existingStaff = {
      id: 6,
      name: "Staff Person",
      email: "staff.person@toktickit.local",
      role: "IT_STAFF" as UserRole,
      isActive: true,
      updatedAt: new Date("2026-09-12T08:00:00.000Z"),
    };
    mockPrisma.user.findUnique.mockResolvedValue(existingStaff);
    mockPrisma.ticket.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.user.update.mockResolvedValue({
      ...existingStaff,
      role: "REQUESTER",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-13T09:00:00.000Z"),
      mustChangePassword: false,
    });

    const res = await request(app)
      .patch("/api/admin/users/6")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        role: "REQUESTER",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("REQUESTER");
    expect(res.body.unassignedTicketCount).toBe(2);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 6 } });
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 6 },
      data: { ownerId: null },
    });
  });

  it("returns 409 USER_VERSION_CONFLICT when expectedUpdatedAt does not match", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 5,
      name: "Staff",
      email: "staff@toktickit.local",
      role: "IT_STAFF",
      isActive: true,
      updatedAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    const res = await request(app)
      .patch("/api/admin/users/5")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Conflicted Name",
        expectedUpdatedAt: "2026-09-12T00:00:00.000Z",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_VERSION_CONFLICT");
  });

  it("prevents an Administrator from deactivating their own account with 409 SELF_DEACTIVATION_FORBIDDEN", async () => {
    const app = createTestApp(adminUser); // id: 1
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      name: "Harper Morgan",
      email: "harper.morgan@toktickit.local",
      role: "ADMINISTRATOR",
      isActive: true,
      updatedAt: new Date(),
    });

    const res = await request(app)
      .patch("/api/admin/users/1")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        isActive: false,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_DEACTIVATION_FORBIDDEN");
  });

  it("prevents deactivating or demoting the last active Administrator with 409 LAST_ACTIVE_ADMIN_REQUIRED", async () => {
    const app = createTestApp(adminUser);
    const otherAdmin = {
      id: 99,
      name: "Second Admin",
      email: "second.admin@toktickit.local",
      role: "ADMINISTRATOR" as UserRole,
      isActive: true,
      updatedAt: new Date(),
    };
    mockPrisma.user.findUnique.mockResolvedValue(otherAdmin);
    mockPrisma.user.count.mockResolvedValue(1); // Only 1 active administrator exists!

    const res = await request(app)
      .patch("/api/admin/users/99")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        isActive: false,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_ACTIVE_ADMIN_REQUIRED");
  });

  it("allows self-demotion when another active Administrator exists", async () => {
    const app = createTestApp(adminUser); // id: 1
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      name: "Harper Morgan",
      email: "harper.morgan@toktickit.local",
      role: "ADMINISTRATOR" as UserRole,
      isActive: true,
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    mockPrisma.user.count.mockResolvedValue(2); // 2 active admins exist!
    mockPrisma.user.update.mockResolvedValue({
      id: 1,
      name: "Harper Morgan",
      email: "harper.morgan@toktickit.local",
      role: "IT_STAFF" as UserRole,
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-18T00:00:00.000Z"),
    });

    const res = await request(app)
      .patch("/api/admin/users/1")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        role: "IT_STAFF",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("IT_STAFF");
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
  });
});

describe("API-USER-03: Initial Password Reset Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
  });

  it("sets initial password at POST /api/admin/users/:id/initial-password, revokes sessions and sets mustChangePassword", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 8,
      name: "Target User",
      email: "target.user@toktickit.local",
      normalizedEmail: "target.user@toktickit.local",
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 8,
      name: "Target User",
      email: "target.user@toktickit.local",
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-18T00:00:00.000Z"),
    });

    const res = await request(app)
      .post("/api/admin/users/8/initial-password")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({ initialPassword: "NewResetPass-2026!" });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(8);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.data).not.toHaveProperty("password");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: {
        passwordHash: expect.stringContaining("scrypt$mockhash$NewResetPass-2026!"),
        mustChangePassword: true,
        passwordChangedAt: null,
      },
      select: expect.any(Object),
    });
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 8 } });
  });

  it("rejects password shorter than 12 chars with 400 VALIDATION_ERROR", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 8,
      name: "Target User",
      email: "target@toktickit.local",
      normalizedEmail: "target@toktickit.local",
    });

    const res = await request(app)
      .post("/api/admin/users/8/initial-password")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({ initialPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when target user does not exist", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/admin/users/999/initial-password")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({ initialPassword: "ValidInitialPassword-2026!" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});
