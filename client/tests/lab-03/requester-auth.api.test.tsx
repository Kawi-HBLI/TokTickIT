import { afterEach, describe, expect, it, vi } from "vitest";
import { createTicket, getCurrentUser, getMyTickets, setCsrfToken } from "../../src/api.js";

const user = {
  id: 11,
  name: "Requester A",
  email: "requester-a@example.com",
  role: "REQUESTER" as const,
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("authenticated requester API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setCsrfToken(null);
  });

  it("restores the current user with credentials and caches the server CSRF token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: { user, csrfToken: "csrf-1" } }));

    await expect(getCurrentUser()).resolves.toMatchObject({ user, csrfToken: "csrf-1" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/auth/me", { credentials: "include" });
  });

  it("uses the session for reads and never sends the legacy requester header", async () => {
    setCsrfToken("csrf-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
      query: { search: "", categoryId: null, requestedPriority: null, sortBy: "updatedAt", sortOrder: "desc" },
    }));

    await getMyTickets();
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ credentials: "include" });
    expect(new Headers(init?.headers).has("x-requester-id")).toBe(false);
  });

  it("adds the cached CSRF token to unsafe ticket creation without a requester ID", async () => {
    setCsrfToken("csrf-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: { id: 1, ticketNumber: "TKT-2026-00001", ticketDate: "2026-09-17T00:00:00.000Z", currentStatus: "NEW" },
      warnings: [],
    }));

    await createTicket("idempotency-1", {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Printer issue",
      description: "The printer is not responding.",
      requestedPriority: "MEDIUM",
      attachments: [],
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init).toMatchObject({ credentials: "include", method: "POST" });
    expect(headers.get("x-csrf-token")).toBe("csrf-1");
    expect(headers.has("x-requester-id")).toBe(false);
  });
});
