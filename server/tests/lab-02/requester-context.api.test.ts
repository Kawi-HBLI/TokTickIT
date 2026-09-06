import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { requireRequester } from "../../src/requester-context.js";

function createProbe() {
  const probe = express();
  probe.use(express.json());
  probe.post("/probe", requireRequester, (req, res) => {
    res.json({ requester: req.requester });
  });
  return probe;
}

describe("Development Requester context", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([undefined, "", "0", "-1", "1.5", "abc", "1x", "2147483648"])(
    "rejects a missing or malformed requester header (%s)",
    async (header) => {
      const call = request(createProbe()).post("/probe").send({ requesterId: 1 });
      if (header !== undefined) call.set("x-requester-id", header);

      const response = await call;

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("REQUESTER_CONTEXT_REQUIRED");
      expect(response.body).not.toHaveProperty("requester");
    },
  );

  it("accepts an active requester and exposes the verified record downstream", async () => {
    const active = await getPrisma().requesterUser.findFirstOrThrow({ where: { isActive: true } });

    const response = await request(createProbe())
      .post("/probe")
      .set("x-requester-id", String(active.id));

    expect(response.status).toBe(200);
    expect(response.body.requester).toEqual(expect.objectContaining({
      id: active.id,
      email: active.email,
      isActive: true,
    }));
  });

  it("rejects unknown and inactive requester IDs", async () => {
    const inactive = await getPrisma().requesterUser.findFirstOrThrow({ where: { isActive: false } });

    for (const id of [inactive.id, 2_147_483_647]) {
      const response = await request(createProbe())
        .post("/probe")
        .set("x-requester-id", String(id));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUESTER_CONTEXT");
    }
  });

  it("returns a safe retryable error when context verification fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(getPrisma().requesterUser, "findFirst").mockRejectedValueOnce(
      new Error("private DB detail"),
    );

    const response = await request(createProbe())
      .post("/probe")
      .set("x-requester-id", "1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "REQUESTER_CONTEXT_UNAVAILABLE",
        message: "The Requester context could not be verified.",
        retryable: true,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("private DB detail");
  });
});
