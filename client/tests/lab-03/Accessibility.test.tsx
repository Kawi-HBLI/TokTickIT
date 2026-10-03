// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  id: 301,
  ticketNumber: "TKT-2026-000301",
  createdAt: "2026-09-12T08:00:00.000Z",
  updatedAt: "2026-09-13T09:30:00.000Z",
  summary: "Email account lock after multiple attempts",
  category: { id: 1, name: "Account and Access" },
  requester: { id: 2, name: "Alice Jenkins", email: "alice@example.com" },
  requestedPriority: "HIGH",
  itPriority: "HIGH",
  currentStatus: "OPEN",
  owner: { id: 5, name: "Bob IT", email: "bob@example.com" },
  requesterResolutionIndicatedAt: null,
};

describe("UI-A11Y-01: Staff Ticket Queue Accessibility Attributes and Semantic Landmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCategories).mockResolvedValue([
      { id: 1, name: "Account and Access" },
    ]);
    vi.mocked(api.fetchStaffAssignees).mockResolvedValue({
      data: [{ id: 5, name: "Bob IT", email: "bob@example.com", role: "IT_STAFF" }],
    });
    vi.mocked(api.fetchStaffTickets).mockResolvedValue({
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
  });

  it("ensures all filter toolbar inputs have programmatically associated visible labels", async () => {
    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    // Search input associated with label
    const searchInput = screen.getByLabelText(/Search tickets/i);
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.tagName).toBe("INPUT");

    // Status filter
    const statusSelect = screen.getByLabelText(/^Status$/i);
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect.tagName).toBe("SELECT");

    // Requested priority filter
    const reqPrioritySelect = screen.getByLabelText(/Req\. Priority/i);
    expect(reqPrioritySelect).toBeInTheDocument();

    // IT priority filter
    const itPrioritySelect = screen.getByLabelText(/IT Priority/i);
    expect(itPrioritySelect).toBeInTheDocument();

    // Category filter
    const categorySelect = screen.getByLabelText(/^Category$/i);
    expect(categorySelect).toBeInTheDocument();

    // Owner filter
    const ownerSelect = screen.getByLabelText(/^Owner$/i);
    expect(ownerSelect).toBeInTheDocument();

    // Sort by filter
    const sortBySelect = screen.getByLabelText(/Sort by/i);
    expect(sortBySelect).toBeInTheDocument();

    // Direction filter
    const sortDirectionSelect = screen.getByLabelText(/^Direction$/i);
    expect(sortDirectionSelect).toBeInTheDocument();

    // Page size filter
    const pageSizeSelect = screen.getByLabelText(/Page size/i);
    expect(pageSizeSelect).toBeInTheDocument();
  });

  it("provides live region announcements with aria-live polite for dynamic updates", async () => {
    const { container } = render(<StaffTicketQueue onNavigate={vi.fn()} />);

    // Live region exists for polite updates
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000301").length).toBeGreaterThan(0);
    });

    // Contains count announcement
    expect(liveRegion?.textContent).toMatch(/Showing 1.*1 of 1 tickets/i);
  });

  it("provides semantic table headers, scopes, and accessible action names", async () => {
    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000301").length).toBeGreaterThan(0);
    });

    // Table has accessible label
    const table = screen.getByRole("table", { name: /Support Tickets/i });
    expect(table).toBeInTheDocument();

    // Column headers have scope="col"
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(8);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));

    // Action button has an explicit accessible name including the ticket number
    const viewButtons = screen.getAllByRole("button", { name: "View details for TKT-2026-000301" });
    expect(viewButtons.length).toBeGreaterThan(0);
  });

  it("uses role='alert' for failure and forbidden state announcements", async () => {
    vi.mocked(api.fetchStaffTickets).mockRejectedValueOnce(
      new api.ApiError("Access denied", 403, "FORBIDDEN")
    );

    render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    const alertBox = screen.getByRole("alert");
    expect(alertBox).toHaveClass("forbidden-box");
    expect(alertBox.querySelector("h2")?.textContent).toBe("Access denied");
  });
});
