import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/prisma.js", () => ({ getPrisma: vi.fn() }));

const { getPrisma } = await import("../../src/prisma.js");
const { requireRequester } = await import("../../src/requester-context.js");

const activeRequester = {
  id: 101,
  name: "Active Requester",
  email: "active.requester@toktickit.test",
  normalizedEmail: "active.requester@toktickit.test",
  department: "Testing",
  passwordHash: "unused",
  role: "REQUESTER" as const,
  isActive: true,
  mustChangePassword: false,
  passwordChangedAt: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

const staffUser = { ...activeRequester, id: 102, role: "IT_STAFF" as const };
const inactiveRequester = { ...activeRequester, id: 103, isActive: false };

const db = {
  session: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

function sessionFor(user: typeof activeRequester | typeof staffUser | typeof inactiveRequester) {
  return {
    id: user.id + 1000,
    tokenHash: "stored-token-hash",
    csrfToken: "test-csrf-token",
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    lastSeenAt: new Date(),
    user,
  };
}

function createProbe() {
  const probe = express();
  probe.use(express.json());
  probe.post("/probe", requireRequester, (req, res) => {
    res.json({ requester: req.requester });
  });
  return probe;
}

describe("Requester context verification", () => {
  beforeEach(() => {
    db.session.findUnique.mockReset();
    db.session.update.mockReset().mockResolvedValue(undefined);
    vi.mocked(getPrisma).mockReturnValue(db as never);
  });

  it("rejects unauthenticated requests without session with 401", async () => {
    const response = await request(createProbe()).post("/probe").send({ requesterId: 1 });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(response.body).not.toHaveProperty("requester");
  });

  it("accepts an active requester and exposes the verified record downstream", async () => {
    db.session.findUnique.mockResolvedValue(sessionFor(activeRequester));

    const response = await request(createProbe())
      .post("/probe")
      .set("Cookie", "toktickit_session=test-session-token");

    expect(response.status).toBe(200);
    expect(response.body.requester).toEqual(expect.objectContaining({
      id: activeRequester.id,
      email: activeRequester.email,
      isActive: true,
    }));
    expect(db.session.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tokenHash: expect.any(String) }),
    }));
  });

  it("rejects non-requester roles with 403 FORBIDDEN", async () => {
    db.session.findUnique.mockResolvedValue(sessionFor(staffUser));

    const response = await request(createProbe())
      .post("/probe")
      .set("Cookie", "toktickit_session=test-session-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects inactive requester with 403 ACCOUNT_INACTIVE", async () => {
    db.session.findUnique.mockResolvedValue(sessionFor(inactiveRequester));

    const response = await request(createProbe())
      .post("/probe")
      .set("Cookie", "toktickit_session=test-session-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("returns a safe 500 error when session lookup encounters unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.session.findUnique.mockRejectedValueOnce(new Error("private DB detail"));

    const response = await request(createProbe())
      .post("/probe")
      .set("Cookie", "toktickit_session=invalid-or-failing-session");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "AUTHENTICATION_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
        retryable: true,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("private DB detail");
  });
});
