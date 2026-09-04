import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError, Category, createTicket, CreatedTicket, getCategories, getRelatedSystems, RelatedSystem, RequestedPriority, TicketWarning,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|pdf)$/i;

type Fields = { categoryId: string; relatedSystemId: string; summary: string; description: string; requestedPriority: RequestedPriority };
type FieldErrors = Partial<Record<keyof Fields | "attachments", string>>;
type FormFailure = { message: string; retryable: boolean };

const initialFields: Fields = { categoryId: "", relatedSystemId: "", summary: "", description: "", requestedPriority: "MEDIUM" };

function createKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function fileError(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const expectedType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "pdf" ? "application/pdf" : null;
  if (!expectedType || !ACCEPTED_TYPES.has(file.type) || file.type !== expectedType || !ACCEPTED_EXTENSIONS.test(file.name)) return `${file.name}: JPG, JPEG, PNG, WEBP, and PDF files are allowed. Filename extension and file type must agree.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: files must be 5 MiB or smaller.`;
  return null;
}

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`; }

function validate(fields: Fields, files: File[], invalidFiles: string[]): FieldErrors {
  const errors: FieldErrors = {};
  const summary = fields.summary.trim();
  const description = fields.description.trim();
  if (!fields.categoryId) errors.categoryId = "Choose a Category.";
  if (!fields.relatedSystemId) errors.relatedSystemId = "Choose a Related System.";
  if (summary.length < 5 || summary.length > 100) errors.summary = "Summary must be 5 to 100 characters after trimming.";
  if (description.length < 10 || description.length > 2000) errors.description = "Description must be 10 to 2,000 characters after trimming.";
  if (files.length > MAX_FILES) errors.attachments = "A Ticket can have up to 5 files. Remove the extra files before submitting.";
  if (invalidFiles.length) errors.attachments = "Remove invalid files before submitting.";
  return errors;
}

function fingerprint(fields: Fields, files: File[]) {
  return JSON.stringify({ categoryId: fields.categoryId, relatedSystemId: fields.relatedSystemId, summary: fields.summary.trim(), description: fields.description.trim(), requestedPriority: fields.requestedPriority, files: files.map((file) => [file.name, file.type, file.size, file.lastModified]) });
}

interface CreateTicketProps {
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onNavigate: (path: "/tickets" | "/tickets/new") => void;
}

export default function CreateTicket({ onDirtyChange, onBusyChange, onNavigate }: CreateTicketProps) {
  const { currentRequester } = useRequester();
  const [fields, setFields] = useState<Fields>(initialFields);
  const [files, setFiles] = useState<File[]>([]);
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] = useState<"loading" | "ready" | "error">("loading");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CreatedTicket | null>(null);
  const [warnings, setWarnings] = useState<TicketWarning[]>([]);
  const keysByPayload = useRef(new Map<string, string>());
  const submissionInFlight = useRef(false);
  const [frozenSubmission, setFrozenSubmission] = useState<string | null>(null);
  const locked = submitting || frozenSubmission !== null;

  const dirty = useMemo(() => Boolean(fields.categoryId || fields.relatedSystemId || fields.summary || fields.description || files.length || invalidFiles.length || fields.requestedPriority !== "MEDIUM"), [fields, files, invalidFiles]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(submitting); return () => onBusyChange(false); }, [submitting, onBusyChange]);

  async function loadReference() {
    setReferenceState("loading");
    try {
      const [loadedCategories, loadedSystems] = await Promise.all([getCategories(), getRelatedSystems()]);
      setCategories(loadedCategories);
      setSystems(loadedSystems);
      setReferenceState("ready");
    } catch {
      setReferenceState("error");
    }
  }
  useEffect(() => { void loadReference(); }, []);

  function changeField(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const messages = selected.map(fileError).filter((message): message is string => Boolean(message));
    const valid = selected.filter((file) => !fileError(file));
    const combined = [...files, ...valid];
    const hasTooMany = combined.length > MAX_FILES;
    setFiles(combined);
    setInvalidFiles((current) => [...current, ...messages]);
    setErrors((current) => ({ ...current, attachments: messages.length || hasTooMany ? "Remove invalid or extra files before submitting." : undefined }));
    setFormError(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setErrors((current) => ({ ...current, attachments: invalidFiles.length || files.length - 1 > MAX_FILES ? "Remove invalid or extra files before submitting." : undefined }));
  }

  function removeInvalidFile(index: number) {
    setInvalidFiles((current) => current.filter((_, messageIndex) => messageIndex !== index));
    setErrors((current) => ({ ...current, attachments: undefined }));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!currentRequester || submissionInFlight.current) return;
    const nextErrors = validate(fields, files, invalidFiles);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) {
      queueMicrotask(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const payloadFingerprint = fingerprint(fields, files);
    const key = keysByPayload.current.get(payloadFingerprint) ?? createKey();
    keysByPayload.current.set(payloadFingerprint, key);
    submissionInFlight.current = true;
    setSubmitting(true);
    try {
      const result = await createTicket(currentRequester.id, key, {
        categoryId: Number(fields.categoryId), relatedSystemId: Number(fields.relatedSystemId), summary: fields.summary,
        description: fields.description, requestedPriority: fields.requestedPriority, attachments: files,
      });
      setSuccess(result.data);
      setWarnings(result.warnings);
      setFrozenSubmission(null);
      onDirtyChange(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Ticket could not be created. Please try again.";
      if (error instanceof ApiError && error.fields.length) {
        const serverErrors: FieldErrors = {};
        error.fields.forEach(({ field, message: fieldMessage }) => {
          if (field in initialFields || field === "attachments") serverErrors[field as keyof FieldErrors] = fieldMessage;
        });
        setErrors(serverErrors);
        queueMicrotask(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      }
      const retryable = error instanceof ApiError ? error.retryable : true;
      if (retryable) setFrozenSubmission(payloadFingerprint);
      else if (error instanceof ApiError && (error.code === "VALIDATION_ERROR" || error.status === 413 || error.status === 415))
        setFrozenSubmission(null);
      setFormError({ message, retryable });
    } finally { submissionInFlight.current = false; setSubmitting(false); }
  }

  if (!currentRequester) return null;
  if (success) return (
    <section className="ticket-page" aria-labelledby="ticket-created-title">
      <div className="success-card" role="status" aria-live="polite">
        <p className="section-kicker">Ticket created</p><h1 id="ticket-created-title">Your Ticket has been submitted</h1>
        <dl className="success-details"><div><dt>Ticket Number</dt><dd>{success.ticketNumber}</dd></div><div><dt>Ticket Date</dt><dd>{new Date(success.ticketDate).toLocaleString()}</dd></div><div><dt>Current Status</dt><dd><span className="status-badge">New</span></dd></div></dl>
        {warnings.length > 0 && <div className="warning-alert" role="alert"><strong>Some attachments need attention.</strong><ul>{warnings.map((warning, index) => <li key={`${warning.filename ?? warning.code}-${index}`}>{warning.filename ? `${warning.filename}: ` : ""}{warning.message}</li>)}</ul><p className="mb-0">Add the affected file again from Ticket Detail.</p></div>}
        <div className="selector-actions"><button className="btn btn-success" type="button" onClick={() => setFormError({ message: "Ticket detail will be available in the next feature.", retryable: false })}>View Ticket</button><button className="btn btn-outline-success" type="button" onClick={() => onNavigate("/tickets")}>My Tickets</button></div>
        {formError && <p className="form-error" role="alert">{formError.message}</p>}
      </div>
    </section>
  );

  return (
    <section className="ticket-page" aria-labelledby="create-ticket-title">
      <button className="back-link" type="button" onClick={() => onNavigate("/tickets")} disabled={submitting}>← Back to My Tickets</button>
      <p className="section-kicker">Requester workspace</p><h1 id="create-ticket-title">Create Ticket</h1><p className="page-intro">Describe the issue and choose the affected service. Required fields are marked with <span aria-hidden="true">*</span>.</p>
      {formError && <div className="form-alert" role="alert">{formError.message} {frozenSubmission && <p className="mb-1">The request may have reached the server. This draft is locked to prevent a duplicate Ticket; retry the same submission to confirm the result.</p>}{formError.retryable && <button type="button" className="link-button" onClick={() => void submit()} disabled={submitting}>Retry</button>}</div>}
      {referenceState === "error" && <div className="form-alert" role="alert">Reference data could not be loaded. Your typed values are still here. <button type="button" className="link-button" onClick={() => void loadReference()}>Retry</button></div>}
      <form onSubmit={submit} noValidate aria-describedby="create-ticket-instruction">
        <p id="create-ticket-instruction" className="visually-hidden">Complete all required fields before submitting your Ticket.</p>
        <fieldset className="ticket-group"><legend>System information</legend><div className="readonly-grid"><div><span>Ticket Number</span><strong>Generated after submission</strong><small>Read-only</small></div><div><span>Ticket Date</span><strong>Set by the server after submission</strong><small>Read-only</small></div><div><span>Requester</span><strong>{currentRequester.name}</strong><small>{currentRequester.email}</small></div></div></fieldset>
        <fieldset className="ticket-group"><legend>Classification</legend><div className="form-grid">
          <div><label htmlFor="category">Category <span className="required">*</span></label><select id="category" value={fields.categoryId} required disabled={referenceState !== "ready" || locked} aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId ? "category-error" : undefined} onChange={(event) => changeField("categoryId", event.target.value)}><option value="">{referenceState === "loading" ? "Loading Categories..." : "Choose a Category"}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{errors.categoryId && <p id="category-error" className="field-error">{errors.categoryId}</p>}</div>
          <div><label htmlFor="related-system">Related System <span className="required">*</span></label><select id="related-system" value={fields.relatedSystemId} required disabled={referenceState !== "ready" || locked} aria-invalid={Boolean(errors.relatedSystemId)} aria-describedby={errors.relatedSystemId ? "related-system-error" : undefined} onChange={(event) => changeField("relatedSystemId", event.target.value)}><option value="">{referenceState === "loading" ? "Loading Related Systems..." : "Choose a Related System"}</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select>{errors.relatedSystemId && <p id="related-system-error" className="field-error">{errors.relatedSystemId}</p>}</div>
          <div><label htmlFor="priority">Requested Priority <span className="required">*</span></label><select id="priority" value={fields.requestedPriority} required disabled={locked} aria-invalid={Boolean(errors.requestedPriority)} aria-describedby={errors.requestedPriority ? "priority-error" : undefined} onChange={(event) => changeField("requestedPriority", event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>{errors.requestedPriority && <p id="priority-error" className="field-error">{errors.requestedPriority}</p>}</div>
        </div></fieldset>
        <fieldset className="ticket-group"><legend>Problem information</legend><div><label htmlFor="summary">Summary <span className="required">*</span></label><input id="summary" value={fields.summary} required minLength={5} maxLength={100} disabled={locked} aria-invalid={Boolean(errors.summary)} aria-describedby="summary-count summary-error" onChange={(event) => changeField("summary", event.target.value)} /><p id="summary-count" className="field-help">{fields.summary.trim().length} of 100 characters</p>{errors.summary && <p id="summary-error" className="field-error">{errors.summary}</p>}</div><div><label htmlFor="description">Description <span className="required">*</span></label><textarea id="description" value={fields.description} required minLength={10} maxLength={2000} disabled={locked} aria-invalid={Boolean(errors.description)} aria-describedby="description-count description-error" onChange={(event) => changeField("description", event.target.value)} /><p id="description-count" className="field-help">{fields.description.trim().length} of 2,000 characters</p>{errors.description && <p id="description-error" className="field-error">{errors.description}</p>}</div></fieldset>
        <fieldset className="ticket-group"><legend>Attachments</legend><label htmlFor="attachments">Add files (optional)</label><input id="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" disabled={locked} aria-invalid={Boolean(errors.attachments)} aria-describedby="attachment-help attachment-error" onChange={addFiles} /><p id="attachment-help" className="field-help">JPG, JPEG, PNG, WEBP, or PDF. Up to 5 files, 5 MiB each.</p><p className="file-count" aria-live="polite">{files.length} of {MAX_FILES} files</p>{errors.attachments && <p id="attachment-error" className="field-error">{errors.attachments}</p>}{invalidFiles.length > 0 && <ul className="file-list" aria-label="Invalid files">{invalidFiles.map((message, index) => <li key={`${message}-${index}`}><span><strong>Invalid file</strong><small>{message}</small></span><button type="button" className="btn btn-outline-danger btn-sm" disabled={locked} onClick={() => removeInvalidFile(index)}>Remove invalid file</button></li>)}</ul>}{files.length > 0 && <ul className="file-list">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span><strong>{file.name}</strong><small>{file.type || "Unknown type"} · {formatSize(file.size)} · Ready</small></span><button type="button" className="btn btn-outline-danger btn-sm" disabled={locked} onClick={() => removeFile(index)}>Remove before submit</button></li>)}</ul>}</fieldset>
        <div className="form-actions"><button type="button" className="btn btn-outline-secondary" disabled={submitting} onClick={() => onNavigate("/tickets")}>Cancel</button><button className="btn btn-success" type="submit" disabled={submitting || referenceState !== "ready"}>{submitting && <span className="busy-spinner" aria-hidden="true" />} {submitting ? "Submitting ticket..." : "Submit Ticket"}</button></div>
      </form>
    </section>
  );
}
