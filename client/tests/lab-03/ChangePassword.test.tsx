import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

const mustChange = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER", isActive: true, mustChangePassword: true, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" } as const;
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

describe("Change Password", () => {
  it("gates application content and validates mismatch before requesting a password change", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/api/auth/me")
      ? response({ data: { user: mustChange, csrfToken: "csrf-change" } })
      : response({ data: {} }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Change your password" });
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/change-password");
    await user.type(screen.getByLabelText("Current or initial password"), "ChangeMe-2026!");
    await user.type(screen.getByLabelText("New password"), "A-new-password-2026!");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("The new passwords do not match.")).toBeVisible();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/auth/change-password"))).toBe(false);
  });

  it("changes the password with CSRF and routes to the permitted home", async () => {
    const changed = { ...mustChange, mustChangePassword: false };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return response({ data: { user: mustChange, csrfToken: "csrf-change" } });
      if (url.endsWith("/api/auth/change-password")) return response({ data: { user: changed, csrfToken: "csrf-new" } });
      if (url.includes("/api/tickets")) return response({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }, query: { search: "", categoryId: null, requestedPriority: null, sortBy: "updatedAt", sortOrder: "desc" } });
      return response({ data: [] });
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Change your password" });
    await user.type(screen.getByLabelText("Current or initial password"), "ChangeMe-2026!");
    await user.type(screen.getByLabelText("New password"), "A-new-password-2026!");
    await user.type(screen.getByLabelText("Confirm new password"), "A-new-password-2026!");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText("Amina Rahman");
    expect(window.location.pathname).toBe("/tickets");
    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/auth/change-password"));
    expect(new Headers(call?.[1]?.headers).get("x-csrf-token")).toBe("csrf-change");
  });

  it("keeps the gate visible and explains a failed logout safely", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/api/auth/me")
      ? response({ data: { user: mustChange, csrfToken: "csrf-change" } })
      : response({ error: { code: "LOGOUT_FAILED" } }, 500));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Change your password" });
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByText("We could not sign you out right now. Try again.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Change your password" })).toBeVisible();
  });
});
