import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  ActionTakenDto,
  ActionTakenHistoryDto,
  StaffAssignee,
  TicketStatus,
  fetchTicketActions,
  fetchStaffAssignees,
  createTicketAction,
  editTicketAction,
  updateTicketActionStatus,
  fetchActionHistory,
  ApiError,
} from "./api.js";

interface ActionsTakenSectionProps {
  ticketId: number;
  ticketStatus: TicketStatus;
  isStaff: boolean;
  onActionMutated?: () => void;
}

interface CreateActionForm {
  description: string;
  assigneeId: number | null;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

interface EditActionForm {
  actionId: number;
  expectedVersion: number;
  description: string;
  assigneeId: number | null;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

interface CompleteActionForm {
  actionId: number;
  expectedVersion: number;
  result: string;
}

interface CancelActionForm {
  actionId: number;
  expectedVersion: number;
  cancellationReason: string;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ActionsTakenSection({
  ticketId,
  ticketStatus,
  isStaff,
  onActionMutated,
}: ActionsTakenSectionProps) {
  const [actions, setActions] = useState<ActionTakenDto[]>([]);
  const [assignees, setAssignees] = useState<StaffAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateActionForm>({
    description: "",
    assigneeId: null,
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // Edit Modal
  const [editTarget, setEditTarget] = useState<EditActionForm | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Complete Modal
  const [completeTarget, setCompleteTarget] = useState<CompleteActionForm | null>(null);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Cancel Modal
  const [cancelTarget, setCancelTarget] = useState<CancelActionForm | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Audit History Modal
  const [historyActionId, setHistoryActionId] = useState<number | null>(null);
  const [historyItems, setHistoryItems] = useState<ActionTakenHistoryDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Accessibility & Focus Management
  const previousFocus = useRef<HTMLElement | null>(null);
  const activeDialogRef = useRef<HTMLDivElement | null>(null);

  const isTerminalTicket =
    ticketStatus === "RESOLVED" || ticketStatus === "CLOSED" || ticketStatus === "CANCELLED";

  // Load actions and assignees
  async function loadActions() {
    try {
      setError(null);
      const res = await fetchTicketActions(ticketId);
      setActions(res.data.items);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load actions taken.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActions();
    if (isStaff) {
      fetchStaffAssignees()
        .then((res) => setAssignees(res.data))
        .catch(() => {
          /* safe fallback */
        });
    }
  }, [ticketId, isStaff]);

  useEffect(() => {
    function onGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (showCreateModal) closeCreateDialog();
        else if (editTarget) closeEditDialog();
        else if (completeTarget) closeCompleteDialog();
        else if (cancelTarget) closeCancelDialog();
        else if (historyActionId !== null) closeHistoryDialog();
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [showCreateModal, editTarget, completeTarget, cancelTarget, historyActionId]);

  // Trap focus inside open dialog
  function handleDialogKeyDown(e: KeyboardEvent<HTMLElement>, closeHandler: () => void) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeHandler();
      return;
    }
    if (e.key !== "Tab" || !activeDialogRef.current) return;

    const focusable = activeDialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // 1. CREATE ACTION
  function openCreateDialog() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreateError(null);
    setShowCreateModal(true);
    setTimeout(() => {
      activeDialogRef.current?.querySelector<HTMLElement>("textarea, input, select")?.focus();
    }, 50);
  }

  function closeCreateDialog() {
    setShowCreateModal(false);
    setCreateError(null);
    previousFocus.current?.focus();
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    const desc = createForm.description.trim();
    if (desc.length < 5 || desc.length > 2000) {
      setCreateError("Description must contain 5 to 2,000 characters.");
      return;
    }
    if (createForm.followUpRequired && !createForm.followUpNote.trim()) {
      setCreateError("A follow-up note is required when follow-up is checked.");
      return;
    }
    if (createForm.followUpNote && createForm.followUpNote.length > 1000) {
      setCreateError("Follow-up note must not exceed 1,000 characters.");
      return;
    }
    if (createForm.attachmentNotes && createForm.attachmentNotes.length > 1000) {
      setCreateError("Attachment notes must not exceed 1,000 characters.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await createTicketAction(
        ticketId,
        {
          description: desc,
          assigneeId: createForm.assigneeId,
          followUpRequired: createForm.followUpRequired,
          followUpNote: createForm.followUpRequired ? createForm.followUpNote.trim() : null,
          attachmentNotes: createForm.attachmentNotes.trim() || null,
        },
        idempotencyKey
      );

      // Successfully saved - reset key for next action
      setIdempotencyKey(crypto.randomUUID());
      setCreateForm({
        description: "",
        assigneeId: null,
        followUpRequired: false,
        followUpNote: "",
        attachmentNotes: "",
      });
      setShowCreateModal(false);
      previousFocus.current?.focus();

      await loadActions();
      onActionMutated?.();
    } catch (err: unknown) {
      // Form values preserved in createForm state!
      if (err instanceof ApiError) {
        setCreateError(err.message || "Failed to create action taken.");
      } else {
        setCreateError("Network error. Please try again.");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  // 2. EDIT ACTION
  function openEditDialog(action: ActionTakenDto) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditTarget({
      actionId: action.id,
      expectedVersion: action.version,
      description: action.description,
      assigneeId: action.assignee ? action.assignee.id : null,
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote || "",
      attachmentNotes: action.attachmentNotes || "",
    });
    setEditError(null);
    setTimeout(() => {
      activeDialogRef.current?.querySelector<HTMLElement>("textarea, input, select")?.focus();
    }, 50);
  }

  function closeEditDialog() {
    setEditTarget(null);
    setEditError(null);
    previousFocus.current?.focus();
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;

    const desc = editTarget.description.trim();
    if (desc.length < 5 || desc.length > 2000) {
      setEditError("Description must contain 5 to 2,000 characters.");
      return;
    }
    if (editTarget.followUpRequired && !editTarget.followUpNote.trim()) {
      setEditError("A follow-up note is required when follow-up is checked.");
      return;
    }
    if (editTarget.followUpNote && editTarget.followUpNote.length > 1000) {
      setEditError("Follow-up note must not exceed 1,000 characters.");
      return;
    }
    if (editTarget.attachmentNotes && editTarget.attachmentNotes.length > 1000) {
      setEditError("Attachment notes must not exceed 1,000 characters.");
      return;
    }

    setEditSubmitting(true);
    setEditError(null);

    try {
      await editTicketAction(editTarget.actionId, {
        version: editTarget.expectedVersion,
        description: desc,
        assigneeId: editTarget.assigneeId,
        followUpRequired: editTarget.followUpRequired,
        followUpNote: editTarget.followUpRequired ? editTarget.followUpNote.trim() : null,
        attachmentNotes: editTarget.attachmentNotes.trim() || null,
      });

      setEditTarget(null);
      previousFocus.current?.focus();
      await loadActions();
      onActionMutated?.();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setEditError(
          err.message || "This action was modified by another operation. Please refresh and try again."
        );
      } else if (err instanceof ApiError) {
        setEditError(err.message || "Failed to update action.");
      } else {
        setEditError("Network error. Please try again.");
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  // 3. COMPLETE ACTION
  function openCompleteDialog(action: ActionTakenDto) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCompleteTarget({
      actionId: action.id,
      expectedVersion: action.version,
      result: "",
    });
    setCompleteError(null);
    setTimeout(() => {
      activeDialogRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    }, 50);
  }

  function closeCompleteDialog() {
    setCompleteTarget(null);
    setCompleteError(null);
    previousFocus.current?.focus();
  }

  async function handleCompleteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!completeTarget) return;

    const res = completeTarget.result.trim();
    if (!res || res.length < 3) {
      setCompleteError("Documented result must be at least 3 characters.");
      return;
    }

    setCompleteSubmitting(true);
    setCompleteError(null);

    try {
      await updateTicketActionStatus(completeTarget.actionId, {
        version: completeTarget.expectedVersion,
        status: "COMPLETED",
        result: res,
      });

      setCompleteTarget(null);
      previousFocus.current?.focus();
      await loadActions();
      onActionMutated?.();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setCompleteError(
          err.message || "This action was modified by another operation. Please refresh and try again."
        );
      } else if (err instanceof ApiError) {
        setCompleteError(err.message || "Failed to complete action.");
      } else {
        setCompleteError("Network error. Please try again.");
      }
    } finally {
      setCompleteSubmitting(false);
    }
  }

  // 4. CANCEL ACTION
  function openCancelDialog(action: ActionTakenDto) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCancelTarget({
      actionId: action.id,
      expectedVersion: action.version,
      cancellationReason: "",
    });
    setCancelError(null);
    setTimeout(() => {
      activeDialogRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    }, 50);
  }

  function closeCancelDialog() {
    setCancelTarget(null);
    setCancelError(null);
    previousFocus.current?.focus();
  }

  async function handleCancelSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cancelTarget) return;

    const reason = cancelTarget.cancellationReason.trim();
    if (!reason) {
      setCancelError("Cancellation reason is required.");
      return;
    }

    setCancelSubmitting(true);
    setCancelError(null);

    try {
      await updateTicketActionStatus(cancelTarget.actionId, {
        version: cancelTarget.expectedVersion,
        status: "CANCELLED",
        cancellationReason: reason,
      });

      setCancelTarget(null);
      previousFocus.current?.focus();
      await loadActions();
      onActionMutated?.();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setCancelError(
          err.message || "This action was modified by another operation. Please refresh and try again."
        );
      } else if (err instanceof ApiError) {
        setCancelError(err.message || "Failed to cancel action.");
      } else {
        setCancelError("Network error. Please try again.");
      }
    } finally {
      setCancelSubmitting(false);
    }
  }

  // 5. AUDIT HISTORY
  function openHistoryDialog(actionId: number) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHistoryActionId(actionId);
    setHistoryItems([]);
    setHistoryLoading(true);
    setHistoryError(null);

    fetchActionHistory(actionId)
      .then((res) => {
        setHistoryItems(res.data.items);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setHistoryError(err.message || "Failed to load audit history.");
        } else {
          setHistoryError("Failed to load audit history.");
        }
      })
      .finally(() => {
        setHistoryLoading(false);
      });

    setTimeout(() => {
      activeDialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 50);
  }

  function closeHistoryDialog() {
    setHistoryActionId(null);
    setHistoryItems([]);
    setHistoryError(null);
    previousFocus.current?.focus();
  }

  return (
    <section
      className="ticket-group actions-taken-section"
      aria-labelledby="actions-taken-heading"
      style={{ marginTop: "24px" }}
    >
      <div
        className="actions-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <h2 id="actions-taken-heading" className="section-title" style={{ margin: 0 }}>
          {isStaff ? `Actions Taken (${actions.length})` : "Actions Taken by IT Staff"}
        </h2>
        {isStaff && !isTerminalTicket && (
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={openCreateDialog}
            style={{ fontWeight: 600 }}
          >
            + Add Action Taken
          </button>
        )}
      </div>

      {loading && <p className="muted-text">Loading actions taken…</p>}
      {error && (
        <div className="alert alert-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={loadActions}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && actions.length === 0 && (
        <p className="muted-text" style={{ fontStyle: "italic", margin: "12px 0" }}>
          {isStaff
            ? "No actions have been recorded yet. Click '+ Add Action Taken' to document operational progress."
            : "No actions have been recorded yet."}
        </p>
      )}

      {!loading && actions.length > 0 && (
        <ul
          className="actions-list"
          role="list"
          style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {actions.map((action) => {
            const isPending = action.status === "PENDING";
            const isCompleted = action.status === "COMPLETED";
            const isCancelled = action.status === "CANCELLED";

            return (
              <li
                key={action.id}
                className="action-item-card"
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--border, #cbd5e1)",
                  borderRadius: "12px",
                  padding: "16px",
                  boxShadow: "0 2px 8px rgba(16, 61, 45, 0.04)",
                }}
              >
                {/* Meta header */}
                <div
                  className="action-meta-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    {isPending && (
                      <span
                        className="action-badge action-badge-pending"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: "#b45309",
                          backgroundColor: "#fef3c7",
                          border: "1px solid #fde68a",
                        }}
                      >
                        <span aria-hidden="true">⏱</span> PENDING
                      </span>
                    )}
                    {isCompleted && (
                      <span
                        className="action-badge action-badge-completed"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: "#15803d",
                          backgroundColor: "#dcfce7",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        <span aria-hidden="true">✓</span> COMPLETED
                      </span>
                    )}
                    {isCancelled && (
                      <span
                        className="action-badge action-badge-cancelled"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: "#4b5563",
                          backgroundColor: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <span aria-hidden="true">✕</span> CANCELLED
                      </span>
                    )}

                    <span style={{ fontSize: "0.85rem", color: "#48665a" }}>
                      Assigned to: <strong>{action.assignee ? action.assignee.name : "Unassigned"}</strong>
                    </span>
                  </div>

                  <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                    Created: {formatDate(action.createdAt)} by {action.createdBy.name}
                  </span>
                </div>

                {/* Description */}
                <p
                  className="action-description"
                  style={{
                    fontSize: "0.95rem",
                    color: "#1a2e26",
                    lineHeight: 1.5,
                    margin: "0 0 10px 0",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {action.description}
                </p>

                {/* Completed Details */}
                {isCompleted && (
                  <div
                    className="action-result-box"
                    style={{
                      background: "#f0fdf4",
                      borderLeft: "4px solid #16a34a",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginBottom: "10px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <p style={{ margin: "0 0 4px 0", color: "#166534", fontSize: "0.82rem", fontWeight: 600 }}>
                      Completed by {action.completedBy ? action.completedBy.name : "Staff"} (
                      {formatDate(action.completedAt)})
                    </p>
                    <p style={{ margin: 0, color: "#14532d" }}>
                      <strong>Result:</strong> {action.result}
                    </p>
                  </div>
                )}

                {/* Cancelled Details */}
                {isCancelled && (
                  <div
                    className="action-cancellation-box"
                    style={{
                      background: "#f9fafb",
                      borderLeft: "4px solid #6b7280",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginBottom: "10px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <p style={{ margin: "0 0 4px 0", color: "#4b5563", fontSize: "0.82rem", fontWeight: 600 }}>
                      Cancelled ({formatDate(action.cancelledAt)})
                    </p>
                    <p style={{ margin: 0, color: "#374151" }}>
                      <strong>Reason:</strong> {action.cancellationReason || "No reason specified."}
                    </p>
                  </div>
                )}

                {/* Follow-up Note */}
                {action.followUpRequired && action.followUpNote && (
                  <div
                    className="action-followup-box"
                    style={{
                      background: "#fffbeb",
                      borderLeft: "4px solid #f59e0b",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      marginBottom: "10px",
                      fontSize: "0.85rem",
                      color: "#92400e",
                    }}
                  >
                    <strong>Follow-Up Required:</strong> {action.followUpNote}
                  </div>
                )}

                {/* Attachment Notes */}
                {action.attachmentNotes && (
                  <div
                    className="action-attachments-box"
                    style={{
                      background: "#f8fafc",
                      borderLeft: "4px solid #64748b",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      marginBottom: "10px",
                      fontSize: "0.85rem",
                      color: "#334155",
                    }}
                  >
                    <strong>Attachment Notes:</strong> {action.attachmentNotes}
                  </div>
                )}

                {/* Staff Actions Controls */}
                {isStaff && (
                  <div
                    className="action-buttons-row"
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginTop: "12px",
                      paddingTop: "8px",
                      borderTop: "1px solid #f1f5f9",
                    }}
                  >
                    {isPending && !isTerminalTicket && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => openCompleteDialog(action)}
                        >
                          Complete Action
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => openCancelDialog(action)}
                        >
                          Cancel Action
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => openEditDialog(action)}
                        >
                          Edit Details
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => openHistoryDialog(action.id)}
                    >
                      View Audit History
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* CREATE ACTION MODAL */}
      {showCreateModal && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateDialog();
          }}
        >
          <div
            ref={activeDialogRef}
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-action-title"
            onKeyDown={(e) => handleDialogKeyDown(e, closeCreateDialog)}
            style={{
              maxWidth: "560px",
              width: "95%",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              boxSizing: "border-box",
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="dialog-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}
            >
              <h2 id="create-action-title" style={{ margin: 0, fontSize: "1.25rem", color: "var(--zen-900, #064e3b)" }}>
                Add Action Taken
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close"
                onClick={closeCreateDialog}
              >
                ×
              </button>
            </div>

            {createError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: "16px" }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label htmlFor="create-action-description" className="form-label" style={{ fontWeight: 600 }}>
                  Description <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="create-action-description"
                  className="form-control"
                  rows={4}
                  required
                  minLength={5}
                  maxLength={2000}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe the technical investigation or corrective action taken (5–2,000 characters)..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {createForm.description.length}/2000 characters
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="create-action-assignee" className="form-label" style={{ fontWeight: 600 }}>
                  Assignee
                </label>
                <select
                  id="create-action-assignee"
                  className="form-select"
                  value={createForm.assigneeId ?? ""}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      assigneeId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role === "IT_STAFF" ? "IT Staff" : "Administrator"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="create-action-followup"
                  checked={createForm.followUpRequired}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      followUpRequired: e.target.checked,
                      followUpNote: e.target.checked ? createForm.followUpNote : "",
                    })
                  }
                  style={{ width: "18px", height: "18px" }}
                />
                <label htmlFor="create-action-followup" className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                  Follow-up Required
                </label>
              </div>

              {createForm.followUpRequired && (
                <div className="form-group">
                  <label htmlFor="create-action-followup-note" className="form-label" style={{ fontWeight: 600 }}>
                    Follow-up Note <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <textarea
                    id="create-action-followup-note"
                    className="form-control"
                    rows={2}
                    required
                    maxLength={1000}
                    value={createForm.followUpNote}
                    onChange={(e) => setCreateForm({ ...createForm, followUpNote: e.target.value })}
                    placeholder="Document required follow-up verification or future action..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                  />
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    {createForm.followUpNote.length}/1000 characters
                  </span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="create-action-attachment-notes" className="form-label" style={{ fontWeight: 600 }}>
                  Attachment Notes
                </label>
                <textarea
                  id="create-action-attachment-notes"
                  className="form-control"
                  rows={2}
                  maxLength={1000}
                  value={createForm.attachmentNotes}
                  onChange={(e) => setCreateForm({ ...createForm, attachmentNotes: e.target.value })}
                  placeholder="Reference relevant filenames, logs, or diagnostic attachments..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {createForm.attachmentNotes.length}/1000 characters
                </span>
              </div>

              <div
                className="dialog-actions"
                style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeCreateDialog}
                  disabled={createSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={createSubmitting}
                  style={{ minWidth: "120px" }}
                >
                  {createSubmitting ? "Saving…" : "Save Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACTION MODAL */}
      {editTarget && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditDialog();
          }}
        >
          <div
            ref={activeDialogRef}
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-action-title"
            onKeyDown={(e) => handleDialogKeyDown(e, closeEditDialog)}
            style={{
              maxWidth: "560px",
              width: "95%",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              boxSizing: "border-box",
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="dialog-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}
            >
              <h2 id="edit-action-title" style={{ margin: 0, fontSize: "1.25rem", color: "var(--zen-900, #064e3b)" }}>
                Edit Action Taken #{editTarget.actionId}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close"
                onClick={closeEditDialog}
              >
                ×
              </button>
            </div>

            {editError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: "16px" }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label htmlFor="edit-action-description" className="form-label" style={{ fontWeight: 600 }}>
                  Description <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="edit-action-description"
                  className="form-control"
                  rows={4}
                  required
                  minLength={5}
                  maxLength={2000}
                  value={editTarget.description}
                  onChange={(e) => setEditTarget({ ...editTarget, description: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {editTarget.description.length}/2000 characters
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="edit-action-assignee" className="form-label" style={{ fontWeight: 600 }}>
                  Assignee
                </label>
                <select
                  id="edit-action-assignee"
                  className="form-select"
                  value={editTarget.assigneeId ?? ""}
                  onChange={(e) =>
                    setEditTarget({
                      ...editTarget,
                      assigneeId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role === "IT_STAFF" ? "IT Staff" : "Administrator"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="edit-action-followup"
                  checked={editTarget.followUpRequired}
                  onChange={(e) =>
                    setEditTarget({
                      ...editTarget,
                      followUpRequired: e.target.checked,
                      followUpNote: e.target.checked ? editTarget.followUpNote : "",
                    })
                  }
                  style={{ width: "18px", height: "18px" }}
                />
                <label htmlFor="edit-action-followup" className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                  Follow-up Required
                </label>
              </div>

              {editTarget.followUpRequired && (
                <div className="form-group">
                  <label htmlFor="edit-action-followup-note" className="form-label" style={{ fontWeight: 600 }}>
                    Follow-up Note <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <textarea
                    id="edit-action-followup-note"
                    className="form-control"
                    rows={2}
                    required
                    maxLength={1000}
                    value={editTarget.followUpNote}
                    onChange={(e) => setEditTarget({ ...editTarget, followUpNote: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                  />
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    {editTarget.followUpNote.length}/1000 characters
                  </span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="edit-action-attachment-notes" className="form-label" style={{ fontWeight: 600 }}>
                  Attachment Notes
                </label>
                <textarea
                  id="edit-action-attachment-notes"
                  className="form-control"
                  rows={2}
                  maxLength={1000}
                  value={editTarget.attachmentNotes}
                  onChange={(e) => setEditTarget({ ...editTarget, attachmentNotes: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {editTarget.attachmentNotes.length}/1000 characters
                </span>
              </div>

              <div
                className="dialog-actions"
                style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeEditDialog}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={editSubmitting}
                  style={{ minWidth: "120px" }}
                >
                  {editSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE ACTION MODAL */}
      {completeTarget && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCompleteDialog();
          }}
        >
          <div
            ref={activeDialogRef}
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-action-title"
            onKeyDown={(e) => handleDialogKeyDown(e, closeCompleteDialog)}
            style={{
              maxWidth: "520px",
              width: "95%",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              boxSizing: "border-box",
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="dialog-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}
            >
              <h2 id="complete-action-title" style={{ margin: 0, fontSize: "1.25rem", color: "var(--zen-900, #064e3b)" }}>
                Complete Action Taken #{completeTarget.actionId}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close"
                onClick={closeCompleteDialog}
              >
                ×
              </button>
            </div>

            {completeError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: "16px" }}>
                {completeError}
              </div>
            )}

            <form onSubmit={handleCompleteSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label htmlFor="complete-action-result" className="form-label" style={{ fontWeight: 600 }}>
                  Documented Result <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="complete-action-result"
                  className="form-control"
                  rows={4}
                  required
                  minLength={3}
                  value={completeTarget.result}
                  onChange={(e) => setCompleteTarget({ ...completeTarget, result: e.target.value })}
                  placeholder="Document the verified technical outcome or resolution finding (minimum 3 characters)..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
              </div>

              <div
                className="dialog-actions"
                style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeCompleteDialog}
                  disabled={completeSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={completeSubmitting}
                  style={{ minWidth: "140px" }}
                >
                  {completeSubmitting ? "Completing…" : "Confirm Completion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL ACTION MODAL */}
      {cancelTarget && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCancelDialog();
          }}
        >
          <div
            ref={activeDialogRef}
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-action-title"
            onKeyDown={(e) => handleDialogKeyDown(e, closeCancelDialog)}
            style={{
              maxWidth: "520px",
              width: "95%",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              boxSizing: "border-box",
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="dialog-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}
            >
              <h2 id="cancel-action-title" style={{ margin: 0, fontSize: "1.25rem", color: "#b91c1c" }}>
                Cancel Action Taken #{cancelTarget.actionId}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close"
                onClick={closeCancelDialog}
              >
                ×
              </button>
            </div>

            {cancelError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: "16px" }}>
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label htmlFor="cancel-action-reason" className="form-label" style={{ fontWeight: 600 }}>
                  Cancellation Reason <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="cancel-action-reason"
                  className="form-control"
                  rows={4}
                  value={cancelTarget.cancellationReason}
                  onChange={(e) =>
                    setCancelTarget({ ...cancelTarget, cancellationReason: e.target.value })
                  }
                  placeholder="Explain why this action is no longer necessary or was superseded..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }}
                />
              </div>

              <div
                className="dialog-actions"
                style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeCancelDialog}
                  disabled={cancelSubmitting}
                >
                  Keep Action
                </button>
                <button
                  type="submit"
                  className="btn btn-outline-danger"
                  disabled={cancelSubmitting}
                  style={{ minWidth: "150px" }}
                >
                  {cancelSubmitting ? "Cancelling…" : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT HISTORY MODAL */}
      {historyActionId !== null && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeHistoryDialog();
          }}
        >
          <div
            ref={activeDialogRef}
            className="action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-dialog-title"
            onKeyDown={(e) => handleDialogKeyDown(e, closeHistoryDialog)}
            style={{
              maxWidth: "640px",
              width: "95%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="dialog-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexShrink: 0,
              }}
            >
              <h2 id="history-dialog-title" style={{ margin: 0, fontSize: "1.25rem", color: "var(--zen-900, #064e3b)" }}>
                Audit History - Action #{historyActionId}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close"
                onClick={closeHistoryDialog}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: "6px" }}>
              {historyLoading && <p className="muted-text">Loading history…</p>}
              {historyError && (
                <div className="alert alert-danger" role="alert">
                  {historyError}
                </div>
              )}
              {!historyLoading && !historyError && historyItems.length === 0 && (
                <p className="muted-text">No audit history entries found.</p>
              )}

              {!historyLoading && historyItems.length > 0 && (
                <ul
                  className="action-history-list"
                  role="list"
                  style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}
                >
                  {historyItems.map((entry) => (
                    <li
                      key={entry.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "12px",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background:
                              entry.eventType === "CREATED"
                                ? "#dbeafe"
                                : entry.eventType === "COMPLETED"
                                ? "#dcfce7"
                                : entry.eventType === "CANCELLED"
                                ? "#fee2e2"
                                : "#e0e7ff",
                            color:
                              entry.eventType === "CREATED"
                                ? "#1e40af"
                                : entry.eventType === "COMPLETED"
                                ? "#15803d"
                                : entry.eventType === "CANCELLED"
                                ? "#991b1b"
                                : "#3730a3",
                          }}
                        >
                          {entry.eventType}
                        </span>
                        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>

                      <p style={{ margin: "0 0 6px 0", fontSize: "0.88rem", color: "#334155" }}>
                        By <strong>{entry.actor.name}</strong> ({entry.actor.role})
                        {entry.versionAfter ? ` • Version ${entry.versionAfter}` : ""}
                      </p>

                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#475569",
                            background: "#ffffff",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {Object.entries(entry.changes).map(([k, v]: [string, any]) => (
                            <div key={k} style={{ marginBottom: "3px" }}>
                              <strong>{k}:</strong>{" "}
                              {v && typeof v === "object" && ("before" in v || "after" in v)
                                ? `${v.before !== undefined && v.before !== null ? `"${v.before}"` : "null"} → ${
                                    v.after !== undefined && v.after !== null ? `"${v.after}"` : "null"
                                  }`
                                : v && typeof v === "object" && ("beforeId" in v || "afterId" in v)
                                ? `${v.beforeId ?? "null"} → ${v.afterId ?? "null"}`
                                : JSON.stringify(v)}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              className="dialog-actions"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "16px",
                paddingTop: "12px",
                borderTop: "1px solid #e2e8f0",
                flexShrink: 0,
              }}
            >
              <button type="button" className="btn btn-outline-secondary" onClick={closeHistoryDialog}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
