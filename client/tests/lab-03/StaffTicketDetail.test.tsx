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
    claimStaffTicket: vi.fn(),
    updateStaffTicketOwner: vi.fn(),
    updateStaffTicketPriority: vi.fn(),
    updateStaffTicketStatus: vi.fn(),
    createPublicComment: vi.fn(),
    createInternalNote: vi.fn(),
    previewAttachmentFile: vi.fn(),
    downloadAttachmentFile: vi.fn(),
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
  { id: 12, name: "Marcus Vance", email: "marcus@toktickit.local", role: "IT_STAFF" },
  { id: 15, name: "Sarah Admin", email: "sarah@toktickit.local", role: "ADMINISTRATOR" },
];

const sampleTicket: api.StaffTicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-00042",
  createdAt: "2026-09-10T10:00:00.000Z",
  updatedAt: "2026-09-10T10:15:00.000Z",
  summary: "VPN authentication timeout error",
  description: "Unable to connect to the corporate VPN gateway from remote office.",
  category: { id: 2, name: "Network & VPN" },
  relatedSystem: { id: 8, name: "Corporate VPN" },
  requester: { id: 1, name: "Amina Rahman", email: "amina@example.com" },
  owner: null,
  requestedPriority: "HIGH",
  itPriority: "HIGH",
  currentStatus: "NEW",
  requesterResolutionIndicatedAt: null,
  requesterResolutionIndicatedBy: null,
  publicComments: [],
  internalNotes: [],
  attachments: [],
};

const sampleAttachment: api.AttachmentItem = {
  id: 88,
  originalName: "system-logs.txt",
  mimeType: "text/plain",
  sizeBytes: 2048,
  createdAt: "2026-09-10T10:05:00.000Z",
  isRemoved: false,
};

function renderComponent(ticketId = 42, onNavigate = vi.fn()) {
  return render(
    <RequesterProvider>
      <StaffTicketDetail ticketId={ticketId} onNavigate={onNavigate} />
    </RequesterProvider>
  );
}

describe("UI-DETAIL-01 & UI-DISC-01: IT Staff Ticket Detail Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentUser).mockResolvedValue({
      user: currentStaffUser,
      csrfToken: "mock-csrf-token",
    });
    vi.mocked(api.fetchAssignees).mockResolvedValue({ data: mockAssignees });
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: sampleTicket });
  });

  it("renders ticket overview, owner, requested priority, IT priority, and status", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TKT-2026-00042" })).toBeInTheDocument();
    });

    expect(screen.getByText("VPN authentication timeout error")).toBeInTheDocument();
    expect(screen.getByText("Amina Rahman")).toBeInTheDocument();
    expect(screen.getByText("Network & VPN")).toBeInTheDocument();
    expect(screen.getByText("Corporate VPN")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
  });

  it("claims an unassigned ticket when Claim button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.claimStaffTicket).mockResolvedValue({
      data: {
        owner: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local" },
        updatedAt: "2026-09-10T10:30:00.000Z",
      },
    });

    renderComponent();
    const claimBtn = await screen.findByRole("button", { name: "Claim Ticket" });
    await user.click(claimBtn);

    expect(api.claimStaffTicket).toHaveBeenCalledWith(42);
    await waitFor(() => {
      expect(screen.getByText("You claimed this ticket.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Claim Ticket" })).not.toBeInTheDocument();
    });
  });

  it("prompts confirmation dialog when reassigning owner and confirms reassignment", async () => {
    const user = userEvent.setup();
    const assignedTicket = {
      ...sampleTicket,
      owner: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local" },
    };
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: assignedTicket });
    vi.mocked(api.updateStaffTicketOwner).mockResolvedValue({
      data: {
        owner: { id: 12, name: "Marcus Vance", email: "marcus@toktickit.local" },
        updatedAt: "2026-09-10T10:35:00.000Z",
      },
    });

    renderComponent();
    const ownerSelect = await screen.findByLabelText("Ticket Owner");
    await user.selectOptions(ownerSelect, "12");

    // Confirmation dialog should appear
    expect(screen.getByRole("dialog", { name: "Reassign Ticket Owner?" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to assign this ticket to Marcus Vance?/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Reassignment" });
    await user.click(confirmBtn);

    expect(api.updateStaffTicketOwner).toHaveBeenCalledWith(42, 12, "2026-09-10T10:15:00.000Z");
    await waitFor(() => {
      expect(screen.getByText("Ticket assigned to Marcus Vance.")).toBeInTheDocument();
    });
  });

  it("prompts confirmation dialog when unassigning owner and confirms unassignment", async () => {
    const user = userEvent.setup();
    const assignedTicket = {
      ...sampleTicket,
      owner: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local" },
    };
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: assignedTicket });
    vi.mocked(api.updateStaffTicketOwner).mockResolvedValue({
      data: {
        owner: null,
        updatedAt: "2026-09-10T10:35:00.000Z",
      },
    });

    renderComponent();
    const ownerSelect = await screen.findByLabelText("Ticket Owner");
    await user.selectOptions(ownerSelect, "unassigned");

    // Confirmation dialog should appear
    expect(screen.getByRole("dialog", { name: "Unassign Ticket Owner?" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to unassign this ticket?")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Unassignment" });
    await user.click(confirmBtn);

    expect(api.updateStaffTicketOwner).toHaveBeenCalledWith(42, null, "2026-09-10T10:15:00.000Z");
    await waitFor(() => {
      expect(screen.getByText("Ticket unassigned.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
    });
  });

  it("triggers previewAttachmentFile and downloadAttachmentFile using centralized api helpers", async () => {
    const user = userEvent.setup();
    const ticketWithAttachment = {
      ...sampleTicket,
      attachments: [sampleAttachment],
    };
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: ticketWithAttachment });
    vi.mocked(api.previewAttachmentFile).mockResolvedValue({
      blob: new Blob(["dummy content"], { type: "text/plain" }),
      contentType: "text/plain",
    });
    vi.mocked(api.downloadAttachmentFile).mockResolvedValue({
      blob: new Blob(["dummy content"], { type: "text/plain" }),
      contentType: "text/plain",
    });

    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-blob-url");
    URL.revokeObjectURL = vi.fn();
    window.open = vi.fn();

    try {
      renderComponent();
      await screen.findByText("system-logs.txt");

      const previewBtn = screen.getByRole("button", { name: "Preview" });
      await user.click(previewBtn);
      expect(api.previewAttachmentFile).toHaveBeenCalledWith(88);

      const downloadBtn = screen.getByRole("button", { name: "Download" });
      await user.click(downloadBtn);
      expect(api.downloadAttachmentFile).toHaveBeenCalledWith(88);
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it("updates IT priority when changed and submitted", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateStaffTicketPriority).mockResolvedValue({
      data: {
        requestedPriority: "HIGH",
        itPriority: "CRITICAL",
        updatedAt: "2026-09-10T10:40:00.000Z",
      },
    });

    renderComponent();
    const prioritySelect = await screen.findByLabelText("IT Priority");
    await user.selectOptions(prioritySelect, "CRITICAL");

    const updateBtn = screen.getByRole("button", { name: "Update Priority" });
    await user.click(updateBtn);

    expect(api.updateStaffTicketPriority).toHaveBeenCalledWith(42, "CRITICAL", "2026-09-10T10:15:00.000Z");
    await waitFor(() => {
      expect(screen.getByText("IT Priority updated to CRITICAL.")).toBeInTheDocument();
    });
  });

  it("shows confirmation dialog for status transitions requiring confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateStaffTicketStatus).mockResolvedValue({
      data: {
        previousStatus: "NEW",
        currentStatus: "CANCELLED",
        requesterResolutionIndicatedAt: null,
        requesterResolutionIndicatedBy: null,
        updatedAt: "2026-09-10T10:45:00.000Z",
      },
    });

    renderComponent();
    const statusSelect = await screen.findByLabelText("Status Transition");
    await user.selectOptions(statusSelect, "CANCELLED");

    // Confirmation dialog should appear
    expect(screen.getByRole("dialog", { name: "Change Status to Cancelled?" })).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Status Change" });
    await user.click(confirmBtn);

    expect(api.updateStaffTicketStatus).toHaveBeenCalledWith(42, "CANCELLED", "2026-09-10T10:15:00.000Z");
    await waitFor(() => {
      expect(screen.getByText("Ticket status updated to Cancelled.")).toBeInTheDocument();
    });
  });

  it("displays version conflict banner when API returns 409 conflict", async () => {
    const user = userEvent.setup();
    const conflictError = new api.ApiError("Ticket was modified by another operation.", 409, "TICKET_VERSION_CONFLICT");
    vi.mocked(api.claimStaffTicket).mockRejectedValue(conflictError);

    renderComponent();
    const claimBtn = await screen.findByRole("button", { name: "Claim Ticket" });
    await user.click(claimBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ticket was modified/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh Ticket" })).toBeInTheDocument();
    });
  });

  it("posts a public comment and clears draft on success", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPublicComment).mockResolvedValue({
      data: {
        id: 1,
        ticketId: 42,
        content: "We are actively investigating the router issue.",
        createdAt: "2026-09-10T11:00:00.000Z",
        author: { id: 10, name: "Ethan Brooks", role: "IT_STAFF" },
      },
    });

    renderComponent();
    const textarea = await screen.findByLabelText("Add a public comment");
    await user.type(textarea, "We are actively investigating the router issue.");

    const submitBtn = screen.getByRole("button", { name: "Post public comment" });
    await user.click(submitBtn);

    expect(api.createPublicComment).toHaveBeenCalledWith(42, "We are actively investigating the router issue.");
    await waitFor(() => {
      expect(screen.getByText("Public comment posted.")).toBeInTheDocument();
      expect(screen.getByText("We are actively investigating the router issue.")).toBeInTheDocument();
      expect(textarea).toHaveValue("");
    });
  });

  it("retains typed public comment draft when posting fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPublicComment).mockRejectedValue(new Error("Network connection dropped"));

    renderComponent();
    const textarea = await screen.findByLabelText("Add a public comment");
    await user.type(textarea, "Draft public comment");

    const submitBtn = screen.getByRole("button", { name: "Post public comment" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Network connection dropped")).toBeInTheDocument();
      expect(textarea).toHaveValue("Draft public comment");
    });
  });

  it("posts an internal note and clears draft on success", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createInternalNote).mockResolvedValue({
      data: {
        id: 101,
        content: "Internal notes: checked firewall policy ID 99.",
        createdAt: "2026-09-10T11:05:00.000Z",
        author: { id: 10, name: "Ethan Brooks", role: "IT_STAFF" },
      },
    });

    renderComponent();
    const noteTextarea = await screen.findByLabelText("Add an internal note");
    await user.type(noteTextarea, "Internal notes: checked firewall policy ID 99.");

    const submitBtn = screen.getByRole("button", { name: "Add internal note" });
    await user.click(submitBtn);

    expect(api.createInternalNote).toHaveBeenCalledWith(42, "Internal notes: checked firewall policy ID 99.");
    await waitFor(() => {
      expect(screen.getByText("Internal note added.")).toBeInTheDocument();
      expect(screen.getByText("Internal notes: checked firewall policy ID 99.")).toBeInTheDocument();
      expect(noteTextarea).toHaveValue("");
    });
  });

  it("renders resolution indication banner when requester indicated resolved", async () => {
    const resolvedIndicatedTicket = {
      ...sampleTicket,
      currentStatus: "IN_PROGRESS" as api.TicketStatus,
      requesterResolutionIndicatedAt: "2026-09-10T12:00:00.000Z",
      requesterResolutionIndicatedBy: { id: 1, name: "Amina Rahman" },
    };
    vi.mocked(api.fetchStaffTicketDetail).mockResolvedValue({ data: resolvedIndicatedTicket });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Requester indicated problem appears resolved")).toBeInTheDocument();
    });
  });
});
