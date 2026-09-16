import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("Lab 3 requester migration API surface", () => {
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
});
