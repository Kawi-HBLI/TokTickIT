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
