const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
  description: string;
}

export type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  attachments: File[];
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  currentStatus: "NEW";
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  requestedPriority: RequestedPriority;
  currentStatus: "NEW";
  createdAt: string;
  updatedAt: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  activeAttachmentCount: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface TicketQueryState {
  search?: string;
  categoryId?: number | null;
  requestedPriority?: RequestedPriority | null;
  sortBy?: "createdAt" | "updatedAt" | "requestedPriority";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: 10 | 20 | 50;
}

export interface MyTicketsResponse {
  data: TicketListItem[];
  pagination: PaginationMeta;
  query: {
    search: string;
    categoryId: number | null;
    requestedPriority: RequestedPriority | null;
    sortBy: "createdAt" | "updatedAt" | "requestedPriority";
    sortOrder: "asc" | "desc";
  };
}

export interface AttachmentItem {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isRemoved: boolean;
  createdAt: string;
  removedAt?: string | null;
  removalReason?: string | null;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  description: string;
  requestedPriority: RequestedPriority;
  itPriority: string | null;
  currentStatus: string;
  ticketOwner: string | null;
  createdAt: string;
  updatedAt: string;
  requester: {
    id: number;
    name: string;
    email: string;
    department: string;
  };
  category: {
    id: number;
    name: string;
  };
  relatedSystem: {
    id: number;
    name: string;
  };
  attachments: AttachmentItem[];
}

export interface AttachmentListResponse {
  data: AttachmentItem[];
  activeCount: number;
  activeLimit: number;
}

export interface TicketWarning {
  code: string;
  filename?: string;
  message: string;
}

export interface CreateTicketResult {
  data: CreatedTicket;
  warnings: TicketWarning[];
  replayed: boolean;
}

export interface ApiFieldError { field: string; message: string; }

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly fields: ApiFieldError[] = [],
    public readonly retryable = status !== undefined && status >= 500,
  ) {
    super(message);
  }
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export interface Requester {
  id: number;
  name: string;
  email: string;
  department: string;
  isActive: true;
}

interface RequesterListResponse {
  data: Requester[];
}

export async function getRequesters(): Promise<Requester[]> {
  const response = await fetch(`${API_URL}/api/requesters`);
  if (!response.ok) throw new Error("Development Requesters are unavailable");

  const payload = await response.json() as RequesterListResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("Invalid Development Requester response");
  }
  return payload.data;
}

export function requesterHeaders(requesterId: number): HeadersInit {
  return { "x-requester-id": String(requesterId) };
}

async function readError(response: Response, fallback: string): Promise<never> {
  let payload: { error?: { code?: string; message?: string; fields?: ApiFieldError[]; retryable?: boolean } } | null = null;
  try { payload = await response.json() as { error?: { code?: string; message?: string; fields?: ApiFieldError[]; retryable?: boolean } }; } catch { /* safe fallback */ }
  const error = payload?.error;
  throw new ApiError(error?.message ?? fallback, response.status, error?.code, error?.fields ?? [], error?.retryable ?? response.status >= 500);
}

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`);
  if (!response.ok) return readError(response, "Categories are unavailable.");
  const payload = await response.json() as { data?: Category[] };
  if (!Array.isArray(payload?.data)) throw new ApiError("Invalid Categories response.");
  return payload.data;
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`);
  if (!response.ok) return readError(response, "Related Systems are unavailable.");
  const payload = await response.json() as { data?: RelatedSystem[] };
  if (!Array.isArray(payload?.data)) throw new ApiError("Invalid Related Systems response.");
  return payload.data;
}

export async function createTicket(
  requesterId: number,
  idempotencyKey: string,
  input: CreateTicketInput,
): Promise<CreateTicketResult> {
  const form = new FormData();
  form.set("categoryId", String(input.categoryId));
  form.set("relatedSystemId", String(input.relatedSystemId));
  form.set("summary", input.summary.trim());
  form.set("description", input.description.trim());
  form.set("requestedPriority", input.requestedPriority);
  input.attachments.forEach((file) => form.append("attachments", file));

  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { ...requesterHeaders(requesterId), "Idempotency-Key": idempotencyKey },
    body: form,
  });
  if (!response.ok) return readError(response, "Ticket could not be created. Please try again.");
  const payload = await response.json() as { data?: CreatedTicket; warnings?: TicketWarning[] };
  if (!payload?.data?.ticketNumber || !payload.data.ticketDate) throw new ApiError("The Ticket response could not be confirmed. Please retry the same submission.", response.status, "INVALID_TICKET_RESPONSE", [], true);
  return { data: payload.data, warnings: payload.warnings ?? [], replayed: response.headers.get("Idempotency-Replayed") === "true" };
}

export async function getMyTickets(
  requesterId: number,
  query?: TicketQueryState,
): Promise<MyTicketsResponse> {
  const params = new URLSearchParams();
  if (query?.search?.trim()) params.set("search", query.search.trim());
  if (query?.categoryId) params.set("categoryId", String(query.categoryId));
  if (query?.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query?.sortBy) params.set("sortBy", query.sortBy);
  if (query?.sortOrder) params.set("sortOrder", query.sortOrder);
  if (query?.page && query.page > 1) params.set("page", String(query.page));
  if (query?.pageSize && query.pageSize !== 10) params.set("pageSize", String(query.pageSize));

  const url = `${API_URL}/api/tickets${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    headers: requesterHeaders(requesterId),
  });

  if (!response.ok) {
    return readError(response, "Tickets could not be loaded. Please try again.");
  }

  const payload = (await response.json()) as MyTicketsResponse;
  if (!payload || !Array.isArray(payload.data) || !payload.pagination) {
    throw new ApiError("Invalid My Tickets response.", response.status, "INVALID_RESPONSE");
  }

  return payload;
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) {
    throw new Error("Backend is unavailable");
  }
  const catRes = await fetch(`${API_URL}/api/categories`);
  if (!catRes.ok) {
    throw new Error("Failed to fetch categories");
  }
  const raw = await catRes.json() as Category[] | { data?: Category[] };
  const categories = Array.isArray(raw) ? raw : raw.data ?? [];
  return { online: true, categories };
}

export async function getTicketDetail(
  requesterId: number,
  ticketId: number,
): Promise<TicketDetail> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    headers: requesterHeaders(requesterId),
  });

  if (!response.ok) {
    return readError(response, "Ticket details could not be loaded.");
  }

  const payload = await response.json();
  if (!payload || !payload.data) {
    throw new ApiError("Invalid ticket detail response.", response.status, "INVALID_RESPONSE");
  }

  return payload.data;
}

export async function getTicketAttachments(
  requesterId: number,
  ticketId: number,
): Promise<AttachmentListResponse> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    headers: requesterHeaders(requesterId),
  });

  if (!response.ok) {
    return readError(response, "Attachments could not be loaded.");
  }

  return response.json();
}

export async function uploadAttachmentsToTicket(
  requesterId: number,
  ticketId: number,
  files: File[],
): Promise<AttachmentListResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append("attachments", file));

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: requesterHeaders(requesterId),
    body: formData,
  });

  if (!response.ok) {
    return readError(response, "Failed to upload attachments.");
  }

  return response.json();
}

export async function removeAttachment(
  requesterId: number,
  attachmentId: number,
  reason: string,
): Promise<{ data: AttachmentItem }> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: {
      ...requesterHeaders(requesterId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    return readError(response, "Failed to remove attachment.");
  }

  return response.json();
}

export function getAttachmentPreviewUrl(attachmentId: number): string {
  return `${API_URL}/api/attachments/${attachmentId}/preview`;
}

export function getAttachmentDownloadUrl(attachmentId: number): string {
  return `${API_URL}/api/attachments/${attachmentId}/download`;
}

export async function downloadAttachmentFile(
  requesterId: number,
  attachmentId: number,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    headers: requesterHeaders(requesterId),
  });

  if (!response.ok) {
    return readError(response, "Attachment could not be downloaded.");
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  return { blob, contentType };
}

export async function previewAttachmentFile(
  requesterId: number,
  attachmentId: number,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/preview`, {
    headers: requesterHeaders(requesterId),
  });

  if (!response.ok) {
    return readError(response, "Attachment preview could not be loaded.");
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  return { blob, contentType };
}
