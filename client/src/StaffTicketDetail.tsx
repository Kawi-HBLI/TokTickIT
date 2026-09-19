import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  ApiError,
  Assignee,
  AttachmentItem,
  StaffTicketDetail as StaffTicketDetailType,
  TicketStatus,
  RequestedPriority,
  fetchStaffTicketDetail,
  fetchAssignees,
  claimStaffTicket,
  updateStaffTicketOwner,
  updateStaffTicketPriority,
  updateStaffTicketStatus,
  createPublicComment,
  createInternalNote,
  previewAttachmentFile,
  downloadAttachmentFile,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";

interface StaffTicketDetailProps {
  ticketId: number;
  onNavigate: (path: string) => void;
}

const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

const CONFIRMATION_REQUIRED_STATUSES: TicketStatus[] = [
  "CANCELLED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];

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

function formatStatus(status: TicketStatus): string {
  switch (status) {
    case "NEW":
      return "New";
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In Progress";
    case "WAITING_FOR_REQUESTER":
      return "Waiting for Requester";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    case "REOPENED":
      return "Reopened";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export default function StaffTicketDetail({ ticketId, onNavigate }: StaffTicketDetailProps) {
  const { currentUser } = useRequester();
  const [ticket, setTicket] = useState<StaffTicketDetailType | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string; status?: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Workflow state
  const [claiming, setClaiming] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | "unassigned" | "">("");
  const [selectedPriority, setSelectedPriority] = useState<RequestedPriority | "">("");
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "">("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Dialog state
  const [pendingOwnerChange, setPendingOwnerChange] = useState<{ targetOwnerId: number | null } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<TicketStatus | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialogConfirmButton = useRef<HTMLButtonElement>(null);
  const dialogCancelButton = useRef<HTMLButtonElement>(null);

  // Attachment actions state
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState<number | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [attachmentActionError, setAttachmentActionError] = useState<string | null>(null);

  // Public comments composer
  const [publicCommentText, setPublicCommentText] = useState("");
  const [submittingPublicComment, setSubmittingPublicComment] = useState(false);
  const [publicCommentError, setPublicCommentError] = useState<string | null>(null);
  const [publicCommentSuccess, setPublicCommentSuccess] = useState<string | null>(null);

  // Internal notes composer
  const [internalNoteText, setInternalNoteText] = useState("");
  const [submittingInternalNote, setSubmittingInternalNote] = useState(false);
  const [internalNoteError, setInternalNoteError] = useState<string | null>(null);
  const [internalNoteSuccess, setInternalNoteSuccess] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  function loadData() {
    setLoading(true);
    setError(null);
    setConflictError(null);

    Promise.all([fetchStaffTicketDetail(ticketId), fetchAssignees()])
      .then(([ticketRes, assigneesRes]) => {
        setTicket(ticketRes.data);
        setAssignees(assigneesRes.data);
        setSelectedOwnerId(ticketRes.data.owner ? ticketRes.data.owner.id : "unassigned");
        setSelectedPriority(ticketRes.data.itPriority);
        setSelectedStatus(ticketRes.data.currentStatus);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError({ code: err.code || "ERROR", message: err.message, status: err.status });
        } else {
          setError({ code: "UNKNOWN_ERROR", message: "Failed to load ticket details." });
        }
        setLoading(false);
      });
  }

  useEffect(() => {
    loadData();
  }, [ticketId, reloadKey]);

  // Dialog focus management
  useEffect(() => {
    const isDialogOpen = pendingOwnerChange !== null || pendingStatusChange !== null;
    if (isDialogOpen) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialogCancelButton.current?.focus();
    } else {
      previousFocus.current?.focus();
    }
  }, [pendingOwnerChange, pendingStatusChange]);

  function handleDialogKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDialogs();
      return;
    }
    if (e.key !== "Tab") return;
    const cancelBtn = dialogCancelButton.current;
    const confirmBtn = dialogConfirmButton.current;
    if (!cancelBtn || !confirmBtn) return;

    if (e.shiftKey && document.activeElement === cancelBtn) {
      e.preventDefault();
      confirmBtn.focus();
    } else if (!e.shiftKey && document.activeElement === confirmBtn) {
      e.preventDefault();
      cancelBtn.focus();
    }
  }

  function closeDialogs() {
    if (ticket) {
      setSelectedOwnerId(ticket.owner ? ticket.owner.id : "unassigned");
      setSelectedStatus(ticket.currentStatus);
    }
    setPendingOwnerChange(null);
    setPendingStatusChange(null);
  }

  async function handleClaim() {
    if (!ticket) return;
    setClaiming(true);
    setConflictError(null);
    setSuccessMessage(null);
    try {
      const res = await claimStaffTicket(ticket.id);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              owner: res.data.owner,
              updatedAt: res.data.updatedAt,
            }
          : prev
      );
      if (res.data.owner) setSelectedOwnerId(res.data.owner.id);
      setSuccessMessage("You claimed this ticket.");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(err.message || "Ticket was modified or already claimed. Refresh and try again.");
      } else {
        setError({
          code: "CLAIM_FAILED",
          message: err instanceof Error ? err.message : "Failed to claim ticket.",
        });
      }
    } finally {
      setClaiming(false);
    }
  }

  function onOwnerSelectChange(newVal: string) {
    if (!ticket) return;
    setConflictError(null);
    setSuccessMessage(null);
    const targetOwnerId = newVal === "unassigned" ? null : parseInt(newVal, 10);
    const currentOwnerId = ticket.owner ? ticket.owner.id : null;
    if (targetOwnerId === currentOwnerId) return;

    // Trigger confirmation dialog
    setPendingOwnerChange({ targetOwnerId });
  }

  async function confirmOwnerChange() {
    if (!ticket || !pendingOwnerChange) return;
    const targetOwnerId = pendingOwnerChange.targetOwnerId;
    setPendingOwnerChange(null);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      const res = await updateStaffTicketOwner(ticket.id, targetOwnerId, ticket.updatedAt);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              owner: res.data.owner,
              updatedAt: res.data.updatedAt,
            }
          : prev
      );
      setSelectedOwnerId(res.data.owner ? res.data.owner.id : "unassigned");
      setSuccessMessage(
        res.data.owner ? `Ticket assigned to ${res.data.owner.name}.` : "Ticket unassigned."
      );
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(err.message || "This ticket was modified by another operation. Refresh and try again.");
      } else {
        setError({
          code: "OWNER_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update ticket owner.",
        });
      }
      if (ticket) setSelectedOwnerId(ticket.owner ? ticket.owner.id : "unassigned");
    }
  }

  async function handlePriorityChange(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !selectedPriority || selectedPriority === ticket.itPriority) return;
    setUpdatingPriority(true);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      const res = await updateStaffTicketPriority(ticket.id, selectedPriority, ticket.updatedAt);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              itPriority: res.data.itPriority,
              updatedAt: res.data.updatedAt,
            }
          : prev
      );
      setSuccessMessage(`IT Priority updated to ${res.data.itPriority}.`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(err.message || "This ticket was modified by another operation. Refresh and try again.");
      } else {
        setError({
          code: "PRIORITY_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update IT Priority.",
        });
      }
      setSelectedPriority(ticket.itPriority);
    } finally {
      setUpdatingPriority(false);
    }
  }

  function onStatusSelectChange(newStatus: TicketStatus) {
    if (!ticket || newStatus === ticket.currentStatus) return;
    setConflictError(null);
    setSuccessMessage(null);

    if (CONFIRMATION_REQUIRED_STATUSES.includes(newStatus)) {
      setPendingStatusChange(newStatus);
    } else {
      executeStatusChange(newStatus);
    }
  }

  async function executeStatusChange(targetStatus: TicketStatus) {
    if (!ticket) return;
    setUpdatingStatus(true);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      const res = await updateStaffTicketStatus(ticket.id, targetStatus, ticket.updatedAt);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              currentStatus: res.data.currentStatus,
              requesterResolutionIndicatedAt: res.data.requesterResolutionIndicatedAt,
              requesterResolutionIndicatedBy: res.data.requesterResolutionIndicatedBy,
              updatedAt: res.data.updatedAt,
            }
          : prev
      );
      setSelectedStatus(res.data.currentStatus);
      setSuccessMessage(`Ticket status updated to ${formatStatus(res.data.currentStatus)}.`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(err.message || "This ticket was modified by another operation. Refresh and try again.");
      } else {
        setError({
          code: "STATUS_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update ticket status.",
        });
      }
      setSelectedStatus(ticket.currentStatus);
    } finally {
      setUpdatingStatus(false);
      setPendingStatusChange(null);
    }
  }

  async function handlePostPublicComment(e: FormEvent) {
    e.preventDefault();
    const trimmed = publicCommentText.trim();
    if (!trimmed) {
      setPublicCommentError("Comment must contain 1 to 2,000 characters.");
      return;
    }
    if (trimmed.length > 2000) {
      setPublicCommentError("Comment must not exceed 2,000 characters.");
      return;
    }

    setSubmittingPublicComment(true);
    setPublicCommentError(null);
    setPublicCommentSuccess(null);

    try {
      const res = await createPublicComment(ticketId, trimmed);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              publicComments: [...prev.publicComments, res.data],
            }
          : prev
      );
      setPublicCommentText("");
      setPublicCommentSuccess("Public comment posted.");
    } catch (err: unknown) {
      setPublicCommentError(
        err instanceof Error ? err.message : "Could not post public comment. Your draft was retained."
      );
    } finally {
      setSubmittingPublicComment(false);
    }
  }

  async function handlePostInternalNote(e: FormEvent) {
    e.preventDefault();
    const trimmed = internalNoteText.trim();
    if (!trimmed) {
      setInternalNoteError("Internal note must contain 1 to 4,000 characters.");
      return;
    }
    if (trimmed.length > 4000) {
      setInternalNoteError("Internal note must not exceed 4,000 characters.");
      return;
    }

    setSubmittingInternalNote(true);
    setInternalNoteError(null);
    setInternalNoteSuccess(null);

    try {
      const res = await createInternalNote(ticketId, trimmed);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              internalNotes: [...prev.internalNotes, res.data],
            }
          : prev
      );
      setInternalNoteText("");
      setInternalNoteSuccess("Internal note added.");
    } catch (err: unknown) {
      setInternalNoteError(
        err instanceof Error ? err.message : "Could not add internal note. Your draft was retained."
      );
    } finally {
      setSubmittingInternalNote(false);
    }
  }

  async function handlePreviewAttachment(att: AttachmentItem) {
    setAttachmentActionError(null);
    setPreviewingAttachmentId(att.id);

    let previewWindow: Window | null = null;
    try {
      previewWindow = window.open("about:blank", "_blank");
      if (previewWindow) {
        try {
          previewWindow.document.title = `Loading ${att.originalName}…`;
        } catch {
          // ignore potential cross-origin restrictions
        }
      }
    } catch {
      // ignore
    }

    try {
      const { blob } = await previewAttachmentFile(att.id);
      const url = URL.createObjectURL(blob);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.href = url;
      } else {
        const fallback = window.open(url, "_blank", "noopener,noreferrer");
        if (!fallback) {
          setAttachmentActionError("Pop-up was blocked by browser. Please allow pop-ups for this site to preview attachments.");
        }
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          // ignore
        }
      }
      setAttachmentActionError(err instanceof Error ? err.message : "Failed to preview attachment.");
    } finally {
      setPreviewingAttachmentId(null);
    }
  }

  async function handleDownloadAttachment(att: AttachmentItem) {
    setAttachmentActionError(null);
    setDownloadingAttachmentId(att.id);
    try {
      const { blob } = await downloadAttachmentFile(att.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = att.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      setAttachmentActionError(err instanceof Error ? err.message : "Failed to download attachment.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  if (loading) {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <h2>Loading Ticket Details…</h2>
        <p className="muted-text">Retrieving operational data for Ticket #{ticketId}.</p>
      </div>
    );
  }

  if (error || !ticket) {
    if (error?.status === 403) {
      return (
        <section className="state-card state-forbidden" aria-labelledby="error-title">
          <h2 id="error-title">Access Denied</h2>
          <p className="state-message">You do not have permission to view staff ticket operations.</p>
          <button type="button" className="btn btn-outline-success" onClick={() => onNavigate("/staff/tickets")}>
            Back to Ticket Queue
          </button>
        </section>
      );
    }

    if (error?.status === 404 || error?.code === "TICKET_NOT_FOUND") {
      return (
        <section className="state-card state-not-found" aria-labelledby="error-title">
          <h2 id="error-title">Ticket Not Found</h2>
          <p className="state-message">The requested ticket does not exist or has been removed.</p>
          <button type="button" className="btn btn-outline-success" onClick={() => onNavigate("/staff/tickets")}>
            Back to Ticket Queue
          </button>
        </section>
      );
    }

    return (
      <section className="state-card state-error" aria-labelledby="error-title">
        <h2 id="error-title">Unable to Load Ticket</h2>
        <p className="state-message">{error?.message || "An unexpected error occurred."}</p>
        <button type="button" className="btn btn-outline-success" onClick={loadData}>
          Retry
        </button>
      </section>
    );
  }

  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[ticket.currentStatus] || [];
  const activeAttachments = ticket.attachments.filter((a) => !a.isRemoved);

  return (
    <article className="ticket-detail-view staff-detail-view" aria-labelledby="ticket-title">
      <header className="ticket-detail-header">
        <div className="breadcrumb-nav">
          <button
            type="button"
            className="link-button back-link"
            aria-label="Back to Ticket Queue"
            onClick={() => onNavigate("/staff/tickets")}
          >
            ← Back to Ticket Queue
          </button>
        </div>

        <div className="title-row">
          <div>
            <h1 className="staff-detail-heading">Ticket Detail</h1>
            <h2 id="ticket-title" className="ticket-number">
              {ticket.ticketNumber}
            </h2>
          </div>
          <span className={`status-badge status-${ticket.currentStatus.toLowerCase()}`}>
            {formatStatus(ticket.currentStatus)}
          </span>
        </div>

        {/* Global Feedback Notifications */}
        {conflictError && (
          <div className="alert alert-danger conflict-banner" role="alert">
            <p>{conflictError}</p>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Refresh Ticket
            </button>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" role="status" aria-live="polite">
            {successMessage}
          </div>
        )}
      </header>

      {/* Assignment and Workflow Card */}
      <section className="ticket-group staff-workflow-card" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="section-title">
          Assignment &amp; Workflow Controls
        </h2>

        {/* Requester Resolution Indication Notice */}
        {ticket.requesterResolutionIndicatedAt && (
          <div className="resolution-indicated-banner" role="status">
            <span className="resolution-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Requester indicated problem appears resolved</strong>
              <p>
                Reported on {formatDate(ticket.requesterResolutionIndicatedAt)} by{" "}
                {ticket.requesterResolutionIndicatedBy?.name || "Requester"}. Review the conversation and confirm formal resolution.
              </p>
            </div>
          </div>
        )}

        <div className="workflow-controls-grid">
          {/* Owner Control */}
          <div className="workflow-control-item">
            <label htmlFor="owner-select" className="form-label">
              Ticket Owner
            </label>
            <div className="owner-action-row">
              <select
                id="owner-select"
                className="form-select"
                value={selectedOwnerId}
                onChange={(e) => onOwnerSelectChange(e.target.value)}
                disabled={claiming}
              >
                <option value="unassigned">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name} ({assignee.role === "IT_STAFF" ? "IT Staff" : "Administrator"})
                  </option>
                ))}
              </select>

              {!ticket.owner && (
                <button
                  type="button"
                  className="btn btn-outline-success claim-btn"
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming ? "Claiming…" : "Claim Ticket"}
                </button>
              )}
            </div>
            <p className="field-hint">
              Current Owner: <strong>{ticket.owner ? ticket.owner.name : "Unassigned"}</strong>
            </p>
          </div>

          {/* IT Priority Control */}
          <form onSubmit={handlePriorityChange} className="workflow-control-item">
            <label htmlFor="it-priority-select" className="form-label">
              IT Priority
            </label>
            <div className="priority-action-row">
              <select
                id="it-priority-select"
                className="form-select"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value as RequestedPriority)}
                disabled={updatingPriority}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <button
                type="submit"
                className="btn btn-outline-secondary"
                disabled={updatingPriority || selectedPriority === ticket.itPriority}
              >
                {updatingPriority ? "Saving…" : "Update Priority"}
              </button>
            </div>
            <p className="field-hint">
              Requested Priority: <strong>{ticket.requestedPriority}</strong> (immutable)
            </p>
          </form>

          {/* Status Transition Control */}
          <div className="workflow-control-item">
            <label htmlFor="status-select" className="form-label">
              Status Transition
            </label>
            <select
              id="status-select"
              className="form-select"
              value={selectedStatus}
              onChange={(e) => onStatusSelectChange(e.target.value as TicketStatus)}
              disabled={updatingStatus || allowedNextStatuses.length === 0}
            >
              <option value={ticket.currentStatus}>
                {formatStatus(ticket.currentStatus)} (Current)
              </option>
              {allowedNextStatuses.map((s) => (
                <option key={s} value={s}>
                  → {formatStatus(s)}
                </option>
              ))}
            </select>
            {allowedNextStatuses.length === 0 ? (
              <p className="field-hint muted-text">This ticket has reached a terminal state.</p>
            ) : (
              <p className="field-hint">Only allowed transitions are shown.</p>
            )}
          </div>
        </div>
      </section>

      {/* Ticket Overview Details */}
      <section className="ticket-group ticket-info-section" aria-labelledby="info-heading">
        <h2 id="info-heading" className="section-title">
          Ticket Overview
        </h2>
        <dl className="meta-dl">
          <div className="meta-dl-item">
            <dt>Category</dt>
            <dd>{ticket.category.name}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Related System</dt>
            <dd>{ticket.relatedSystem ? ticket.relatedSystem.name : "—"}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Requester</dt>
            <dd>
              <strong>{ticket.requester.name}</strong> ({ticket.requester.email})
            </dd>
          </div>
          <div className="meta-dl-item">
            <dt>Created At</dt>
            <dd>{formatDate(ticket.createdAt)}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Last Updated</dt>
            <dd>{formatDate(ticket.updatedAt)}</dd>
          </div>
        </dl>

        <div className="readonly-field mt-3">
          <span className="readonly-label">Summary</span>
          <p className="readonly-value summary-value">{ticket.summary}</p>
        </div>
        <div className="readonly-field">
          <span className="readonly-label">Description</span>
          <div className="readonly-value description-value multiline">{ticket.description}</div>
        </div>
      </section>

      {/* Attachments Section */}
      <section className="ticket-group attachments-card" aria-labelledby="attachments-heading">
        <h2 id="attachments-heading" className="section-title">
          Attachments ({activeAttachments.length})
        </h2>
        {attachmentActionError && (
          <div className="alert alert-danger mb-3" role="alert">
            {attachmentActionError}
          </div>
        )}
        {activeAttachments.length === 0 ? (
          <p className="muted-text">No active attachments for this ticket.</p>
        ) : (
          <ul className="attachments-list" role="list">
            {activeAttachments.map((att) => (
              <li key={att.id} className="attachment-item">
                <div className="attachment-info">
                  <span className="attachment-filename">{att.originalName}</span>
                  <span className="attachment-meta">
                    ({Math.round(att.sizeBytes / 1024)} KB, {formatDate(att.createdAt)})
                  </span>
                </div>
                <div className="attachment-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => handlePreviewAttachment(att)}
                    disabled={previewingAttachmentId === att.id}
                  >
                    {previewingAttachmentId === att.id ? "Loading…" : "Preview"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => handleDownloadAttachment(att)}
                    disabled={downloadingAttachmentId === att.id}
                  >
                    {downloadingAttachmentId === att.id ? "Downloading…" : "Download"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Conversation Card: Public Comments & Internal Notes */}
      <section className="ticket-group conversation-section" aria-labelledby="discussion-heading">
        <h2 id="discussion-heading" className="section-title">
          Conversation &amp; Notes
        </h2>

        {/* Public Comments */}
        <div className="discussion-block public-comments-block" aria-labelledby="public-comments-title">
          <div className="discussion-header">
            <h3 id="public-comments-title" className="comments-subtitle">
              Public Comments
            </h3>
            <span className="badge badge-public">Visible to Requester and Staff</span>
          </div>

          {ticket.publicComments.length === 0 ? (
            <p className="no-comments-text">No public comments yet.</p>
          ) : (
            <ul className="comments-list" role="list">
              {ticket.publicComments.map((comment) => (
                <li key={comment.id} className="comment-card public-comment">
                  <header className="comment-header">
                    <span className="comment-author">{comment.author.name}</span>
                    <span className="comment-role-badge">
                      {comment.author.role === "REQUESTER"
                        ? "Requester"
                        : comment.author.role === "IT_STAFF"
                        ? "IT Staff"
                        : "Administrator"}
                    </span>
                    <time className="comment-date" dateTime={comment.createdAt}>
                      {formatDate(comment.createdAt)}
                    </time>
                  </header>
                  <div className="comment-body">{comment.content}</div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePostPublicComment} className="comment-composer-form" noValidate>
            <div className="composer-field">
              <label htmlFor="public-comment-input" className="form-label">
                Add a public comment
              </label>
              <textarea
                id="public-comment-input"
                className="composer-textarea"
                rows={3}
                maxLength={2000}
                value={publicCommentText}
                onChange={(e) => {
                  setPublicCommentText(e.target.value);
                  if (publicCommentError) setPublicCommentError(null);
                  if (publicCommentSuccess) setPublicCommentSuccess(null);
                }}
                placeholder="Type a public response that will be visible to the requester…"
                disabled={submittingPublicComment}
                aria-describedby="public-char-count"
                aria-invalid={!!publicCommentError}
              />
              <div className="composer-footer">
                <span id="public-char-count" className="char-count" aria-live="polite">
                  {publicCommentText.length} / 2000 characters
                </span>
                {publicCommentError && (
                  <span className="error-text" role="alert">
                    {publicCommentError}
                  </span>
                )}
                {publicCommentSuccess && (
                  <span className="success-text" role="status">
                    {publicCommentSuccess}
                  </span>
                )}
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-outline-success submit-comment-btn"
              disabled={submittingPublicComment}
            >
              {submittingPublicComment ? "Posting comment…" : "Post public comment"}
            </button>
          </form>
        </div>

        <hr className="divider-line" />

        {/* Internal Notes */}
        <div className="discussion-block internal-notes-block" aria-labelledby="internal-notes-title">
          <div className="discussion-header">
            <h3 id="internal-notes-title" className="notes-subtitle">
              Internal Notes
            </h3>
            <span className="badge badge-warning internal-badge">
              Visible to IT Staff and Administrators only
            </span>
          </div>

          {ticket.internalNotes.length === 0 ? (
            <p className="no-comments-text">No internal notes yet.</p>
          ) : (
            <ul className="comments-list internal-notes-list" role="list">
              {ticket.internalNotes.map((note) => (
                <li key={note.id} className="comment-card internal-note-card">
                  <header className="comment-header">
                    <span className="comment-author">{note.author.name}</span>
                    <span className="comment-role-badge internal-role-badge">
                      {note.author.role === "IT_STAFF" ? "IT Staff" : "Administrator"}
                    </span>
                    <time className="comment-date" dateTime={note.createdAt}>
                      {formatDate(note.createdAt)}
                    </time>
                  </header>
                  <div className="comment-body">{note.content}</div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePostInternalNote} className="comment-composer-form" noValidate>
            <div className="composer-field">
              <label htmlFor="internal-note-input" className="form-label">
                Add an internal note
              </label>
              <textarea
                id="internal-note-input"
                className="composer-textarea internal-textarea"
                rows={3}
                maxLength={4000}
                value={internalNoteText}
                onChange={(e) => {
                  setInternalNoteText(e.target.value);
                  if (internalNoteError) setInternalNoteError(null);
                  if (internalNoteSuccess) setInternalNoteSuccess(null);
                }}
                placeholder="Type private notes for IT Staff and Administrators…"
                disabled={submittingInternalNote}
                aria-describedby="internal-char-count"
                aria-invalid={!!internalNoteError}
              />
              <div className="composer-footer">
                <span id="internal-char-count" className="char-count" aria-live="polite">
                  {internalNoteText.length} / 4000 characters
                </span>
                {internalNoteError && (
                  <span className="error-text" role="alert">
                    {internalNoteError}
                  </span>
                )}
                {internalNoteSuccess && (
                  <span className="success-text" role="status">
                    {internalNoteSuccess}
                  </span>
                )}
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-warning submit-note-btn"
              disabled={submittingInternalNote}
            >
              {submittingInternalNote ? "Adding internal note…" : "Add internal note"}
            </button>
          </form>
        </div>
      </section>

      {/* Confirmation Dialog for Owner Reassignment / Unassignment */}
      {pendingOwnerChange !== null && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-title"
            aria-describedby="reassign-desc"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="reassign-title">
              {pendingOwnerChange.targetOwnerId === null
                ? "Unassign Ticket Owner?"
                : "Reassign Ticket Owner?"}
            </h2>
            <p id="reassign-desc">
              {pendingOwnerChange.targetOwnerId === null
                ? "Are you sure you want to unassign this ticket?"
                : `Are you sure you want to assign this ticket to ${
                    assignees.find((a) => a.id === pendingOwnerChange.targetOwnerId)?.name || "the selected user"
                  }?`}
            </p>
            <div className="selector-actions">
              <button
                ref={dialogCancelButton}
                type="button"
                className="btn btn-outline-secondary"
                onClick={closeDialogs}
              >
                Cancel
              </button>
              <button
                ref={dialogConfirmButton}
                type="button"
                className="btn btn-primary"
                onClick={confirmOwnerChange}
              >
                {pendingOwnerChange.targetOwnerId === null
                  ? "Confirm Unassignment"
                  : "Confirm Reassignment"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Confirmation Dialog for Status Transitions */}
      {pendingStatusChange !== null && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-dialog-title"
            aria-describedby="status-dialog-desc"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="status-dialog-title">Change Status to {formatStatus(pendingStatusChange)}?</h2>
            <p id="status-dialog-desc">
              Are you sure you want to transition this ticket to <strong>{formatStatus(pendingStatusChange)}</strong>?
              {["RESOLVED", "CLOSED", "CANCELLED", "REOPENED"].includes(pendingStatusChange) && (
                <span> Any active requester resolution indication will also be cleared.</span>
              )}
            </p>
            <div className="selector-actions">
              <button
                ref={dialogCancelButton}
                type="button"
                className="btn btn-outline-secondary"
                onClick={closeDialogs}
              >
                Cancel
              </button>
              <button
                ref={dialogConfirmButton}
                type="button"
                className={pendingStatusChange === "CANCELLED" ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => executeStatusChange(pendingStatusChange)}
              >
                Confirm Status Change
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
