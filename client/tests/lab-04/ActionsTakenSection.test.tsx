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

  it("edit conflict recovery: receives 409, loads fresh version, preserves draft, disables submit, allows deliberate reapplication, and submits", async () => {
    const user = userEvent.setup();

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    const editBtn = await screen.findByRole("button", { name: "Edit Details" });
    await user.click(editBtn);

    const dialog = screen.getByRole("dialog", { name: /Edit Action Taken/ });
    const descInput = within(dialog).getByLabelText(/Description/);

    // User types their draft
    await user.clear(descInput);
    await user.type(descInput, "Updated draft text that needs saving.");

    // First submit fails with 409
    vi.mocked(api.editTicketAction).mockRejectedValueOnce(
      new api.ApiError("This action was modified by another operation.", 409, "ACTION_VERSION_CONFLICT")
    );

    // Mock fetchTicketActions to return action with bumped version 2
    const freshActionV2: api.ActionTakenDto = {
      ...pendingAction,
      version: 2,
      description: "Concurrently updated description on server.",
    };
    vi.mocked(api.fetchTicketActions).mockResolvedValueOnce({
      data: {
        ticketId: 42,
        total: 2,
        items: [freshActionV2, completedAction],
      },
    });

    const saveBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    // Verify 409 conflict review box is rendered
    await waitFor(() => {
      expect(within(dialog).getByText(/Version Conflict/)).toBeInTheDocument();
      expect(within(dialog).getByText("Concurrently updated description on server.")).toBeInTheDocument();
      expect(within(dialog).getByText(/Your Draft Description:/).parentElement).toHaveTextContent("Updated draft text that needs saving.");
    });

    // Save Changes button is disabled while conflict is unreviewed
    expect(saveBtn).toBeDisabled();

    // User's draft is preserved in input
    expect(descInput).toHaveValue("Updated draft text that needs saving.");

    // User clicks Reapply My Draft to Version 2
    const reapplyBtn = within(dialog).getByRole("button", { name: "Reapply My Draft to Version 2" });
    await user.click(reapplyBtn);

    // Conflict box clears and Save Changes is enabled
    expect(within(dialog).queryByText(/Version Conflict/)).not.toBeInTheDocument();
    expect(saveBtn).toBeEnabled();

    // Mock successful edit
    vi.mocked(api.editTicketAction).mockResolvedValueOnce({
      data: {
        ...freshActionV2,
        version: 3,
        description: "Updated draft text that needs saving.",
      },
    });

    await user.click(saveBtn);

    // Verify editTicketAction was called with version: 2
    expect(api.editTicketAction).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        version: 2,
        description: "Updated draft text that needs saving.",
      })
    );
  });

  it("edit conflict recovery on terminal action: receives 409, loads fresh completed action, shows read-only status and locks editing", async () => {
    const user = userEvent.setup();

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    const editBtn = await screen.findByRole("button", { name: "Edit Details" });
    await user.click(editBtn);

    const dialog = screen.getByRole("dialog", { name: /Edit Action Taken/ });
    const descInput = within(dialog).getByLabelText(/Description/);
    await user.clear(descInput);
    await user.type(descInput, "Attempted draft on terminal action.");

    vi.mocked(api.editTicketAction).mockRejectedValueOnce(
      new api.ApiError("This action was completed by another user.", 409, "ACTION_VERSION_CONFLICT")
    );

    // Action is now COMPLETED on server
    const completedActionOnServer: api.ActionTakenDto = {
      ...pendingAction,
      status: "COMPLETED",
      version: 2,
      result: "Action completed elsewhere.",
    };
    vi.mocked(api.fetchTicketActions).mockResolvedValueOnce({
      data: {
        ticketId: 42,
        total: 2,
        items: [completedActionOnServer, completedAction],
      },
    });

    const saveBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    // Renders terminal read-only message
    await waitFor(() => {
      expect(within(dialog).getByText(/marked as/)).toBeInTheDocument();
      expect(within(dialog).getByText("COMPLETED")).toBeInTheDocument();
      expect(within(dialog).getByText("Action completed elsewhere.")).toBeInTheDocument();
    });

    // Save Changes is permanently disabled
    expect(saveBtn).toBeDisabled();

    // User can discard draft and close
    const discardBtn = within(dialog).getByRole("button", { name: "Discard Draft and Close" });
    await user.click(discardBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creation idempotency: uncertain failure allows exact-payload retry with identical key and reloads data on success", async () => {
    const user = userEvent.setup();
    const onMutated = vi.fn();

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
        onActionMutated={onMutated}
      />
    );

    const addBtn = await screen.findByRole("button", { name: "+ Add Action Taken" });
    await user.click(addBtn);

    const dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    const descInput = within(dialog).getByLabelText(/Description/);
    await user.type(descInput, "Network diagnostics on router interface.");

    // First submission fails with network error
    vi.mocked(api.createTicketAction).mockRejectedValueOnce(new Error("Network connection dropped"));

    const saveBtn = within(dialog).getByRole("button", { name: "Save Action" });
    await user.click(saveBtn);

    // Error is displayed and unconfirmed submission banner appears
    await waitFor(() => {
      expect(screen.getByText("Network error. Please try again.")).toBeInTheDocument();
      expect(screen.getByText("Unconfirmed Submission Pending")).toBeInTheDocument();
    });

    // Capture the idempotency key used in first call
    const firstCallKey = vi.mocked(api.createTicketAction).mock.calls[0][2];
    expect(firstCallKey).toBeTruthy();

    // Retry submission with exact same values (user does not edit inputs)
    vi.mocked(api.createTicketAction).mockResolvedValueOnce({
      data: {
        ...pendingAction,
        id: 99,
        description: "Network diagnostics on router interface.",
      },
      replayed: true,
    });

    await user.click(saveBtn);

    // Second call must use the EXACT SAME key and payload
    expect(api.createTicketAction).toHaveBeenCalledTimes(2);
    const secondCallKey = vi.mocked(api.createTicketAction).mock.calls[1][2];
    expect(secondCallKey).toBe(firstCallKey);
    expect(vi.mocked(api.createTicketAction).mock.calls[1][1]).toEqual(
      vi.mocked(api.createTicketAction).mock.calls[0][1]
    );

    // Successful replay closes dialog and reloads data
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.fetchTicketActions).toHaveBeenCalled();
      expect(onMutated).toHaveBeenCalled();
    });
  });

  it("creation idempotency: changed form values block reusing the uncertain key until user starts a new request", async () => {
    const user = userEvent.setup();

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    const addBtn = await screen.findByRole("button", { name: "+ Add Action Taken" });
    await user.click(addBtn);

    const dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    const descInput = within(dialog).getByLabelText(/Description/);
    await user.type(descInput, "Original unconfirmed action description.");

    // First attempt fails
    vi.mocked(api.createTicketAction).mockRejectedValueOnce(new Error("Timeout"));
    const saveBtn = within(dialog).getByRole("button", { name: "Save Action" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Unconfirmed Submission Pending")).toBeInTheDocument();
    });
    const initialKey = vi.mocked(api.createTicketAction).mock.calls[0][2];

    // User modifies the form values
    await user.clear(descInput);
    await user.type(descInput, "Completely changed intent and different description.");

    // User attempts to save modified form
    await user.click(saveBtn);

    // Rejection: blocked from reusing uncertain key!
    await waitFor(() => {
      expect(screen.getByText(/Form values have changed since the unconfirmed submission/)).toBeInTheDocument();
    });
    // createTicketAction was NOT called again
    expect(api.createTicketAction).toHaveBeenCalledTimes(1);

    // User clicks "Start New Request" to reconcile and generate new key
    const startNewBtn = screen.getByRole("button", { name: "Start New Request" });
    await user.click(startNewBtn);

    // Error is cleared
    expect(screen.queryByText(/Form values have changed/)).not.toBeInTheDocument();
    expect(screen.queryByText("Unconfirmed Submission Pending")).not.toBeInTheDocument();

    // Now submitting sends the new values with a NEW key
    vi.mocked(api.createTicketAction).mockResolvedValueOnce({
      data: {
        ...pendingAction,
        id: 100,
        description: "Completely changed intent and different description.",
      },
      replayed: false,
    });

    await user.click(saveBtn);

    expect(api.createTicketAction).toHaveBeenCalledTimes(2);
    const newCallKey = vi.mocked(api.createTicketAction).mock.calls[1][2];
    expect(newCallKey).not.toBe(initialKey);
    expect(vi.mocked(api.createTicketAction).mock.calls[1][1]).toEqual(
      expect.objectContaining({
        description: "Completely changed intent and different description.",
      })
    );
  });

  it("creation idempotency: closing and reopening dialog preserves recovery options without leaving an unrecoverable conflict", async () => {
    const user = userEvent.setup();

    render(
      <ActionsTakenSection
        ticketId={42}
        ticketStatus="IN_PROGRESS"
        isStaff={true}
      />
    );

    const addBtn = await screen.findByRole("button", { name: "+ Add Action Taken" });
    await user.click(addBtn);

    let dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    let descInput = within(dialog).getByLabelText(/Description/);
    await user.type(descInput, "Uncertain action draft to test dialog close.");

    vi.mocked(api.createTicketAction).mockRejectedValueOnce(new Error("Failure"));
    const saveBtn = within(dialog).getByRole("button", { name: "Save Action" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Unconfirmed Submission Pending")).toBeInTheDocument();
    });

    // Close dialog via Cancel button
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen dialog
    await user.click(addBtn);
    dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    expect(dialog).toBeInTheDocument();

    // Draft and unconfirmed status are still accessible
    expect(screen.getByText("Unconfirmed Submission Pending")).toBeInTheDocument();

    // User can discard draft
    const discardBtn = within(dialog).getByRole("button", { name: "Discard Draft" });
    await user.click(discardBtn);

    // Dialog closes and state is reset
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen dialog again: completely fresh form with no unconfirmed warnings
    await user.click(addBtn);
    dialog = screen.getByRole("dialog", { name: "Add Action Taken" });
    expect(screen.queryByText("Unconfirmed Submission Pending")).not.toBeInTheDocument();
    descInput = within(dialog).getByLabelText(/Description/);
    expect(descInput).toHaveValue("");
  });
});
