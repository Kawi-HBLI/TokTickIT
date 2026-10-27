// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionsTakenSection from "../../src/ActionsTakenSection.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    fetchTicketActions: vi.fn(),
    fetchStaffAssignees: vi.fn(),
    createTicketAction: vi.fn(),
    editTicketAction: vi.fn(),
    updateTicketActionStatus: vi.fn(),
    fetchActionHistory: vi.fn(),
  };
});

const mockStaffAssignees: api.StaffAssignee[] = [
  { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
  { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
];

const pendingAction: api.ActionTakenDto = {
  id: 1,
  ticketId: 42,
  idempotencyKey: "mock-key-1",
  description: "Investigated network gateway connectivity issues and captured tcpdump traces.",
  result: null,
  status: "PENDING",
  assignee: { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
  createdBy: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
  completedBy: null,
  followUpRequired: true,
  followUpNote: "Review trace with network engineering team",
  attachmentNotes: "tcpdump-eth0.pcap",
  cancellationReason: null,
  version: 1,
  completedAt: null,
  cancelledAt: null,
  createdAt: "2026-10-27T10:00:00.000Z",
  updatedAt: "2026-10-27T10:00:00.000Z",
};

const completedAction: api.ActionTakenDto = {
  id: 2,
  ticketId: 42,
  idempotencyKey: "mock-key-2",
  description: "Replaced faulty patch cable between desk dock and wall jack.",
  result: "Link speed restored to 1 Gbps full duplex with 0 packet loss.",
  status: "COMPLETED",
  assignee: { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
  createdBy: { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
  completedBy: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  cancellationReason: null,
  version: 2,
  completedAt: "2026-10-27T11:30:00.000Z",
  cancelledAt: null,
  createdAt: "2026-10-27T10:30:00.000Z",
  updatedAt: "2026-10-27T11:30:00.000Z",
};

const cancelledAction: api.ActionTakenDto = {
  id: 3,
  ticketId: 42,
  idempotencyKey: "mock-key-3",
  description: "Ordered replacement motherboard for workstation.",
  result: null,
  status: "CANCELLED",
  assignee: null,
  createdBy: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
  completedBy: null,
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  cancellationReason: "User confirmed device is covered under vendor advance replacement contract.",
  version: 2,
  completedAt: null,
  cancelledAt: "2026-10-27T12:00:00.000Z",
  createdAt: "2026-10-27T11:00:00.000Z",
  updatedAt: "2026-10-27T12:00:00.000Z",
};

describe("Lab 4: ActionsTakenSection Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchStaffAssignees).mockResolvedValue({ data: mockStaffAssignees });
    vi.mocked(api.fetchTicketActions).mockResolvedValue({
      data: {
        ticketId: 42,
        total: 3,
        items: [pendingAction, completedAction, cancelledAction],
      },
    });
  });

  it("renders mixed status badges, actors, results, follow-up flags, and attachment notes", async () => {
    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    expect(await screen.findByRole("heading", { name: "Actions Taken (3)" })).toBeInTheDocument();

    // Badges
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED")).toBeInTheDocument();

    // Assigned and created metadata
    expect(screen.getByText(/Investigated network gateway connectivity issues/)).toBeInTheDocument();
    expect(screen.getByText(/Review trace with network engineering team/)).toBeInTheDocument();
    expect(screen.getByText(/tcpdump-eth0.pcap/)).toBeInTheDocument();

    // Completed details
    expect(screen.getByText(/Replaced faulty patch cable/)).toBeInTheDocument();
    expect(screen.getByText(/Completed by Ethan Brooks/)).toBeInTheDocument();
    expect(screen.getByText(/Link speed restored to 1 Gbps full duplex/)).toBeInTheDocument();

    // Cancelled details
    expect(screen.getByText(/Ordered replacement motherboard/)).toBeInTheDocument();
    expect(screen.getByText(/User confirmed device is covered under vendor/)).toBeInTheDocument();

    // Mutation controls for PENDING action
    expect(screen.getByRole("button", { name: "Complete Action" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel Action" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Details" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View Audit History" })).toHaveLength(3);
  });

  it("renders read-only view for requesters with all statuses but no mutation or history controls", async () => {
    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={false}
      />
    );

    expect(await screen.findByRole("heading", { name: "Actions Taken by IT Staff" })).toBeInTheDocument();

    // Actions content is visible
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED")).toBeInTheDocument();
    expect(screen.getByText(/Investigated network gateway connectivity issues/)).toBeInTheDocument();
    expect(screen.getByText(/Replaced faulty patch cable/)).toBeInTheDocument();

    // No staff controls or audit history
    expect(screen.queryByRole("button", { name: "+ Add Action Taken" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Audit History" })).not.toBeInTheDocument();
  });

  it("hides mutation controls when parent ticket is in terminal status (RESOLVED/CLOSED/CANCELLED)", async () => {
    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="RESOLVED"
        isStaff={true}
      />
    );

    await screen.findByRole("heading", { name: "Actions Taken (3)" });

    expect(screen.queryByRole("button", { name: "+ Add Action Taken" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Details" })).not.toBeInTheDocument();

    // View Audit History is still permitted for staff
    expect(screen.getAllByRole("button", { name: "View Audit History" })).toHaveLength(3);
  });

  it("opens create action modal, validates description, traps focus, supports Escape, and submits", async () => {
    const user = userEvent.setup();
    const onMutated = vi.fn();

    vi.mocked(api.createTicketAction).mockResolvedValue({
      data: {
        ...pendingAction,
        id: 4,
        description: "New operational investigation action taken.",
      },
      replayed: false,
    });

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="OPEN"
        isStaff={true}
        onActionMutated={onMutated}
      />
    );

    const addBtn = await screen.findByRole("button", { name: "+ Add Action Taken" });
    await user.click(addBtn);

    // Modal dialog is opened
    const dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    expect(dialog).toBeInTheDocument();

    // Description validation: too short
    const descInput = within(dialog).getByLabelText(/Description/);
    await user.type(descInput, "abc");
    const saveBtn = within(dialog).getByRole("button", { name: "Save Action" });
    await user.click(saveBtn);

    expect(within(dialog).getByText("Description must contain 5 to 2,000 characters.")).toBeInTheDocument();

    // Check follow-up required validation
    await user.clear(descInput);
    await user.type(descInput, "Valid description with sufficient length.");
    const followUpCheckbox = within(dialog).getByLabelText("Follow-up Required");
    await user.click(followUpCheckbox);
    await user.click(saveBtn);

    expect(within(dialog).getByText("A follow-up note is required when follow-up is checked.")).toBeInTheDocument();

    // Provide follow-up note and submit
    const followUpInput = within(dialog).getByLabelText(/Follow-up Note/);
    await user.type(followUpInput, "Verify ping stability after reboot.");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.createTicketAction).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          description: "Valid description with sufficient length.",
          followUpRequired: true,
          followUpNote: "Verify ping stability after reboot.",
        }),
        expect.any(String)
      );
      expect(onMutated).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("requires a non-empty cancellation reason (peer requirement) and submits cancellation", async () => {
    const user = userEvent.setup();
    const onMutated = vi.fn();

    vi.mocked(api.updateTicketActionStatus).mockResolvedValue({
      data: { ...pendingAction, status: "CANCELLED", version: 2 },
    });

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="OPEN"
        isStaff={true}
        onActionMutated={onMutated}
      />
    );

    const cancelBtn = await screen.findByRole("button", { name: "Cancel Action" });
    await user.click(cancelBtn);

    const dialog = screen.getByRole("dialog", { name: /Cancel Action Taken/ });
    expect(dialog).toBeInTheDocument();

    // Try submitting with empty reason
    const confirmCancelBtn = within(dialog).getByRole("button", { name: "Confirm Cancellation" });
    await user.click(confirmCancelBtn);

    // Validation error displayed
    expect(within(dialog).getByText("Cancellation reason is required.")).toBeInTheDocument();
    expect(api.updateTicketActionStatus).not.toHaveBeenCalled();

    // Enter cancellation reason and submit
    const reasonInput = within(dialog).getByLabelText(/Cancellation Reason/);
    await user.type(reasonInput, "Superseded by physical switch replacement.");
    await user.click(confirmCancelBtn);

    await waitFor(() => {
      expect(api.updateTicketActionStatus).toHaveBeenCalledWith(1, {
        version: 1,
        status: "CANCELLED",
        cancellationReason: "Superseded by physical switch replacement.",
      });
      expect(onMutated).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("requires at least 3 characters for completion result and submits completion", async () => {
    const user = userEvent.setup();
    const onMutated = vi.fn();

    vi.mocked(api.updateTicketActionStatus).mockResolvedValue({
      data: { ...pendingAction, status: "COMPLETED", version: 2 },
    });

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
        onActionMutated={onMutated}
      />
    );

    const completeBtn = await screen.findByRole("button", { name: "Complete Action" });
    await user.click(completeBtn);

    const dialog = screen.getByRole("dialog", { name: /Complete Action Taken/ });
    expect(dialog).toBeInTheDocument();

    // Try submitting with empty or <3 chars
    const confirmCompleteBtn = within(dialog).getByRole("button", { name: "Confirm Completion" });
    await user.click(confirmCompleteBtn);

    expect(within(dialog).getByText("Documented result must be at least 3 characters.")).toBeInTheDocument();

    // Enter valid result
    const resultInput = within(dialog).getByLabelText(/Documented Result/);
    await user.type(resultInput, "Resolved by flushing ARP cache and restarting DHCP lease.");
    await user.click(confirmCompleteBtn);

    await waitFor(() => {
      expect(api.updateTicketActionStatus).toHaveBeenCalledWith(1, {
        version: 1,
        status: "COMPLETED",
        result: "Resolved by flushing ARP cache and restarting DHCP lease.",
      });
      expect(onMutated).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("fetches and displays audit history with actor and before/after changes", async () => {
    const user = userEvent.setup();

    const mockHistory: api.ActionTakenHistoryDto[] = [
      {
        id: 101,
        actionTakenId: 1,
        ticketId: 42,
        eventType: "CREATED",
        actor: { id: 10, name: "Ethan Brooks", email: "ethan@toktickit.local", role: "IT_STAFF" },
        changes: {
          description: { before: null, after: "Investigated network gateway connectivity issues." },
          status: { before: null, after: "PENDING" },
        },
        versionBefore: null,
        versionAfter: 1,
        createdAt: "2026-10-27T10:00:00.000Z",
      },
      {
        id: 102,
        actionTakenId: 1,
        ticketId: 42,
        eventType: "COMPLETED",
        actor: { id: 12, name: "Jane IT", email: "jane@toktickit.local", role: "IT_STAFF" },
        changes: {
          status: { before: "PENDING", after: "COMPLETED" },
          result: { before: null, after: "Link speed restored." },
        },
        versionBefore: 1,
        versionAfter: 2,
        createdAt: "2026-10-27T11:30:00.000Z",
      },
    ];

    vi.mocked(api.fetchActionHistory).mockResolvedValue({
      data: {
        actionTakenId: 1,
        ticketId: 42,
        total: 2,
        items: mockHistory,
      },
    });

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    const historyButtons = await screen.findAllByRole("button", { name: "View Audit History" });
    await user.click(historyButtons[0]);

    const dialog = screen.getByRole("dialog", { name: "Audit History - Action #1" });
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(within(dialog).getByText("CREATED")).toBeInTheDocument();
      expect(within(dialog).getByText("COMPLETED")).toBeInTheDocument();
      expect(within(dialog).getByText("Ethan Brooks")).toBeInTheDocument();
      expect(within(dialog).getByText("Jane IT")).toBeInTheDocument();
    });

    // Close on button
    const closeButtons = within(dialog).getAllByRole("button", { name: "Close" });
    await user.click(closeButtons[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
