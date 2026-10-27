// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import * as api from "../../src/api.js";
import { RequesterProvider } from "../../src/RequesterContext.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    fetchStaffTicketDetail: vi.fn(),
    fetchAssignees: vi.fn(),
    fetchStaffAssignees: vi.fn(),
    updateStaffTicketStatus: vi.fn(),
    fetchTicketActions: vi.fn(),
  };
});

const currentStaffUser: api.CurrentUser = {
  id: 10,
  name: "Ethan Brooks",
  email: "ethan@toktickit.local",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

const mockAssignees: api.Assignee[] = [
  { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
  { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
];

const openTicket: api.StaffTicketDetail = {
  id: 55,
  ticketNumber: "TCK-2026-00055",
  createdAt: "2026-10-27T10:00:00.000Z",
  updatedAt: "2026-10-27T10:15:00.000Z",
  summary: "Database connection pool exhaustion",
  description: "Connections timing out under load.",
  category: { id: 2, name: "Database" },
  relatedSystem: { id: 4, name: "PostgreSQL" },
  requester: { id: 1, name: "Sarah Requester", email: "sarah@toktickit.local" },
  owner: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local" },
  requestedPriority: "HIGH",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  requesterResolutionIndicatedAt: null,
  requesterResolutionIndicatedBy: null,
  publicComments: [],
  internalNotes: [],
  attachments: [],
};

describe("Lab 4: TicketWorkflow Resolution Gate Feedback Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentUser).mockResolvedValue({
      user: currentStaffUser,
      csrfToken: "mock-csrf-token",
    });
    vi.mocked(api.fetchAssignees).mockResolvedValue({ data: mockAssignees });
    vi.mocked(api.fetchStaffAssignees).mockResolvedValue({ data: mockAssignees as any });
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: openTicket });
    vi.mocked(api.fetchTicketActions).mockResolvedValue({
      data: { ticketId: 55, total: 0, items: [] },
    });
  });

  function renderStaffTicketDetail(ticketId = 55) {
    return render(
      <RequesterProvider>
        <StaffTicketDetail ticketId={ticketId} onNavigate={vi.fn()} />
      </RequesterProvider>
    );
  }

  it("displays explicit resolution gate alert when resolving fails with unfulfilled prerequisites", async () => {
    const user = userEvent.setup();

    // Mock 422 Resolution Gate error
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValue(
      new api.ApiError(
        "Ticket must have at least one completed Action Taken with documented results before resolution.",
        422,
        "RESOLUTION_GATE_NO_COMPLETED_ACTION"
      )
    );

    renderStaffTicketDetail();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TCK-2026-00055" })).toBeInTheDocument();
    });

    // Select RESOLVED status from dropdown
    const statusSelect = screen.getByLabelText("Status Transition");
    await user.selectOptions(statusSelect, "RESOLVED");

    // Confirmation dialog appears for RESOLVED transition
    const confirmDialog = await screen.findByRole("dialog", { name: /Change Status to Resolved/i });
    expect(confirmDialog).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Status Change" });
    await user.click(confirmBtn);

    // Resolution Gate alert banner is displayed with role="alert"
    const alertBanner = await screen.findByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveClass("resolution-gate-banner");
    expect(screen.getByText("CANNOT RESOLVE TICKET: RESOLUTION REQUIREMENTS NOT MET")).toBeInTheDocument();
    expect(
      screen.getByText("Ticket must have at least one completed Action Taken with documented results before resolution.")
    ).toBeInTheDocument();

    // Check prerequisites list
    expect(screen.getByText(/Primary Ticket Owner assigned/)).toBeInTheDocument();
    expect(screen.getByText(/At least one COMPLETED Action Taken with documented results/)).toBeInTheDocument();
    expect(screen.getByText(/Zero PENDING Actions Taken/)).toBeInTheDocument();

    // Dismiss Alert button works
    const dismissBtns = screen.getAllByRole("button", { name: "Dismiss Alert" });
    await user.click(dismissBtns[0]);

    expect(screen.queryByText("CANNOT RESOLVE TICKET: RESOLUTION REQUIREMENTS NOT MET")).not.toBeInTheDocument();
  });

  it("successfully resolves ticket when gate prerequisites are met and refreshes data", async () => {
    const user = userEvent.setup();

    vi.mocked(api.updateStaffTicketStatus).mockResolvedValue({
      data: {
        previousStatus: "IN_PROGRESS",
        currentStatus: "RESOLVED",
        requesterResolutionIndicatedAt: null,
        requesterResolutionIndicatedBy: null,
        updatedAt: "2026-10-27T10:45:00.000Z",
      },
    });

    renderStaffTicketDetail();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TCK-2026-00055" })).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText("Status Transition");
    await user.selectOptions(statusSelect, "RESOLVED");

    const confirmDialog = await screen.findByRole("dialog", { name: /Change Status to Resolved/i });
    expect(confirmDialog).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Status Change" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(55, "RESOLVED", "2026-10-27T10:15:00.000Z");
      expect(screen.getByText("Ticket status updated to Resolved.")).toBeInTheDocument();
      expect(screen.queryByText("CANNOT RESOLVE TICKET: RESOLUTION REQUIREMENTS NOT MET")).not.toBeInTheDocument();
      // Verifies data reload is triggered to refresh version tokens
      expect(api.fetchStaffTicketDetail).toHaveBeenCalledTimes(2);
    });
  });

  it("recovers from status-transition conflict (409) via Refresh Ticket and retry", async () => {
    const user = userEvent.setup();

    renderStaffTicketDetail();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TCK-2026-00055" })).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText("Status Transition");
    await user.selectOptions(statusSelect, "RESOLVED");

    const confirmDialog = await screen.findByRole("dialog", { name: /Change Status to Resolved/i });
    expect(confirmDialog).toBeInTheDocument();

    // Mock 409 conflict
    vi.mocked(api.updateStaffTicketStatus).mockRejectedValueOnce(
      new api.ApiError("Ticket was modified by another operation.", 409, "TICKET_VERSION_CONFLICT")
    );

    const confirmBtn = screen.getByRole("button", { name: "Confirm Status Change" });
    await user.click(confirmBtn);

    // Conflict banner appears
    await waitFor(() => {
      expect(screen.getByText("Ticket was modified by another operation.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh Ticket" })).toBeInTheDocument();
    });

    // Fresh ticket state with new updatedAt
    const freshTicket = {
      ...openTicket,
      updatedAt: "2026-10-27T10:30:00.000Z",
    };
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValueOnce({
      data: freshTicket,
    });

    // Click Refresh Ticket
    const refreshBtn = screen.getByRole("button", { name: "Refresh Ticket" });
    await user.click(refreshBtn);

    // Conflict banner is dismissed and fresh ticket loaded
    await waitFor(() => {
      expect(screen.queryByText("Ticket was modified by another operation.")).not.toBeInTheDocument();
    });

    // User can now re-attempt status transition with fresh updatedAt
    const freshStatusSelect = screen.getByLabelText("Status Transition");
    await user.selectOptions(freshStatusSelect, "RESOLVED");
    const confirmDialog2 = await screen.findByRole("dialog", { name: /Change Status to Resolved/i });
    expect(confirmDialog2).toBeInTheDocument();

    vi.mocked(api.updateStaffTicketStatus).mockResolvedValueOnce({
      data: {
        ...freshTicket,
        currentStatus: "RESOLVED",
        previousStatus: "IN_PROGRESS",
      },
    });

    const confirmBtn2 = screen.getByRole("button", { name: "Confirm Status Change" });
    await user.click(confirmBtn2);

    await waitFor(() => {
      expect(screen.getByText("Ticket status updated to Resolved.")).toBeInTheDocument();
    });

    // Verify called with fresh updatedAt
    expect(api.updateStaffTicketStatus).toHaveBeenLastCalledWith(
      55,
      "RESOLVED",
      "2026-10-27T10:30:00.000Z"
    );
  });
});
