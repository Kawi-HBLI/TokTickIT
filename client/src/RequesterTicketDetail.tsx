import { useEffect, useState } from "react";
import { ApiError, getTicketDetail, TicketDetail } from "./api.js";
import { useRequester } from "./RequesterContext.js";
import AttachmentSection from "./AttachmentSection.js";

interface RequesterTicketDetailProps {
  ticketId: number;
  onNavigate: (path: string) => void;
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

export default function RequesterTicketDetail({
  ticketId,
  onNavigate,
}: RequesterTicketDetailProps) {
  const { currentRequester } = useRequester();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string; status?: number } | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    if (!currentRequester) return;
    let active = true;
    setLoading(true);
    setError(null);

    getTicketDetail(currentRequester.id, ticketId)
      .then((data) => {
        if (!active) return;
        setTicket(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError) {
          setError({
            code: err.code || "ERROR",
            message: err.message,
            status: err.status,
          });
        } else {
          setError({
            code: "UNKNOWN_ERROR",
            message: "Failed to load ticket details. Please try again.",
          });
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ticketId, currentRequester?.id, reloadTrigger]);

  if (loading) {
    return (
      <section className="ticket-page" aria-busy="true" aria-live="polite">
        <button
          className="back-link"
          type="button"
          onClick={() => onNavigate("/tickets")}
        >
          ← Back to My Tickets
        </button>
        <div className="ticket-loading-state">
          <div className="busy-spinner" aria-hidden="true" />
          <span>Loading ticket details…</span>
        </div>
      </section>
    );
  }

  if (error) {
    const isNotFound = error.status === 404 || error.code === "TICKET_NOT_FOUND";
    return (
      <section className="ticket-page" aria-labelledby="detail-error-heading">
        <button
          className="back-link"
          type="button"
          onClick={() => onNavigate("/tickets")}
        >
          ← Back to My Tickets
        </button>
        <div
          className={`empty-state ${isNotFound ? "not-found-state" : "error-state"}`}
          role="alert"
        >
          <div className="empty-icon" aria-hidden="true">
            {isNotFound ? "🔍" : "⚠️"}
          </div>
          <h1 id="detail-error-heading">
            {isNotFound ? "Ticket not found" : "Error loading ticket"}
          </h1>
          <p>
            {isNotFound
              ? "The requested ticket could not be found or is not accessible under your current Requester persona."
              : error.message}
          </p>
          <div className="detail-error-actions">
            {!isNotFound && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setReloadTrigger((count) => count + 1)}
              >
                Retry
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate("/tickets")}
            >
              Back to My Tickets
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!ticket) return null;

  return (
    <article className="ticket-page ticket-detail-page" aria-labelledby="ticket-detail-title">
      <button
        className="back-link"
        type="button"
        onClick={() => onNavigate("/tickets")}
      >
        ← Back to My Tickets
      </button>

      <header className="ticket-detail-header">
        <div className="title-area">
          <p className="section-kicker">Support Ticket</p>
          <h1 id="ticket-detail-title" className="page-title ticket-number-heading">
            {ticket.ticketNumber}
          </h1>
        </div>
        <div className="badge-group">
          <span className="status-badge status-new">{ticket.currentStatus}</span>
          <span className={`priority-badge priority-${ticket.requestedPriority.toLowerCase()}`}>
            {ticket.requestedPriority} Priority
          </span>
        </div>
      </header>

      {/* Ticket Attributes - Read-only Grid */}
      <section className="ticket-group readonly-summary-grid" aria-labelledby="ticket-meta-heading">
        <h2 id="ticket-meta-heading" className="section-title">Ticket Information</h2>
        <dl className="meta-dl-grid">
          <div className="meta-dl-item">
            <dt>Ticket Date</dt>
            <dd>{formatDate(ticket.ticketDate || ticket.createdAt)}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Requester</dt>
            <dd>
              <strong>{ticket.requester.name}</strong> ({ticket.requester.department})
              <br />
              <small className="muted-text">{ticket.requester.email}</small>
            </dd>
          </div>
          <div className="meta-dl-item">
            <dt>Category</dt>
            <dd>{ticket.category.name}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Related System</dt>
            <dd>{ticket.relatedSystem.name}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Requested Priority</dt>
            <dd>{ticket.requestedPriority}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>IT Priority</dt>
            <dd className="muted-text">{ticket.itPriority || "Unassigned"}</dd>
          </div>
          <div className="meta-dl-item">
            <dt>Ticket Owner</dt>
            <dd className="muted-text">{ticket.ticketOwner || "Unassigned"}</dd>
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
      </section>

      {/* Problem Details */}
      <section className="ticket-group problem-details" aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="section-title">Problem Details</h2>
        <div className="readonly-field">
          <span className="readonly-label">Summary</span>
          <p className="readonly-value summary-value">{ticket.summary}</p>
        </div>
        <div className="readonly-field">
          <span className="readonly-label">Description</span>
          <div className="readonly-value description-value multiline">
            {ticket.description}
          </div>
        </div>
      </section>

      {/* Attachment Section */}
      <AttachmentSection
        ticketId={ticket.id}
        initialAttachments={ticket.attachments}
      />
    </article>
  );
}
