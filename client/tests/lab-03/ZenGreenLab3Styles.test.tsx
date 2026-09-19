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
  id: 201,
  ticketNumber: "TKT-2026-000201",
  createdAt: "2026-09-12T08:00:00.000Z",
  updatedAt: "2026-09-13T09:30:00.000Z",
  summary: "VPN configuration timeout",
  category: { id: 4, name: "Network" },
  requester: { id: 2, name: "Alice Jenkins", email: "alice@example.com" },
  requestedPriority: "CRITICAL",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  owner: { id: 5, name: "Bob IT", email: "bob@example.com" },
  requesterResolutionIndicatedAt: null,
};

const sampleUnassignedTicket: api.StaffQueueItem = {
  id: 202,
  ticketNumber: "TKT-2026-000202",
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
  summary: "Printer toner replacement",
  category: { id: 2, name: "Hardware" },
  requester: { id: 3, name: "Charlie Requester", email: "charlie@example.com" },
  requestedPriority: "LOW",
  itPriority: "MEDIUM",
  currentStatus: "NEW",
  owner: null,
  requesterResolutionIndicatedAt: null,
};

describe("UI-STYLE-01: Zen Green Styles and Responsive Queue Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCategories).mockResolvedValue([
      { id: 2, name: "Hardware" },
      { id: 4, name: "Network" },
    ]);
    vi.mocked(api.fetchStaffAssignees).mockResolvedValue({
      data: [{ id: 5, name: "Bob IT", email: "bob@example.com", role: "IT_STAFF" }],
    });
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
  });

  it("applies Zen Green layout classes and non-colour status and priority badges", async () => {
    const { container } = render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000201").length).toBeGreaterThan(0);
    });

    // Layout containers
    expect(container.querySelector(".staff-queue-workspace")).toBeInTheDocument();
    expect(container.querySelector(".queue-filter-toolbar")).toBeInTheDocument();
    expect(container.querySelector(".staff-queue-table")).toBeInTheDocument();

    // Priority badges have distinct class names matching priority values
    const criticalBadges = container.querySelectorAll(".badge-priority-critical");
    expect(criticalBadges.length).toBeGreaterThan(0);
    expect(criticalBadges[0].textContent).toBe("CRITICAL");

    const highBadges = container.querySelectorAll(".badge-priority-high");
    expect(highBadges.length).toBeGreaterThan(0);
    expect(highBadges[0].textContent).toBe("HIGH");

    // Status badges have distinct class names
    const inProgressBadges = container.querySelectorAll(".badge-status-in-progress");
    expect(inProgressBadges.length).toBeGreaterThan(0);

    // Unassigned badge has distinct styling hook
    const unassignedBadges = container.querySelectorAll(".badge-unassigned");
    expect(unassignedBadges.length).toBeGreaterThan(0);
    expect(unassignedBadges[0].textContent).toBe("Unassigned");
  });

  it("renders both desktop table and mobile card containers for responsive media query toggling", async () => {
    const { container } = render(<StaffTicketQueue onNavigate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("TKT-2026-000201").length).toBeGreaterThan(0);
    });

    // Desktop table container (controlled by @media (min-width: 992px))
    const tableContainer = container.querySelector(".staff-queue-table-container");
    expect(tableContainer).toBeInTheDocument();

    // Mobile cards container (controlled by @media (max-width: 991px))
    const cardsContainer = container.querySelector(".staff-queue-cards");
    expect(cardsContainer).toBeInTheDocument();

    // Each ticket renders as a staff-ticket-card within the card container
    const cards = container.querySelectorAll(".staff-ticket-card");
    expect(cards.length).toBe(2);
  });

  it("applies distinct styling hooks for all queue state presentations", async () => {
    // 1. Loading state
    vi.mocked(api.fetchStaffTickets).mockReturnValue(new Promise(() => {}));
    const { container: loadingContainer } = render(<StaffTicketQueue onNavigate={vi.fn()} />);
    expect(loadingContainer.querySelector(".queue-state-box.loading-box")).toBeInTheDocument();

    // 2. Forbidden state
    vi.mocked(api.fetchStaffTickets).mockRejectedValue(new api.ApiError("Forbidden", 403, "FORBIDDEN"));
    const { container: forbiddenContainer } = render(<StaffTicketQueue onNavigate={vi.fn()} />);
    await waitFor(() => {
      expect(forbiddenContainer.querySelector(".queue-state-box.forbidden-box")).toBeInTheDocument();
    });

    // 3. Error state
    vi.mocked(api.fetchStaffTickets).mockRejectedValue(new Error("Server error"));
    const { container: errorContainer } = render(<StaffTicketQueue onNavigate={vi.fn()} />);
    await waitFor(() => {
      expect(errorContainer.querySelector(".queue-state-box.error-box")).toBeInTheDocument();
    });
  });
});
