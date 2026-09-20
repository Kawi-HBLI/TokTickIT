import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("Development Requester API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("is retired in Lab 3 and returns 404", async () => {
    const response = await request(app).get("/api/requesters");
    expect(response.status).toBe(404);
  });
});
