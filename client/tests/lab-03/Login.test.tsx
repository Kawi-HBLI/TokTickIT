import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

const requester = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" } as const;
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

describe("Login", () => {
  it("validates fields accessibly, retains email after safe failure, and signs in with credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) return response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
      if (url.endsWith("/api/auth/login")) return response({ data: { user: requester, csrfToken: "csrf-login" } });
      if (url.includes("/api/tickets")) return response({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }, query: { search: "", categoryId: null, requestedPriority: null, sortBy: "updatedAt", sortOrder: "desc" } });
      return response({ data: [] });
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your email address.")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.type(screen.getByLabelText("Email"), requester.email);
    await user.type(screen.getByLabelText("Password"), "ChangeMe-2026!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Amina Rahman");
    const loginCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/auth/login"));
    expect(loginCall?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  it("uses one safe message for invalid credentials and clears the entered password", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/api/auth/login")
      ? response({ error: { code: "INVALID_CREDENTIALS" } }, 401)
      : response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Email"), "unknown@example.test");
    await user.type(screen.getByLabelText("Password"), "not-the-right-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("We could not sign you in. Check your email and password.")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("unknown@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("disables another submit until the server-provided rate-limit window expires", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/api/auth/login")
      ? new Response(JSON.stringify({ error: { code: "LOGIN_RATE_LIMITED" } }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "1" } })
      : response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Email"), requester.email);
    await user.type(screen.getByLabelText("Password"), "ChangeMe-2026!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Too many sign-in attempts. Try again in 1 seconds.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again in 1s" })).toBeDisabled();
  });
});
