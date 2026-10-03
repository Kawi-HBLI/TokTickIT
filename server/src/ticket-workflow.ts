import type { TicketPriority, TicketStatus } from "@prisma/client";

export const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

export const STATUS_TRANSITIONS_REQUIRING_CONFIRMATION: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["CANCELLED"],
  OPEN: ["RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

export function isValidStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function clearsResolutionIndication(to: TicketStatus): boolean {
  return to === "RESOLVED" || to === "CLOSED" || to === "CANCELLED" || to === "REOPENED";
}

export function validatePriority(raw: unknown): TicketPriority {
  if (typeof raw !== "string" || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(raw)) {
    throw new Error("Choose Low, Medium, High, or Critical.");
  }
  return raw as TicketPriority;
}

export function validatePublicCommentContent(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Comment must be text.");
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    throw new Error("Comment must contain 1 to 2,000 characters.");
  }
  return trimmed;
}

export function validateInternalNoteContent(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Internal note must be text.");
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 4000) {
    throw new Error("Internal note must contain 1 to 4,000 characters.");
  }
  return trimmed;
}
