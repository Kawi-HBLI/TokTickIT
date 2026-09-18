import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    fetchStaffTickets: vi.fn(),
    fetchStaffAssignees: vi.fn(),
    getCategories: vi.fn(),
  };
});

const sampleTicket: api.StaffQueueItem = {
  id: 101,
  ticketNumber: "TKT-2026-000101",
  createdAt: "2026-09-12T08:00:00.000Z",
  updatedAt: "2026-09-13T09:30:00.000Z",
  summary: "Database connection intermittent",
  category: { id: 1, name: "Database" },
  requester: { id: 2, name: "Alice Jenkins", email: "alice@example.com" },
  requestedPriority: "HIGH",
  itPriority: "CRITICAL",
  currentStatus: "IN_PROGRESS",
  owner: { id: 5, name: "Bob IT", email: "bob@example.com" },
  requesterResolutionIndicatedAt: null,
};

const sampleUnassignedTicket: api.StaffQueueItem = {
  id: 102,
  ticketNumber: "TKT-2026-000102",
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
  summary: "New monitor setup",
  category: { id: 2, name: "Hardware" },
  requester: { id: 3, name: "Charlie Requester", email: "charlie@example.com" },
  requestedPriority: "LOW",
  itPriority: "LOW",
  currentStatus: "NEW",
  owner: null,
  requesterResolutionIndicatedAt: null,
};

describe("UI-QUEUE-01: Staff Ticket Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCategories).mockResolvedValue([
      { id: 1, name: "Database" },
      { id: 2, name: "Hardware" },
    ]);
    vi.mocked(api.fetchStaffAssignees).mockResolvedValue({
      data: [
        { id: 5, name: "Bob IT", email: "bob@example.com", role: "IT_STAFF" },
        { id: 9, name: "Sarah Admin", email: "sarah@example.com", role: "ADMINISTRATOR" },
      ],
    });
  });

  it("renders queue table with metadata, priority badges, and unassigned status", async () => {
    vi.mocked(api.fetchStaffTickets).mockResolvedValue({
      data: [sampleTicket, sampleUnassignedTicket],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      query: {
        q: "",
        status: null,
        requestedPriority: null,
        itPriority: null,
        categoryId: null,
        owner: null,
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
    });

    const onNavigate = vi.fn();
    render(<StaffTicketQueue onNavigate={onNavigate} />);

    // Initially loading state
    expect(screen.getAllByText(/Loading ticket queue…/i).length).toBeGreaterThan(0);

    // After resolution
    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000101").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Database connection intermittent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob IT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Showing 1–2 of 2 tickets/i).length).toBeGreaterThan(0);

    // Clicking View Details invokes onNavigate
    const viewButtons = screen.getAllByRole("button", { name: /View details for TKT-2026-000101/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    await userEvent.click(viewButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith("/staff/tickets/101");
  });

  it("renders empty queue state when no tickets exist", async () => {
    vi.mocked(api.fetchStaffTickets).mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      query: {
        q: "",
        status: null,
        requestedPriority: null,
        itPriority: null,
        categoryId: null,
        owner: null,
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
    });

    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/The ticket queue is currently empty/i).length).toBeGreaterThan(0);
    });
  });

  it("renders no-results state with clear filters button when filters return 0 results", async () => {
    vi.mocked(api.fetchStaffTickets).mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      query: {
        q: "nonexistent",
        status: null,
        requestedPriority: null,
        itPriority: null,
        categoryId: null,
        owner: null,
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
    });

    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    const searchInput = screen.getByLabelText(/Search tickets/i);
    await userEvent.type(searchInput, "nonexistent");

    await waitFor(() => {
      expect(screen.getByText(/No tickets matched your search and filter criteria/i)).toBeInTheDocument();
    });

    const clearButtons = screen.getAllByRole("button", { name: /Clear filters/i });
    expect(clearButtons.length).toBeGreaterThan(0);
    await userEvent.click(clearButtons[0]);

    expect(searchInput).toHaveValue("");
  });

  it("renders error state with retry action when API fetch fails", async () => {
    vi.mocked(api.fetchStaffTickets).mockRejectedValueOnce(new Error("Network Error"));

    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Failed to load ticket queue/i })).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeInTheDocument();

    vi.mocked(api.fetchStaffTickets).mockResolvedValueOnce({
      data: [sampleTicket],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      query: {
        q: "",
        status: null,
        requestedPriority: null,
        itPriority: null,
        categoryId: null,
        owner: null,
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
    });

    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000101").length).toBeGreaterThan(0);
    });
  });
});
