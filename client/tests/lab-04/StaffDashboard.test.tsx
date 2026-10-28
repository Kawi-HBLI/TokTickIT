import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffDashboard from "../../src/StaffDashboard.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    fetchStaffDashboard: vi.fn(),
    claimStaffTicket: vi.fn(),
  };
});

const mockStaffDashboardData: api.StaffDashboardData = {
  metrics: {
    openTicketsCount: 14,
    pendingActionsCount: 2,
    completedActionsTodayCount: 3,
    unassignedTicketsCount: 5,
    myAssignedTicketsCount: 4,
  },
  myWork: {
    assignedTicketsCount: 4,
    items: [
      {
        id: 12,
        ticketNumber: "TCK-2026-00012",
        summary: "VPN connection drops every 10 minutes",
        requestedPriority: "HIGH",
        itPriority: "HIGH",
        currentStatus: "IN_PROGRESS",
        pendingActionsCount: 1,
        updatedAt: "2026-10-27T11:20:00.000Z",
        createdAt: "2026-10-27T08:00:00.000Z",
      },
      {
        id: 18,
        ticketNumber: "TCK-2026-00018",
        summary: "Keyboard spacebar stuck on Lab PC 4",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        pendingActionsCount: 0,
        updatedAt: "2026-10-27T10:00:00.000Z",
        createdAt: "2026-10-27T09:00:00.000Z",
      },
    ],
  },
  unassignedQueue: {
    total: 5,
    items: [
      {
        id: 45,
        ticketNumber: "TCK-2026-00045",
        summary: "New hire workstation setup",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        createdAt: "2026-10-27T08:30:00.000Z",
        updatedAt: "2026-10-27T08:30:00.000Z",
      },
    ],
  },
  recentActions: [
    {
      id: 1,
      ticketId: 12,
      ticketNumber: "TCK-2026-00012",
      description: "Adjusted MTU size on router interface",
      status: "COMPLETED",
      performerName: "Jane IT",
      completedBy: { id: 8, name: "Jane IT", email: "jane@toktickit.local" },
      completedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      result: "MTU set to 1420; packet loss eliminated.",
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ],
};

describe("TEST-UI-08: Staff Dashboard Component & Drill-Downs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 4 metric cards with correct server counts and exact drill-down URLs", async () => {
    vi.mocked(api.fetchStaffDashboard).mockResolvedValue({ data: mockStaffDashboardData });
    const onNavigate = vi.fn();
    render(<StaffDashboard onNavigate={onNavigate} />);

    // Wait for data load
    await screen.findByRole("heading", { name: "Operational Overview" });

    // 1. Open Tickets card
    const openCard = screen.getByTestId("metric-open-tickets");
    expect(openCard).toHaveTextContent("OPEN TICKETS");
    expect(openCard).toHaveTextContent("14");
    expect(openCard).toHaveTextContent("(Team)");
    const openLink = openCard.querySelector("button")!;
    await userEvent.click(openLink);
    expect(onNavigate).toHaveBeenCalledWith("/staff/tickets?statusGroup=active");

    // 2. Pending Actions card
    const pendingCard = screen.getByTestId("metric-pending-actions");
    expect(pendingCard).toHaveTextContent("PENDING ACTIONS");
    expect(pendingCard).toHaveTextContent("2");
    expect(pendingCard).toHaveTextContent("(My Actions)");
    expect(pendingCard).toHaveTextContent("View tickets containing these actions");
    const pendingLink = pendingCard.querySelector("button")!;
    await userEvent.click(pendingLink);
    expect(onNavigate).toHaveBeenCalledWith(
      "/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active"
    );

    // 3. Completed Today card
    const completedCard = screen.getByTestId("metric-completed-today");
    expect(completedCard).toHaveTextContent("COMPLETED TODAY");
    expect(completedCard).toHaveTextContent("3");
    expect(completedCard).toHaveTextContent("(UTC)");
    expect(completedCard).toHaveTextContent("View tickets containing these actions");
    const completedLink = completedCard.querySelector("button")!;
    await userEvent.click(completedLink);
    expect(onNavigate).toHaveBeenCalledWith(
      "/staff/tickets?completedBy=me&completedDate=today"
    );

    // 4. Unassigned Queue card
    const unassignedCard = screen.getByTestId("metric-unassigned-queue");
    expect(unassignedCard).toHaveTextContent("UNASSIGNED QUEUE");
    expect(unassignedCard).toHaveTextContent("5");
    expect(unassignedCard).toHaveTextContent("(Team)");
    const unassignedLink = unassignedCard.querySelector("button")!;
    await userEvent.click(unassignedLink);
    expect(onNavigate).toHaveBeenCalledWith(
      "/staff/tickets?owner=unassigned&statusGroup=active"
    );
  });

  it("displays server-provided zero counts directly without deriving from preview arrays", async () => {
    const zeroData: api.StaffDashboardData = {
      metrics: {
        openTicketsCount: 0,
        pendingActionsCount: 0,
        completedActionsTodayCount: 0,
        unassignedTicketsCount: 0,
      },
      myWork: { assignedTicketsCount: 0, items: [] },
      unassignedQueue: { total: 0, items: [] },
      recentActions: [],
    };
    vi.mocked(api.fetchStaffDashboard).mockResolvedValue({ data: zeroData });
    render(<StaffDashboard onNavigate={vi.fn()} />);

    await screen.findByRole("heading", { name: "Operational Overview" });

    expect(screen.getByTestId("metric-open-tickets")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-pending-actions")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-completed-today")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-unassigned-queue")).toHaveTextContent("0");

    expect(screen.getByText("No assigned tickets in your queue.")).toBeInTheDocument();
    expect(screen.getByText("No unassigned tickets in the queue.")).toBeInTheDocument();
    expect(screen.getByText("No recent action activity.")).toBeInTheDocument();
  });

  it("renders My Assigned Work, Unassigned Work, and Recent Actions preview with functional links and Claim action", async () => {
    vi.mocked(api.fetchStaffDashboard).mockResolvedValue({ data: mockStaffDashboardData });
    vi.mocked(api.claimStaffTicket).mockResolvedValue({
      data: {
        owner: { id: 8, name: "Jane IT", email: "jane@toktickit.local" },
        updatedAt: new Date().toISOString(),
      },
    });

    const onNavigate = vi.fn();
    render(<StaffDashboard onNavigate={onNavigate} />);

    await screen.findByRole("heading", { name: "Operational Overview" });

    // My Assigned Work table
    expect(screen.getByText("VPN connection drops every 10 minutes")).toBeInTheDocument();
    expect(screen.getByText("1 Pending")).toBeInTheDocument();
    expect(screen.getByText("0 Actions")).toBeInTheDocument();

    const myWorkTicketLink = screen.getAllByRole("button", { name: "TCK-2026-00012" })[0];
    await userEvent.click(myWorkTicketLink);
    expect(onNavigate).toHaveBeenCalledWith("/staff/tickets/12");

    // Unassigned Team Work table
    expect(screen.getByText("New hire workstation setup")).toBeInTheDocument();
    const claimButton = screen.getByRole("button", { name: "Claim Ticket" });
    expect(claimButton).toBeInTheDocument();

    await userEvent.click(claimButton);
    expect(api.claimStaffTicket).toHaveBeenCalledWith(45);
    await screen.findByText("Successfully claimed ticket.");

    // Recent Action Activity
    expect(screen.getByText(/Jane IT/)).toBeInTheDocument();
    expect(screen.getAllByText(/completed action/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MTU set to 1420/)).toBeInTheDocument();
  });

  it("handles loading and recoverable error state with retry", async () => {
    vi.mocked(api.fetchStaffDashboard).mockRejectedValueOnce(new Error("Server unavailable"));

    render(<StaffDashboard onNavigate={vi.fn()} />);

    // Error state
    await screen.findByText("Server unavailable");
    const retryBtn = screen.getByRole("button", { name: "Retry" });

    // Retry succeeds
    vi.mocked(api.fetchStaffDashboard).mockResolvedValueOnce({ data: mockStaffDashboardData });
    await userEvent.click(retryBtn);

    await screen.findByRole("heading", { name: "Operational Overview" });
    expect(screen.getByTestId("metric-open-tickets")).toHaveTextContent("14");
  });

  it("re-fetches dashboard data when Refresh Data button is clicked", async () => {
    vi.mocked(api.fetchStaffDashboard).mockResolvedValue({ data: mockStaffDashboardData });
    render(<StaffDashboard onNavigate={vi.fn()} />);

    await screen.findByRole("heading", { name: "Operational Overview" });
    expect(api.fetchStaffDashboard).toHaveBeenCalledTimes(1);

    const refreshBtn = screen.getByRole("button", { name: "Refresh Data" });
    await userEvent.click(refreshBtn);
    expect(api.fetchStaffDashboard).toHaveBeenCalledTimes(2);
  });
});
