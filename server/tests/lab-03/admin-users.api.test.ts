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
  $executeRaw: vi.fn().mockResolvedValue(1),
  $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
};

vi.mock("../../src/prisma.js", () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock("../../src/auth-crypto.js", () => ({
  INITIAL_PASSWORD: "ChangeMe-2026!",
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
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
  name: "Ethan Brooks",
  email: "ethan.brooks@toktickit.local",
  role: "IT_STAFF" as UserRole,
  isActive: true,
  mustChangePassword: false,
};

const requesterUser = {
  id: 3,
  name: "Ben Carter",
  email: "ben.carter@toktickit.local",
  role: "REQUESTER" as UserRole,
  isActive: true,
  mustChangePassword: false,
};

function createTestApp(actingUser: typeof adminUser | typeof staffUser | typeof requesterUser | null = adminUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (actingUser) {
      req.auth = {
        user: actingUser as any,
        sessionId: 100,
        csrfToken: "mock-csrf-token",
      };
    }
    next();
  });
  app.use("/api/admin/users", adminUsersRouter);
  return app;
}

describe("API-ADMIN-USERS-01: User Management Authorization & Queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createTestApp(null);
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 403 when authenticated as IT Staff", async () => {
    const app = createTestApp(staffUser);
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when authenticated as Requester", async () => {
    const app = createTestApp(requesterUser);
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("lists all users sorted by name for Administrator", async () => {
    const app = createTestApp(adminUser);
    const mockList = [
      {
        id: 3,
        name: "Ben Carter",
        email: "ben.carter@toktickit.local",
        department: "Finance",
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        id: 1,
        name: "Harper Morgan",
        email: "harper.morgan@toktickit.local",
        department: "IT Governance",
        role: "ADMINISTRATOR",
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ];
    mockPrisma.user.findMany.mockResolvedValue(mockList);

    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe("Ben Carter");
    expect(res.body.data[1].name).toBe("Harper Morgan");
  });

  it("filters users by search query and role parameter", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await request(app).get("/api/admin/users?q=ethan&role=IT_STAFF");
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: "ethan", mode: "insensitive" } },
              { email: { contains: "ethan", mode: "insensitive" } },
            ],
          },
          { role: "IT_STAFF" },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: expect.any(Object),
    });
  });
});

describe("API-ADMIN-USERS-02: User Creation & Password Initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new user with initial password and mustChangePassword = true", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 10,
      name: "Daniel Craig",
      email: "daniel.craig@toktickit.local",
      department: "Security",
      role: "IT_STAFF",
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
        department: "Security",
        role: "IT_STAFF",
        isActive: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Daniel Craig");
    expect(res.body.data.role).toBe("IT_STAFF");
    expect(res.body.data.mustChangePassword).toBe(true);

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "Daniel Craig",
        email: "daniel.craig@toktickit.local",
        normalizedEmail: "daniel.craig@toktickit.local",
        department: "Security",
        role: "IT_STAFF",
        isActive: true,
        passwordHash: expect.stringContaining("ChangeMe-2026!"),
        mustChangePassword: true,
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
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects invalid inputs with 400 Validation Error", async () => {
    const app = createTestApp(adminUser);

    const res = await request(app)
      .post("/api/admin/users")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "",
        email: "not-an-email",
        role: "SUPERUSER",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toHaveProperty("name");
    expect(res.body.error.fields).toHaveProperty("email");
    expect(res.body.error.fields).toHaveProperty("role");
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
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toHaveProperty("isActive");
    expect(res.body.error.fields.isActive).toBe("Active status must be true or false.");
  });
});

describe("API-ADMIN-USERS-03: User Modification & Safety Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates user details and revokes sessions when deactivating user", async () => {
    const app = createTestApp(adminUser);
    const existingStaff = {
      id: 5,
      name: "Old Staff",
      email: "old.staff@toktickit.local",
      role: "IT_STAFF" as UserRole,
      isActive: true,
      department: "Support",
    };
    mockPrisma.user.findUnique.mockResolvedValue(existingStaff);
    mockPrisma.user.update.mockResolvedValue({
      ...existingStaff,
      name: "Updated Staff",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      mustChangePassword: false,
    });

    const res = await request(app)
      .patch("/api/admin/users/5")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        name: "Updated Staff",
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Staff");
    expect(res.body.data.isActive).toBe(false);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
  });

  it("prevents an Administrator from deactivating their own account", async () => {
    const app = createTestApp(adminUser); // id: 1
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      name: "Harper Morgan",
      email: "harper.morgan@toktickit.local",
      role: "ADMINISTRATOR",
      isActive: true,
    });

    const res = await request(app)
      .patch("/api/admin/users/1")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        isActive: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");
  });

  it("prevents an Administrator from demoting their own role", async () => {
    const app = createTestApp(adminUser); // id: 1
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      name: "Harper Morgan",
      email: "harper.morgan@toktickit.local",
      role: "ADMINISTRATOR",
      isActive: true,
    });

    const res = await request(app)
      .patch("/api/admin/users/1")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        role: "IT_STAFF",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CANNOT_DEMOTE_SELF");
  });

  it("prevents deactivating or demoting the last active Administrator in the system", async () => {
    const app = createTestApp(adminUser);
    const otherAdmin = {
      id: 99,
      name: "Second Admin",
      email: "second.admin@toktickit.local",
      role: "ADMINISTRATOR" as UserRole,
      isActive: true,
    };
    mockPrisma.user.findUnique.mockResolvedValue(otherAdmin);
    mockPrisma.user.count.mockResolvedValue(1); // Only 1 active administrator exists!

    const res = await request(app)
      .patch("/api/admin/users/99")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({
        isActive: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");
  });
});

describe("API-ADMIN-USERS-04: Password Reset Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets user password to initial password and revokes all active sessions", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 8,
      name: "Target User",
    });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post("/api/admin/users/8/reset-password")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("Target User");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: {
        passwordHash: expect.stringContaining("ChangeMe-2026!"),
        mustChangePassword: true,
        passwordChangedAt: null,
      },
    });
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 8 } });
  });

  it("returns 404 when target user does not exist", async () => {
    const app = createTestApp(adminUser);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/admin/users/999/reset-password")
      .set("X-CSRF-Token", "mock-csrf-token")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});
