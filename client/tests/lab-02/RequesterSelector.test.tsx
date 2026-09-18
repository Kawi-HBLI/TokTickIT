import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../../src/App.js";

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("Lab 2 requester-selector retirement", () => {
  it("does not read a stored requester identity and sends the user to Login", async () => {
    sessionStorage.setItem("toktickit.requesterId", "2");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("combobox", { name: "Development Requester" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("toktickit.requesterId")).toBe("2");
  });
});
