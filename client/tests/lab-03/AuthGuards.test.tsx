import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../../src/App.js";

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

describe("authentication guards", () => {
  it("redirects an unauthenticated direct requester route to Login without protected content", async () => {
    window.history.replaceState({}, "", "/tickets/99");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });

  it("keeps a Staff user out of Requester navigation and routes to the Staff home", async () => {
    window.history.replaceState({}, "", "/tickets");
    const staff = { id: 8, name: "Ethan Brooks", email: "ethan.brooks@toktickit.local", role: "IT_STAFF", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ data: { user: staff, csrfToken: "csrf-staff" } }));
    render(<App />);
    await screen.findByRole("heading", { name: "Ticket Queue" });
    expect(window.location.pathname).toBe("/staff/tickets");
    expect(screen.queryByText("Create Ticket")).not.toBeInTheDocument();
  });

  it("redirects a Requester away from an Administrator-only URL", async () => {
    window.history.replaceState({}, "", "/admin/users");
    const requester = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/api/auth/me")
      ? response({ data: { user: requester, csrfToken: "csrf-requester" } })
      : response({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }, query: { search: "", categoryId: null, requestedPriority: null, sortBy: "updatedAt", sortOrder: "desc" } }));
    render(<App />);
    await screen.findByRole("heading", { name: "My Tickets" });
    expect(window.location.pathname).toBe("/tickets");
    expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
  });

  it("returns to Login when a protected request discovers an expired or revoked session", async () => {
    const requester = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
    let meCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return meCalls++ === 0
        ? response({ data: { user: requester, csrfToken: "csrf-1" } })
        : response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      if (url.endsWith("/api/categories")) return response({ data: [] });
      if (url.includes("/api/tickets")) return response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      return response({ data: [] });
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(window.location.pathname).toBe("/login");
  });

  it("rechecks current user and gates the shell when the server requires a password change", async () => {
    const currentUser = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
    let meCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return response({ data: { user: { ...currentUser, mustChangePassword: meCalls++ > 0 }, csrfToken: "csrf-1" } });
      if (url.endsWith("/api/categories")) return response({ data: [] });
      if (url.includes("/api/tickets")) return response({ error: { code: "PASSWORD_CHANGE_REQUIRED" } }, 403);
      return response({ data: [] });
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Change your password" });
    expect(window.location.pathname).toBe("/change-password");
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });
});
