import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

const requester = { id: 1, name: "Amina Rahman", email: "amina.rahman@toktickit.local", role: "REQUESTER" as const, isActive: true, mustChangePassword: false, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({ data: { user: requester, csrfToken: "csrf-test" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/tickets")) {
        return new Response(JSON.stringify({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  });

  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4 — success state: Online + category list
  it("shows Online and the seeded categories on success", async () => {
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ],
    });

    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /check system/i }));

    expect(await screen.findByText(/online/i)).toBeInTheDocument();
    expect(screen.getByText("Account and Access")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  // Issue 4 — error state: Offline message
  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("Backend is unavailable"));

    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /check system/i }));

    expect(await screen.findByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/backend api is currently unavailable/i)).toBeInTheDocument();
  });
});
