import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  AttachmentItem,
  downloadAttachmentFile,
  getAttachmentDownloadUrl,
  getAttachmentPreviewUrl,
  getTicketAttachments,
  previewAttachmentFile,
  removeAttachment,
  uploadAttachmentsToTicket,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";

interface AttachmentSectionProps {
  ticketId: number;
  initialAttachments: AttachmentItem[];
  onAttachmentCountChange?: (activeCount: number) => void;
}

const MAX_ACTIVE_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function AttachmentSection({
  ticketId,
  initialAttachments,
  onAttachmentCountChange,
}: AttachmentSectionProps) {
  const { currentRequester } = useRequester();
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Dialog state
  const [removingAttachment, setRemovingAttachment] = useState<AttachmentItem | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAttachments = attachments.filter((a) => !a.isRemoved);
  const removedAttachments = attachments.filter((a) => a.isRemoved);
  const activeCount = activeAttachments.length;
  const isLimitReached = activeCount >= MAX_ACTIVE_FILES;

  useEffect(() => {
    onAttachmentCountChange?.(activeCount);
  }, [activeCount, onAttachmentCountChange]);

  // Focus management when dialog opens/closes
  useEffect(() => {
    if (removingAttachment) {
      reasonInputRef.current?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [removingAttachment]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !currentRequester) return;

    setUploadError(null);
    setStatusMessage(null);
    setRefreshError(null);

    if (activeCount + files.length > MAX_ACTIVE_FILES) {
      setUploadError(`Cannot exceed ${MAX_ACTIVE_FILES} active attachments. You can add at most ${MAX_ACTIVE_FILES - activeCount} more.`);
      return;
    }

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setUploadError(`"${file.name}" exceeds the 5 MiB size limit.`);
        return;
      }
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const validExtension = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(extension);
      if (!validExtension) {
        setUploadError(`"${file.name}" has an unsupported file type. Use JPG, PNG, WEBP, or PDF.`);
        return;
      }
      const expectedType =
        extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : extension === ".png"
          ? "image/png"
          : extension === ".webp"
          ? "image/webp"
          : extension === ".pdf"
          ? "application/pdf"
          : null;
      if (file.type && expectedType && file.type !== expectedType) {
        setUploadError(`"${file.name}" file type does not match its extension.`);
        return;
      }
    }

    setUploading(true);
    try {
      await uploadAttachmentsToTicket(currentRequester.id, ticketId, files);
      setStatusMessage(`Uploaded ${files.length} file(s) successfully.`);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload attachments.");
      setUploading(false);
      return;
    }

    try {
      const refreshed = await getTicketAttachments(currentRequester.id, ticketId);
      setAttachments(refreshed.data);
      setRefreshError(null);
    } catch {
      setRefreshError("File(s) uploaded successfully, but the attachment list could not be refreshed.");
    } finally {
      setUploading(false);
    }
  }

  async function handlePreview(att: AttachmentItem) {
    if (!currentRequester) return;
    setUploadError(null);
    setPreviewingId(att.id);

    // Open new tab synchronously within user click event to prevent popup blockers
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
      const { blob } = await previewAttachmentFile(currentRequester.id, att.id);
      const url = URL.createObjectURL(blob);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.href = url;
      } else {
        const fallback = window.open(url, "_blank", "noopener,noreferrer");
        if (!fallback) {
          setUploadError("Pop-up was blocked by browser. Please allow pop-ups for this site to preview attachments.");
        }
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          // ignore
        }
      }
      setUploadError(err.message || "Failed to preview attachment.");
    } finally {
      setPreviewingId(null);
    }
  }

  async function handleDownload(att: AttachmentItem) {
    if (!currentRequester) return;
    setUploadError(null);
    setDownloadingId(att.id);
    try {
      const { blob } = await downloadAttachmentFile(currentRequester.id, att.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = att.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setUploadError(err.message || "Failed to download attachment.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRetryRefresh() {
    if (!currentRequester) return;
    try {
      const refreshed = await getTicketAttachments(currentRequester.id, ticketId);
      setAttachments(refreshed.data);
      setRefreshError(null);
    } catch (err: any) {
      setRefreshError(err.message || "Refreshing attachments list failed. Please try again.");
    }
  }

  function openRemovalDialog(att: AttachmentItem, event: React.MouseEvent<HTMLElement>) {
    previousFocusRef.current = event.currentTarget;
    setRemovingAttachment(att);
    setRemovalReason("");
    setReasonError(null);
  }

  function closeRemovalDialog() {
    setRemovingAttachment(null);
    setRemovalReason("");
    setReasonError(null);
    setRemovingBusy(false);
  }

  function handleDialogKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeRemovalDialog();
      return;
    }

    if (e.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  async function handleConfirmRemoval(e: FormEvent) {
    e.preventDefault();
    if (!removingAttachment || !currentRequester || removingBusy) return;

    const trimmed = removalReason.trim();
    if (trimmed.length < 5 || trimmed.length > 200) {
      setReasonError("Removal reason must be between 5 and 200 characters.");
      return;
    }

    setRemovingBusy(true);
    setReasonError(null);
    const targetName = removingAttachment.originalName;
    const targetId = removingAttachment.id;

    try {
      const res = await removeAttachment(currentRequester.id, targetId, trimmed);
      // Immediately update local state using the DELETE response data so file is marked removed
      setAttachments((prev) =>
        prev.map((att) => (att.id === targetId ? res.data : att))
      );
      setStatusMessage(`Attachment "${targetName}" was removed.`);
      closeRemovalDialog();
    } catch (err: any) {
      setReasonError(err.message || "Failed to remove attachment.");
      setRemovingBusy(false);
      return;
    }

    try {
      const refreshed = await getTicketAttachments(currentRequester.id, ticketId);
      setAttachments(refreshed.data);
      setRefreshError(null);
    } catch {
      setRefreshError("Attachment was removed, but the attachment list could not be refreshed.");
    }
  }

  return (
    <section className="ticket-group attachments-workspace" aria-labelledby="attachments-heading">
      <div className="attachments-header">
        <h2 id="attachments-heading" className="section-title">Attachments</h2>
        <span className="file-count" aria-live="polite">
          {activeCount} of {MAX_ACTIVE_FILES} active files
        </span>
      </div>

      {statusMessage && (
        <div className="alert alert-success" role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}

      {refreshError && (
        <div className="alert alert-warning refresh-error-banner" role="alert">
          <span>{refreshError}</span>{" "}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary retry-refresh-btn"
            onClick={handleRetryRefresh}
          >
            Retry Refresh
          </button>
        </div>
      )}

      {/* Active Attachments */}
      <div className="active-attachments-area">
        <h3 className="subsection-title">Active Files</h3>
        {activeAttachments.length === 0 ? (
          <p className="empty-text">No active attachments on this ticket.</p>
        ) : (
          <ul className="attachment-list" aria-label="Active attachments">
            {activeAttachments.map((att) => (
              <li key={att.id} className="attachment-item">
                <div className="attachment-info">
                  <span className="attachment-name" title={att.originalName}>
                    📎 {att.originalName}
                  </span>
                  <span className="attachment-meta">
                    {formatBytes(att.sizeBytes)} · Uploaded {formatDate(att.createdAt)}
                  </span>
                </div>
                <div className="attachment-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary preview-btn"
                    onClick={() => handlePreview(att)}
                    disabled={previewingId === att.id}
                    aria-label={`Preview ${att.originalName}`}
                  >
                    {previewingId === att.id ? "Loading…" : "Preview"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary download-btn"
                    onClick={() => handleDownload(att)}
                    disabled={downloadingId === att.id}
                    aria-label={`Download ${att.originalName}`}
                  >
                    {downloadingId === att.id ? "Downloading…" : "Download"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger remove-btn"
                    onClick={(e) => openRemovalDialog(att, e)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Attachments Box */}
      <div className="add-attachment-box">
        <h3 className="subsection-title">Add Attachments</h3>
        <p className="field-help" id="add-att-help">
          Supported formats: JPG, PNG, WEBP, or PDF up to 5 MiB each. (Maximum {MAX_ACTIVE_FILES} active files per ticket)
        </p>

        {isLimitReached ? (
          <div className="alert alert-info limit-notice" role="status">
            Maximum limit of {MAX_ACTIVE_FILES} active attachments has been reached. Remove an active attachment before uploading new files.
          </div>
        ) : (
          <div className="upload-controls">
            <label htmlFor="detail-file-input" className="visually-hidden">
              Choose files to attach
            </label>
            <input
              id="detail-file-input"
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading || isLimitReached}
              aria-describedby="add-att-help"
              onChange={handleFileChange}
              className="form-control"
            />
            {uploading && (
              <span className="busy-upload-text" aria-live="polite">
                <span className="busy-spinner" aria-hidden="true" /> Uploading files…
              </span>
            )}
          </div>
        )}

        {uploadError && (
          <div className="field-error" role="alert">
            {uploadError}
          </div>
        )}
      </div>

      {/* Removed Attachments Subsection */}
      {removedAttachments.length > 0 && (
        <div className="removed-attachments-area">
          <h3 className="subsection-title">Removed Attachments</h3>
          <ul className="attachment-list removed-list" aria-label="Removed attachments">
            {removedAttachments.map((att) => (
              <li key={att.id} className="attachment-item removed-item">
                <div className="attachment-info">
                  <div className="removed-title-row">
                    <span className="attachment-name strikethrough" title={att.originalName}>
                      {att.originalName}
                    </span>
                    <span className="status-badge status-removed">Removed</span>
                  </div>
                  <span className="attachment-meta">
                    {formatBytes(att.sizeBytes)} · Uploaded {formatDate(att.createdAt)} · Removed {formatDate(att.removedAt)}
                  </span>
                  {att.removalReason && (
                    <p className="removal-reason-text">
                      <strong>Reason:</strong> {att.removalReason}
                    </p>
                  )}
                </div>
                <div className="attachment-actions">
                  <span className="removed-notice" title="Removed files cannot be previewed or downloaded.">
                    Unavailable
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Removal Confirmation Dialog */}
      {removingAttachment && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="confirm-dialog removal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="removal-dialog-title"
            aria-describedby="removal-dialog-desc"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="removal-dialog-title">Remove Attachment</h2>
            <p id="removal-dialog-desc">
              Are you sure you want to remove <strong>{removingAttachment.originalName}</strong>?
              Please specify the reason for removing this file (5–200 characters).
            </p>
            <form onSubmit={handleConfirmRemoval} noValidate>
              <div className="form-group">
                <label htmlFor="removal-reason-input" className="form-label">
                  Removal Reason <span className="required">*</span>
                </label>
                <textarea
                  id="removal-reason-input"
                  ref={reasonInputRef}
                  value={removalReason}
                  required
                  minLength={5}
                  maxLength={200}
                  rows={3}
                  disabled={removingBusy}
                  className="form-control"
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby="reason-count reason-error"
                  onChange={(e) => {
                    setRemovalReason(e.target.value);
                    setReasonError(null);
                  }}
                />
                <p id="reason-count" className="field-help">
                  {removalReason.trim().length} of 200 characters
                </p>
                {reasonError && (
                  <p id="reason-error" className="field-error" role="alert">
                    {reasonError}
                  </p>
                )}
              </div>
              <div className="dialog-actions">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={removingBusy}
                  onClick={closeRemovalDialog}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger remove-confirm-btn"
                  disabled={removingBusy}
                >
                  {removingBusy ? "Removing…" : "Remove Attachment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
