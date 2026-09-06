import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("Development Requester API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns active Requesters ordered by name and ID", async () => {
    const response = await request(app).get("/api/requesters");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
    expect(response.body.data.every((row: { isActive: boolean }) => row.isActive)).toBe(true);
    expect(response.body.data.map((row: { name: string }) => row.name)).toEqual(
      [...response.body.data.map((row: { name: string }) => row.name)].sort(),
    );
    expect(response.body.data[0]).toEqual(expect.objectContaining({
      id: expect.any(Number), name: expect.any(String), email: expect.any(String),
      department: expect.any(String), isActive: true,
    }));
  });

  it("returns a safe retryable error when reference data fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(getPrisma().requesterUser, "findMany").mockRejectedValueOnce(new Error("private DB detail"));
    const response = await request(app).get("/api/requesters");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: {
      code: "REFERENCE_DATA_UNAVAILABLE",
      message: "Development Requesters are temporarily unavailable.",
      retryable: true,
    } });
    expect(JSON.stringify(response.body)).not.toContain("private DB detail");
  });

  it("returns an empty data array when no active Requesters exist", async () => {
    vi.spyOn(getPrisma().requesterUser, "findMany").mockResolvedValueOnce([]);

    const response = await request(app).get("/api/requesters");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });
});
