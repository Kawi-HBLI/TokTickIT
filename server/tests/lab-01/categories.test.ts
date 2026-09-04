import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// Issue 4 — GET /api/categories
// Requires the DB to be migrated and seeded first.
describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    // Lab 2 wraps the same active category rows in the approved data envelope.
    expect(res.body.data).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });
});
