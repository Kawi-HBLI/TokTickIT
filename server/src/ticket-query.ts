import type { TicketPriority } from "@prisma/client";
import { FieldError, TicketError, positiveId } from "./ticket-validation.js";

export type SortByField = "createdAt" | "updatedAt" | "requestedPriority";
export type SortOrder = "asc" | "desc";
export const ALLOWED_PAGE_SIZES = [10, 20, 50] as const;

export interface NormalizedTicketQuery {
  search: string;
  categoryId: number | null;
  requestedPriority: TicketPriority | null;
  sortBy: SortByField;
  sortOrder: SortOrder;
  page: number;
  pageSize: (typeof ALLOWED_PAGE_SIZES)[number];
}

export function validateTicketQuery(raw: Record<string, unknown>): NormalizedTicketQuery {
  const fields: FieldError[] = [];
  const allowed = ["search", "categoryId", "requestedPriority", "sortBy", "sortOrder", "page", "pageSize"];

  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      fields.push({ field: key, message: "Unexpected query parameter." });
    }
  }

  // search
  let search = "";
  if (raw.search !== undefined && raw.search !== null && raw.search !== "") {
    if (typeof raw.search !== "string") {
      fields.push({ field: "search", message: "Search query must be a string." });
    } else {
      search = raw.search.trim();
    }
  }

  // categoryId
  let categoryId: number | null = null;
  if (raw.categoryId !== undefined && raw.categoryId !== null && raw.categoryId !== "") {
    const parsedId = positiveId(raw.categoryId);
    if (parsedId === null) {
      fields.push({ field: "categoryId", message: "Category ID must be a positive integer." });
    } else {
      categoryId = parsedId;
    }
  }

  // requestedPriority
  let requestedPriority: TicketPriority | null = null;
  if (raw.requestedPriority !== undefined && raw.requestedPriority !== null && raw.requestedPriority !== "") {
    if (
      typeof raw.requestedPriority !== "string" ||
      !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(raw.requestedPriority)
    ) {
      fields.push({ field: "requestedPriority", message: "Choose Low, Medium, High, or Critical." });
    } else {
      requestedPriority = raw.requestedPriority as TicketPriority;
    }
  }

  // sortBy
  let sortBy: SortByField = "updatedAt";
  if (raw.sortBy !== undefined && raw.sortBy !== null && raw.sortBy !== "") {
    if (
      typeof raw.sortBy !== "string" ||
      !["createdAt", "updatedAt", "requestedPriority"].includes(raw.sortBy)
    ) {
      fields.push({ field: "sortBy", message: "Sort field must be createdAt, updatedAt, or requestedPriority." });
    } else {
      sortBy = raw.sortBy as SortByField;
    }
  }

  // sortOrder
  let sortOrder: SortOrder = "desc";
  if (raw.sortOrder !== undefined && raw.sortOrder !== null && raw.sortOrder !== "") {
    if (typeof raw.sortOrder !== "string" || !["asc", "desc"].includes(raw.sortOrder)) {
      fields.push({ field: "sortOrder", message: "Sort order must be asc or desc." });
    } else {
      sortOrder = raw.sortOrder as SortOrder;
    }
  }

  // page
  let page = 1;
  if (raw.page !== undefined && raw.page !== null && raw.page !== "") {
    const parsedPage = positiveId(raw.page);
    if (parsedPage === null || parsedPage < 1) {
      fields.push({ field: "page", message: "Page must be a positive integer starting at 1." });
    } else {
      page = parsedPage;
    }
  }

  // pageSize
  let pageSize: (typeof ALLOWED_PAGE_SIZES)[number] = 10;
  if (raw.pageSize !== undefined && raw.pageSize !== null && raw.pageSize !== "") {
    const sizeNum = typeof raw.pageSize === "number" ? raw.pageSize : typeof raw.pageSize === "string" && /^\d+$/.test(raw.pageSize) ? Number(raw.pageSize) : null;
    if (sizeNum === null || !ALLOWED_PAGE_SIZES.includes(sizeNum as any)) {
      fields.push({ field: "pageSize", message: "Page size must be 10, 20, or 50." });
    } else {
      pageSize = sizeNum as (typeof ALLOWED_PAGE_SIZES)[number];
    }
  }

  if (fields.length > 0) {
    throw new TicketError(400, "INVALID_QUERY", "Some query parameters are invalid.", fields);
  }

  return {
    search,
    categoryId,
    requestedPriority,
    sortBy,
    sortOrder,
    page,
    pageSize,
  };
}
