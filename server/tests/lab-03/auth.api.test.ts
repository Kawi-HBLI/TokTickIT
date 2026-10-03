import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, INITIAL_PASSWORD } from "../../src/auth-crypto.js";

vi.mock("../../src/prisma.js", () => ({ getPrisma: vi.fn() }));

const { getPrisma } = await import("../../src/prisma.js");
const { authRouter, resetLoginRateLimiter } = await import("../../src/auth.js");

const userId = 11;
const user = {
  id: userId,
  name: "Alex Thompson",
  email: "Alex.Thompson@toktickit.local",
  normalizedEmail: "alex.thompson@toktickit.local",
  department: "Engineering",
  passwordHash: "",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
  passwordChangedAt: null,
  createdAt: new Date("2026-09-12T08:00:00.000Z"),
  updatedAt: new Date("2026-09-12T08:00:00.000Z"),
};

function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/auth", authRouter);
  return testApp;
}

describe("Lab 3 authentication API foundation", () => {
  const db = {
    user: { findUnique: vi.fn() },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    user.passwordHash = await hashPassword(INITIAL_PASSWORD);
    user.mustChangePassword = false;
    db.user.findUnique.mockReset();
    db.session.create.mockReset();
    db.session.findUnique.mockReset();
    db.session.update.mockReset().mockResolvedValue(undefined);
    db.session.delete.mockReset().mockResolvedValue(undefined);
    db.$transaction.mockReset();
    vi.mocked(getPrisma).mockReturnValue(db as never);
    resetLoginRateLimiter();
  });

  it("creates an opaque session and returns only safe user data", async () => {
    db.user.findUnique.mockResolvedValue(user);
    db.session.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 501,
      ...data,
    }));

    const response = await request(createTestApp())
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "  alex.thompson@TOKTICKIT.local ", password: INITIAL_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"][0]).toMatch(/^toktickit_session=.*HttpOnly/);
    expect(response.body.data.user).toMatchObject({ id: userId, role: "REQUESTER", mustChangePassword: false });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
    const sessionData = db.session.create.mock.calls[0][0].data;
    expect(sessionData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionData).not.toHaveProperty("token");
  });

  it("uses a generic response for invalid credentials and rejects an unapproved origin", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const invalid = await request(createTestApp())
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "missing@example.test", password: "wrong-password" });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");

    const forbidden = await request(createTestApp())
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "missing@example.test", password: "wrong-password" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("ORIGIN_FORBIDDEN");
  });

  it("recovers the current user from the HttpOnly session and logs out with CSRF", async () => {
    const session = {
      id: 501,
      tokenHash: "stored-hash",
      csrfToken: "csrf-value",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastSeenAt: new Date(),
      user,
    };
    db.session.findUnique.mockResolvedValue(session);
    const testApp = createTestApp();
    const current = await request(testApp)
      .get("/api/auth/me")
      .set("Cookie", "toktickit_session=raw-session-token");
    expect(current.status).toBe(200);
    expect(current.body.data.user.email).toBe(user.email);
    expect(current.body.data.csrfToken).toBe("csrf-value");

    const logout = await request(testApp)
      .post("/api/auth/logout")
      .set("Cookie", "toktickit_session=raw-session-token")
      .set("X-CSRF-Token", "csrf-value");
    expect(logout.status).toBe(204);
    expect(db.session.delete).toHaveBeenCalledWith({ where: { id: 501 } });
  });

  it("changes the initial password atomically and rotates the session", async () => {
    user.mustChangePassword = true;
    const session = {
      id: 501,
      tokenHash: "stored-hash",
      csrfToken: "csrf-value",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastSeenAt: new Date(),
      user,
    };
    db.session.findUnique.mockResolvedValue(session);
    const updated = { ...user, mustChangePassword: false, passwordChangedAt: new Date() };
    const tx = {
      user: { update: vi.fn().mockResolvedValue(updated) },
      session: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 502, ...data })),
      },
    };
    db.$transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const response = await request(createTestApp())
      .post("/api/auth/change-password")
      .set("Cookie", "toktickit_session=raw-session-token")
      .set("X-CSRF-Token", "csrf-value")
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: "a sufficiently new password" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.mustChangePassword).toBe(false);
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(response.headers["set-cookie"][0]).toMatch(/^toktickit_session=.*Max-Age=28800/);
  });
});
