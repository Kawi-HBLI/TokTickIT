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
  requesterResolutionIndicatedAt?: string | null;
  requesterResolutionIndicatedBy?: { id: number; name: string } | null;
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
    public readonly retryAfterSeconds?: number,
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

export type UserRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticationResult {
  user: CurrentUser;
  csrfToken: string;
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function csrfHeaders(): HeadersInit {
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

function requestHeaders(headers?: HeadersInit, unsafe = false): HeadersInit {
  return {
    ...(unsafe ? csrfHeaders() : {}),
    ...(headers ?? {}),
  };
}

function signalAuthenticationRecovery(code?: string): void {
  if (typeof window === "undefined") return;
  if (code === "AUTHENTICATION_REQUIRED" || code === "PASSWORD_CHANGE_REQUIRED") {
    window.dispatchEvent(new CustomEvent("toktickit:auth-recovery"));
  }
}

function readAuthenticationResult(payload: unknown, status?: number): AuthenticationResult {
  const data = (payload as { data?: { user?: CurrentUser; csrfToken?: string } } | null)?.data;
  if (!data?.user || !data.csrfToken) {
    throw new ApiError("Invalid authentication response.", status, "INVALID_RESPONSE");
  }
  setCsrfToken(data.csrfToken);
  return { user: data.user, csrfToken: data.csrfToken };
}

export async function getCurrentUser(): Promise<AuthenticationResult> {
  const response = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) setCsrfToken(null);
    return readError(response, "Your session could not be restored.", false);
  }
  return readAuthenticationResult(await response.json(), response.status);
}

export async function login(email: string, password: string): Promise<AuthenticationResult> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!response.ok) return readError(response, "We could not sign you in right now. Try again.");
  return readAuthenticationResult(await response.json(), response.status);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthenticationResult> {
  const response = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) return readError(response, "We could not change your password right now. Try again.");
  return readAuthenticationResult(await response.json(), response.status);
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders(undefined, true),
  });
  if (!response.ok) return readError(response, "We could not sign you out right now. Try again.");
  setCsrfToken(null);
}

async function readError(response: Response, fallback: string, triggerAuthenticationRecovery = true): Promise<never> {
  let payload: { error?: { code?: string; message?: string; fields?: ApiFieldError[] | Record<string, string>; retryable?: boolean } } | null = null;
  try { payload = await response.json() as { error?: { code?: string; message?: string; fields?: ApiFieldError[] | Record<string, string>; retryable?: boolean } }; } catch { /* safe fallback */ }
  const error = payload?.error;
  const fields = Array.isArray(error?.fields)
    ? error.fields
    : Object.entries(error?.fields ?? {}).map(([field, message]) => ({ field, message }));
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (triggerAuthenticationRecovery) signalAuthenticationRecovery(error?.code);
  throw new ApiError(error?.message ?? fallback, response.status, error?.code, fields, error?.retryable ?? response.status >= 500, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
}

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`, { credentials: "include" });
  if (!response.ok) return readError(response, "Categories are unavailable.");
  const payload = await response.json() as { data?: Category[] };
  if (!Array.isArray(payload?.data)) throw new ApiError("Invalid Categories response.");
  return payload.data;
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`, { credentials: "include" });
  if (!response.ok) return readError(response, "Related Systems are unavailable.");
  const payload = await response.json() as { data?: RelatedSystem[] };
  if (!Array.isArray(payload?.data)) throw new ApiError("Invalid Related Systems response.");
  return payload.data;
}

export function createTicket(idempotencyKey: string, input: CreateTicketInput): Promise<CreateTicketResult>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function createTicket(requesterId: number, idempotencyKey: string, input: CreateTicketInput): Promise<CreateTicketResult>;
export async function createTicket(
  first: string | number,
  second: string | CreateTicketInput,
  third?: CreateTicketInput,
): Promise<CreateTicketResult> {
  const idempotencyKey = typeof first === "number" ? second as string : first;
  const input = (typeof first === "number" ? third : second) as CreateTicketInput;
  const form = new FormData();
  form.set("categoryId", String(input.categoryId));
  form.set("relatedSystemId", String(input.relatedSystemId));
  form.set("summary", input.summary.trim());
  form.set("description", input.description.trim());
  form.set("requestedPriority", input.requestedPriority);
  input.attachments.forEach((file) => form.append("attachments", file));

  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Idempotency-Key": idempotencyKey }, true),
    body: form,
  });
  if (!response.ok) return readError(response, "Ticket could not be created. Please try again.");
  const payload = await response.json() as { data?: CreatedTicket; warnings?: TicketWarning[] };
  if (!payload?.data?.ticketNumber || !payload.data.ticketDate) throw new ApiError("The Ticket response could not be confirmed. Please retry the same submission.", response.status, "INVALID_TICKET_RESPONSE", [], true);
  return { data: payload.data, warnings: payload.warnings ?? [], replayed: response.headers.get("Idempotency-Replayed") === "true" };
}

/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function getMyTickets(query?: TicketQueryState): Promise<MyTicketsResponse>;
export function getMyTickets(requesterId: number, query?: TicketQueryState): Promise<MyTicketsResponse>;
export async function getMyTickets(
  first?: number | TicketQueryState,
  legacyQuery?: TicketQueryState,
): Promise<MyTicketsResponse> {
  const query = typeof first === "number" ? legacyQuery : first;
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
    credentials: "include",
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
  const res = await fetch(`${API_URL}/api/health`, { credentials: "include" });
  if (!res.ok) {
    throw new Error("Backend is unavailable");
  }
  const catRes = await fetch(`${API_URL}/api/categories`, { credentials: "include" });
  if (!catRes.ok) {
    throw new Error("Failed to fetch categories");
  }
  const raw = await catRes.json() as Category[] | { data?: Category[] };
  const categories = Array.isArray(raw) ? raw : raw.data ?? [];
  return { online: true, categories };
}

export function getTicketDetail(ticketId: number): Promise<TicketDetail>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function getTicketDetail(requesterId: number, ticketId: number): Promise<TicketDetail>;
export async function getTicketDetail(first: number, second?: number): Promise<TicketDetail> {
  const ticketId = second ?? first;
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    credentials: "include",
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

export function getTicketAttachments(ticketId: number): Promise<AttachmentListResponse>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function getTicketAttachments(requesterId: number, ticketId: number): Promise<AttachmentListResponse>;
export async function getTicketAttachments(first: number, second?: number): Promise<AttachmentListResponse> {
  const ticketId = second ?? first;
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Attachments could not be loaded.");
  }

  return response.json();
}

export function uploadAttachmentsToTicket(ticketId: number, files: File[]): Promise<AttachmentListResponse>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function uploadAttachmentsToTicket(requesterId: number, ticketId: number, files: File[]): Promise<AttachmentListResponse>;
export async function uploadAttachmentsToTicket(first: number, second: number | File[], third?: File[]): Promise<AttachmentListResponse> {
  const ticketId = third ? second as number : first;
  const files = (third ?? second) as File[];
  const formData = new FormData();
  files.forEach((file) => formData.append("attachments", file));

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders(undefined, true),
    body: formData,
  });

  if (!response.ok) {
    return readError(response, "Failed to upload attachments.");
  }

  return response.json();
}

export function removeAttachment(attachmentId: number, reason: string): Promise<{ data: AttachmentItem }>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function removeAttachment(requesterId: number, attachmentId: number, reason: string): Promise<{ data: AttachmentItem }>;
export async function removeAttachment(first: number, second: number | string, third?: string): Promise<{ data: AttachmentItem }> {
  const attachmentId = third === undefined ? first : second as number;
  const reason = third ?? second as string;
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      ...requestHeaders(undefined, true),
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

export function downloadAttachmentFile(attachmentId: number): Promise<{ blob: Blob; contentType: string }>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function downloadAttachmentFile(requesterId: number, attachmentId: number): Promise<{ blob: Blob; contentType: string }>;
export async function downloadAttachmentFile(first: number, second?: number): Promise<{ blob: Blob; contentType: string }> {
  const attachmentId = second ?? first;
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Attachment could not be downloaded.");
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  return { blob, contentType };
}

export function previewAttachmentFile(attachmentId: number): Promise<{ blob: Blob; contentType: string }>;
/** @deprecated requesterId is ignored; identity comes from the authenticated session. */
export function previewAttachmentFile(requesterId: number, attachmentId: number): Promise<{ blob: Blob; contentType: string }>;
export async function previewAttachmentFile(first: number, second?: number): Promise<{ blob: Blob; contentType: string }> {
  const attachmentId = second ?? first;
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/preview`, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Attachment preview could not be loaded.");
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") || "application/octet-stream";
  return { blob, contentType };
}

export type StaffSortBy = "updatedAt" | "createdAt" | "requestedPriority" | "itPriority" | "status";
export type StaffSortDirection = "asc" | "desc";

export interface StaffQueueItem {
  id: number;
  ticketNumber: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  category: { id: number; name: string };
  requester: { id: number; name: string; email: string };
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: string;
  owner: { id: number; name: string; email: string } | null;
  requesterResolutionIndicatedAt: string | null;
}

export interface StaffQueueQuery {
  q?: string;
  status?: string | null;
  requestedPriority?: string | null;
  itPriority?: string | null;
  categoryId?: number | null;
  owner?: string | null;
  sortBy?: StaffSortBy;
  sortDirection?: StaffSortDirection;
  page?: number;
  pageSize?: 10 | 20 | 50;
}

export interface StaffQueueResponse {
  data: StaffQueueItem[];
  pagination: PaginationMeta;
  query: {
    q: string;
    status: string | null;
    requestedPriority: string | null;
    itPriority: string | null;
    categoryId: number | null;
    owner: string | null;
    sortBy: StaffSortBy;
    sortDirection: StaffSortDirection;
  };
}

export interface StaffAssignee {
  id: number;
  name: string;
  email: string;
  role: "IT_STAFF" | "ADMINISTRATOR";
}

export async function fetchStaffTickets(query?: StaffQueueQuery): Promise<StaffQueueResponse> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.status) params.set("status", query.status);
  if (query?.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query?.itPriority) params.set("itPriority", query.itPriority);
  if (query?.categoryId) params.set("categoryId", String(query.categoryId));
  if (query?.owner) params.set("owner", query.owner);
  if (query?.sortBy) params.set("sortBy", query.sortBy);
  if (query?.sortDirection) params.set("sortDirection", query.sortDirection);
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));

  const qs = params.toString();
  const url = `${API_URL}/api/staff/tickets${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Staff ticket queue could not be loaded.");
  }

  return response.json();
}

export async function fetchStaffAssignees(): Promise<{ data: StaffAssignee[] }> {
  const response = await fetch(`${API_URL}/api/staff/assignees`, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Assignees could not be loaded.");
  }

  return response.json();
}

export interface PublicComment {
  id: number;
  ticketId: number;
  content: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    role: UserRole;
  };
}

export interface PublicCommentsResponse {
  data: PublicComment[];
  meta: { count: number };
}

export interface ResolutionIndicationResponse {
  data: {
    indicatedAt: string;
    indicatedBy: { id: number; name: string };
    currentStatus: string;
  };
}

export async function fetchPublicComments(ticketId: number): Promise<PublicCommentsResponse> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/public-comments`, {
    credentials: "include",
  });

  if (!response.ok) {
    return readError(response, "Public comments could not be loaded.");
  }

  return response.json();
}

export async function createPublicComment(
  ticketId: number,
  content: string
): Promise<{ data: PublicComment }> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/public-comments`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    return readError(response, "Could not post public comment.");
  }

  return response.json();
}

export async function indicateProblemResolved(
  ticketId: number,
  expectedUpdatedAt: string
): Promise<ResolutionIndicationResponse> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/resolution-indication`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ expectedUpdatedAt }),
  });

  if (!response.ok) {
    return readError(response, "Could not record resolution indication.");
  }

  return response.json();
}

export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export interface InternalNote {
  id: number;
  content: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    role: UserRole;
  };
}

export interface InternalNotesResponse {
  data: InternalNote[];
  meta: { count: number };
}

export interface Assignee {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  description: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string } | null;
  requester: { id: number; name: string; email: string };
  owner: { id: number; name: string; email: string } | null;
  requestedPriority: RequestedPriority;
  itPriority: RequestedPriority;
  currentStatus: TicketStatus;
  requesterResolutionIndicatedAt: string | null;
  requesterResolutionIndicatedBy: { id: number; name: string } | null;
  publicComments: PublicComment[];
  internalNotes: InternalNote[];
  attachments: AttachmentItem[];
}

export interface StaffClaimResponse {
  data: {
    owner: { id: number; name: string; email: string } | null;
    updatedAt: string;
  };
}

export interface StaffOwnerResponse {
  data: {
    owner: { id: number; name: string; email: string } | null;
    updatedAt: string;
  };
}

export interface StaffPriorityResponse {
  data: {
    requestedPriority: RequestedPriority;
    itPriority: RequestedPriority;
    updatedAt: string;
  };
}

export interface StaffStatusResponse {
  data: {
    previousStatus: TicketStatus;
    currentStatus: TicketStatus;
    requesterResolutionIndicatedAt: string | null;
    requesterResolutionIndicatedBy: { id: number; name: string } | null;
    updatedAt: string;
  };
}

export async function fetchStaffTicketDetail(ticketId: number): Promise<{ data: StaffTicketDetail }> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    return readError(response, "Staff ticket detail could not be loaded.");
  }
  return response.json();
}

export async function fetchAssignees(): Promise<{ data: Assignee[] }> {
  const response = await fetch(`${API_URL}/api/staff/assignees`, {
    credentials: "include",
  });
  if (!response.ok) {
    return readError(response, "Assignees could not be loaded.");
  }
  return response.json();
}

export async function claimStaffTicket(ticketId: number): Promise<StaffClaimResponse> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/claim`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
  });
  if (!response.ok) {
    return readError(response, "Could not claim ticket.");
  }
  return response.json();
}

export async function updateStaffTicketOwner(
  ticketId: number,
  ownerId: number | null,
  expectedUpdatedAt: string
): Promise<StaffOwnerResponse> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/owner`, {
    method: "PATCH",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ ownerId, expectedUpdatedAt }),
  });
  if (!response.ok) {
    return readError(response, "Could not update ticket owner.");
  }
  return response.json();
}

export async function updateStaffTicketPriority(
  ticketId: number,
  itPriority: RequestedPriority,
  expectedUpdatedAt: string
): Promise<StaffPriorityResponse> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/priority`, {
    method: "PATCH",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ itPriority, expectedUpdatedAt }),
  });
  if (!response.ok) {
    return readError(response, "Could not update IT priority.");
  }
  return response.json();
}

export async function updateStaffTicketStatus(
  ticketId: number,
  status: TicketStatus,
  expectedUpdatedAt: string
): Promise<StaffStatusResponse> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ status, expectedUpdatedAt }),
  });
  if (!response.ok) {
    return readError(response, "Could not update ticket status.");
  }
  return response.json();
}

export async function fetchInternalNotes(ticketId: number): Promise<InternalNotesResponse> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/internal-notes`, {
    credentials: "include",
  });
  if (!response.ok) {
    return readError(response, "Internal notes could not be loaded.");
  }
  return response.json();
}

export async function createInternalNote(
  ticketId: number,
  content: string
): Promise<{ data: InternalNote }> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/internal-notes`, {
    method: "POST",
    credentials: "include",
    headers: requestHeaders({ "Content-Type": "application/json" }, true),
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    return readError(response, "Could not add internal note.");
  }
  return response.json();
}


