import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requesters: api.Requester[] = [
  { id: 1, name: "Jennifer Anderson", email: "jennifer@example.com", department: "Marketing", isActive: true },
  { id: 2, name: "Marcus Chen", email: "marcus@example.com", department: "Finance", isActive: true },
];

describe("Development Requester selector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(api, "getRequesters").mockResolvedValue(requesters);
  });

  it("disables selection while loading and explains that this is not authentication", async () => {
    let resolveRequesters!: (value: api.Requester[]) => void;
    vi.spyOn(api, "getRequesters").mockReturnValue(new Promise((resolve) => { resolveRequesters = resolve; }));

    render(<App />);

    expect(screen.getByText("Loading Requesters...")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Development Requester" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument();
    resolveRequesters(requesters);
    await screen.findByRole("option", { name: "Jennifer Anderson" });
  });

  it("shows requester details, stores the selection, and opens the requester shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Development Requester" }), "2");
    expect(screen.getByText("marcus@example.com")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Welcome, Marcus Chen")).toBeInTheDocument();
    expect(screen.getByText("Development Requester")).toBeInTheDocument();
    expect(sessionStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");
  });

  it("restores a valid stored requester and discards a stale one", async () => {
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    const { unmount } = render(<App />);
    expect(await screen.findByText("Welcome, Jennifer Anderson")).toBeInTheDocument();
    unmount();

    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "999");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Select Development Requester" })).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull());
  });

  it("distinguishes an empty list from a failed request and retries failures", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValueOnce([]);
    const { unmount } = render(<App />);
    expect(await screen.findByText("No active Development Requesters are available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    unmount();

    vi.spyOn(api, "getRequesters")
      .mockRejectedValueOnce(new Error("network detail"))
      .mockResolvedValueOnce(requesters);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: "Marcus Chen" })).toBeInTheDocument();
  });

  it("switches requesters and Cancel preserves the existing selection", async () => {
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Welcome, Jennifer Anderson");

    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Welcome, Jennifer Anderson")).toBeInTheDocument();
    expect(sessionStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("1");

    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Development Requester" }), "2");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Welcome, Marcus Chen")).toBeInTheDocument();
    expect(sessionStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");
  });
});
