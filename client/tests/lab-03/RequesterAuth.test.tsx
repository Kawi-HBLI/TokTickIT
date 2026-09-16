import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.js";

describe("Lab 3 authenticated Requester API boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setCsrfToken("csrf-token");
  });

  it("uses the session cookie and CSRF token without a client requester header", async () => {
    const response = {
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({
        data: { id: 1, ticketNumber: "TKT-2026-00001", ticketDate: "2026-09-17T00:00:00.000Z", currentStatus: "NEW" },
        warnings: [],
      }),
    } as Response;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await api.createTicket("00000000-0000-4000-8000-000000000001", {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Email is unavailable",
      description: "The email service is unavailable for testing.",
      requestedPriority: "MEDIUM",
      attachments: [],
    });

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe("include");
    expect(options.headers).toEqual(expect.objectContaining({ "X-CSRF-Token": "csrf-token", "Idempotency-Key": expect.any(String) }));
    expect(Object.keys(options.headers as Record<string, string>).some((key) => key.toLowerCase() === "x-requester-id")).toBe(false);
  });

  it("recovers identity through the authenticated current-user endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { user: { id: 7, name: "Requester A", email: "a@example.test", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" }, csrfToken: "csrf-7" } }),
    } as Response);

    const current = await api.getCurrentUser();
    expect(current.user).toMatchObject({ id: 7, role: "REQUESTER" });
    expect(current.csrfToken).toBe("csrf-7");
  });
});
