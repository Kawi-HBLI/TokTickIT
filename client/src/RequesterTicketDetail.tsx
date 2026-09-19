import { useEffect, useState } from "react";
import {
  ApiError,
  getTicketDetail,
  TicketDetail,
  PublicComment,
  fetchPublicComments,
  createPublicComment,
  indicateProblemResolved,
} from "./api.js";
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

  // Conversation state
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null);

  // Resolution indication state
  const [indicatingResolution, setIndicatingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentRequester) return;
    let active = true;
    setLoading(true);
    setError(null);

    getTicketDetail(ticketId)
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

  // Load public comments
  useEffect(() => {
    if (!currentRequester) return;
    let active = true;
    setLoadingComments(true);

    fetchPublicComments(ticketId)
      .then((res) => {
        if (!active) return;
        setComments(res.data);
        setLoadingComments(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadingComments(false);
      });

    return () => {
      active = false;
    };
  }, [ticketId, currentRequester?.id, reloadTrigger]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (trimmed.length === 0) {
      setCommentError("Please enter a comment before posting.");
      return;
    }
    if (trimmed.length > 2000) {
      setCommentError("Comment cannot exceed 2,000 characters.");
      return;
    }

    setSubmittingComment(true);
    setCommentError(null);
    setCommentSuccess(null);

    try {
      const res = await createPublicComment(ticketId, trimmed);
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
      setCommentSuccess("Your comment has been posted.");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setCommentError(err.message);
      } else {
        setCommentError("Could not post public comment. Please try again.");
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleIndicateResolution = async () => {
    if (!ticket) return;
    setIndicatingResolution(true);
    setResolutionError(null);

    try {
      const res = await indicateProblemResolved(ticket.id, ticket.updatedAt);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              requesterResolutionIndicatedAt: res.data.indicatedAt,
              requesterResolutionIndicatedBy: res.data.indicatedBy,
            }
          : null
      );
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setReloadTrigger((count) => count + 1);
          setResolutionError("The ticket status or version changed. Reloading latest details…");
        } else {
          setResolutionError(err.message);
        }
      } else {
        setResolutionError("Failed to record resolution indication. Please try again.");
      }
    } finally {
      setIndicatingResolution(false);
    }
  };

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

  const isResolutionEligible = [
    "NEW",
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_REQUESTER",
  ].includes(ticket.currentStatus);

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

      {/* Conversation Section */}
      <section className="ticket-group conversation-section" aria-labelledby="conversation-heading">
        <h2 id="conversation-heading" className="section-title">Conversation</h2>

        {/* Resolution Indication Action or Status */}
        <div className="resolution-indication-container" aria-label="Resolution indication">
          {ticket.requesterResolutionIndicatedAt ? (
            <div className="resolution-indicated-banner" role="status">
              <span className="resolution-icon" aria-hidden="true">✓</span>
              <div>
                <strong>Problem indicated as resolved</strong>
                <p>
                  Reported on {formatDate(ticket.requesterResolutionIndicatedAt)} by{" "}
                  {ticket.requesterResolutionIndicatedBy?.name || "Requester"}. IT staff will review and formally resolve this ticket.
                </p>
              </div>
            </div>
          ) : isResolutionEligible ? (
            <div className="resolution-action-card">
              <div className="resolution-action-info">
                <strong>Problem appears resolved?</strong>
                <p className="resolution-explanation">
                  If your issue has been resolved, you can notify IT staff. This notifies IT and does not mark the ticket Resolved or Closed immediately.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-success resolution-action-btn"
                disabled={indicatingResolution}
                onClick={handleIndicateResolution}
              >
                {indicatingResolution ? "Submitting…" : "Problem appears resolved"}
              </button>
            </div>
          ) : null}

          {resolutionError && (
            <div className="state-message state-message-error" role="alert">
              <p>{resolutionError}</p>
            </div>
          )}
        </div>

        {/* Public Comments List */}
        <div className="comments-list-section" aria-label="Public comments">
          <h3 className="comments-subtitle">Public Comments</h3>
          {loadingComments ? (
            <p className="muted-text">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="no-comments-text">No comments yet.</p>
          ) : (
            <ul className="comments-list" role="list">
              {comments.map((comment) => (
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
        </div>

        {/* Public Comment Composer */}
        <form onSubmit={handlePostComment} className="comment-composer-form" noValidate>
          <div className="composer-field">
            <label htmlFor="public-comment-input" className="form-label">
              Add a comment
            </label>
            <textarea
              id="public-comment-input"
              className="composer-textarea"
              rows={4}
              maxLength={2000}
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (commentError) setCommentError(null);
                if (commentSuccess) setCommentSuccess(null);
              }}
              placeholder="Type a public comment for IT staff…"
              disabled={submittingComment}
              aria-describedby="comment-char-count"
              aria-invalid={!!commentError}
            />
            <div className="composer-footer">
              <span id="comment-char-count" className="char-count" aria-live="polite">
                {commentText.length} / 2000 characters
              </span>
              {commentError && (
                <span className="error-text" role="alert">
                  {commentError}
                </span>
              )}
              {commentSuccess && (
                <span className="success-text" role="status">
                  {commentSuccess}
                </span>
              )}
            </div>
          </div>
          <div className="composer-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submittingComment || commentText.trim().length === 0}
            >
              {submittingComment ? "Posting comment…" : "Post public comment"}
            </button>
          </div>
        </form>
      </section>

      {/* Attachment Section */}
      <AttachmentSection
        ticketId={ticket.id}
        initialAttachments={ticket.attachments}
      />
    </article>
  );
}
