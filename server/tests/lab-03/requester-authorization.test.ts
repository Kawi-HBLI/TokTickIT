import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth.js", () => ({
  requireAuth: vi.fn((req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED" } });
      return;
    }
    next();
  }),
  requireCsrf: vi.fn((req, res, next) => {
    if (req.get("X-CSRF-Token") !== req.auth?.csrfToken) {
      res.status(403).json({ error: { code: "CSRF_INVALID" } });
      return;
    }
    next();
  }),
}));

const { requireRequester, requireRequesterWrite } = await import("../../src/requester-context.js");

const requester = {
  id: 41,
  name: "Authenticated Requester",
  role: "REQUESTER",
  isActive: true,
  csrfToken: "csrf-41",
};

function createProbe(user: typeof requester | null = requester) {
  const app = express();
  app.use((req, _res, next) => {
    if (user) {
      req.auth = {
        user: user as never,
        sessionId: 1,
        csrfToken: user.csrfToken,
      };
    }
    next();
  });
  app.get("/requester", requireRequester, (req, res) => {
    res.json({ id: req.requester?.id });
  });
  app.post("/requester-write", requireRequesterWrite, (_req, res) => {
    res.status(204).end();
  });
  return app;
}

describe("Lab 3 authenticated Requester boundary", () => {
  it("uses the authenticated user and ignores a spoofed requester header", async () => {
    const response = await request(createProbe())
      .get("/requester")
      .set("x-requester-id", "999999");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: requester.id });
  });

  it("rejects an authenticated non-Requester role", async () => {
    const staff = { ...requester, role: "IT_STAFF" } as typeof requester;
    const response = await request(createProbe(staff)).get("/requester");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 401 when no authenticated session exists", async () => {
    const response = await request(createProbe(null)).get("/requester");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("requires CSRF for Requester writes after authentication", async () => {
    const missing = await request(createProbe()).post("/requester-write");
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("CSRF_INVALID");

    const valid = await request(createProbe())
      .post("/requester-write")
      .set("X-CSRF-Token", requester.csrfToken);
    expect(valid.status).toBe(204);
  });
});
