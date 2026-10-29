import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RequesterDashboard from "../../src/RequesterDashboard.js";
import * as api from "../../src/api.js";
import * as RequesterContext from "../../src/RequesterContext.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    fetchRequesterDashboard: vi.fn(),
  };
});

vi.mock("../../src/RequesterContext.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/RequesterContext.js")>();
  return {
    ...actual,
    useRequester: vi.fn(),
  };
});

const mockRequesterUser: api.CurrentUser = {
  id: 1,
  name: "Sarah Connors",
  email: "sarah@toktickit.local",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const mockRequesterDashboardData: api.RequesterDashboardData = {
  metrics: {
    activeTicketsCount: 3,
    awaitingRequesterCount: 1,
    resolvedClosedCount: 8,
  },
  recentTickets: [
    {
      id: 33,
      ticketNumber: "TCK-2026-00033",
      summary: "Need access to Figma workspace",
      currentStatus: "WAITING_FOR_REQUESTER",
      latestPublicUpdate: "Staff commented: Please provide your corporate Adobe ID.",
      updatedAt: "2026-10-27T13:45:00.000Z",
    },
    {
      id: 28,
      ticketNumber: "TCK-2026-00028",
      summary: "Outlook calendar sync failure on Mac",
      currentStatus: "RESOLVED",
      latestPublicUpdate: "Action completed: Cleared corrupt Exchange cache.",
      updatedAt: "2026-10-27T09:15:00.000Z",
    },
  ],
};

describe("TEST-UI-09: Requester Dashboard Component & Drill-Downs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(RequesterContext.useRequester).mockReturnValue({
      currentRequester: mockRequesterUser,
      currentUser: mockRequesterUser,
      loadState: "ready",
      retry: vi.fn(),
      login: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("renders 3 metric cards with correct server counts and exact drill-down URLs", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({ data: mockRequesterDashboardData });
    const onNavigate = vi.fn();
    render(<RequesterDashboard onNavigate={onNavigate} />);

    // Wait for greeting
    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors! Here is the status of your requests\./i,
    });

    // 1. Active Tickets card
    const activeCard = screen.getByTestId("metric-active-tickets");
    expect(activeCard).toHaveTextContent("ACTIVE TICKETS");
    expect(activeCard).toHaveTextContent("3");
    const activeLink = activeCard.querySelector("button")!;
    await userEvent.click(activeLink);
    expect(onNavigate).toHaveBeenCalledWith("/tickets?statusGroup=active");

    // 2. Awaiting Your Input card
    const awaitingCard = screen.getByTestId("metric-awaiting-input");
    expect(awaitingCard).toHaveTextContent("AWAITING YOUR INPUT");
    expect(awaitingCard).toHaveTextContent("1");
    const awaitingLink = awaitingCard.querySelector("button")!;
    await userEvent.click(awaitingLink);
    expect(onNavigate).toHaveBeenCalledWith("/tickets?status=WAITING_FOR_REQUESTER");

    // 3. Resolved & Closed card
    const resolvedCard = screen.getByTestId("metric-resolved-closed");
    expect(resolvedCard).toHaveTextContent("RESOLVED & CLOSED");
    expect(resolvedCard).toHaveTextContent("8");
    const resolvedLink = resolvedCard.querySelector("button")!;
    await userEvent.click(resolvedLink);
    expect(onNavigate).toHaveBeenCalledWith("/tickets?statusGroup=resolved_closed");
  });

  it("navigates to Create Ticket when CTA button is clicked", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({ data: mockRequesterDashboardData });
    const onNavigate = vi.fn();
    render(<RequesterDashboard onNavigate={onNavigate} />);

    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors!/i,
    });

    const createBtn = screen.getByRole("button", { name: /Create New Ticket/i });
    await userEvent.click(createBtn);
    expect(onNavigate).toHaveBeenCalledWith("/tickets/new");
  });

  it("renders Recent Ticket Activity table with privacy-safe updates and ticket links", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({ data: mockRequesterDashboardData });
    const onNavigate = vi.fn();
    render(<RequesterDashboard onNavigate={onNavigate} />);

    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors!/i,
    });

    expect(screen.getByText("Need access to Figma workspace")).toBeInTheDocument();
    expect(screen.getByText("Staff commented: Please provide your corporate Adobe ID.")).toBeInTheDocument();
    expect(screen.getByText("Outlook calendar sync failure on Mac")).toBeInTheDocument();
    expect(screen.getByText("Action completed: Cleared corrupt Exchange cache.")).toBeInTheDocument();

    const ticketLink = screen.getByRole("button", { name: "TCK-2026-00033" });
    await userEvent.click(ticketLink);
    expect(onNavigate).toHaveBeenCalledWith("/tickets/33");
  });

  it("displays server zero counts directly and handles empty ticket list", async () => {
    const zeroData: api.RequesterDashboardData = {
      metrics: {
        activeTicketsCount: 0,
        awaitingRequesterCount: 0,
        resolvedClosedCount: 0,
      },
      recentTickets: [],
    };
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({ data: zeroData });
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors!/i,
    });

    expect(screen.getByTestId("metric-active-tickets")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-awaiting-input")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-resolved-closed")).toHaveTextContent("0");
    expect(screen.getByText("No recent ticket activity.")).toBeInTheDocument();
  });

  it("handles recoverable error with retry", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockRejectedValueOnce(new Error("Network timeout"));
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    await screen.findByText("Network timeout");
    const retryBtn = screen.getByRole("button", { name: "Retry" });

    vi.mocked(api.fetchRequesterDashboard).mockResolvedValueOnce({ data: mockRequesterDashboardData });
    await userEvent.click(retryBtn);

    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors!/i,
    });
    expect(screen.getByTestId("metric-active-tickets")).toHaveTextContent("3");
  });

  it("re-fetches dashboard data when Refresh Data button is clicked", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({ data: mockRequesterDashboardData });
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    await screen.findByRole("heading", {
      name: /Welcome back, Sarah Connors!/i,
    });
    expect(api.fetchRequesterDashboard).toHaveBeenCalledTimes(1);

    const refreshBtn = screen.getByRole("button", { name: "Refresh Data" });
    await userEvent.click(refreshBtn);
    expect(api.fetchRequesterDashboard).toHaveBeenCalledTimes(2);
  });
});
