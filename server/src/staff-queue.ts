import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, type TicketPriority, type TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireAuth } from "./auth.js";

export class StaffQueueError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: { field: string; message: string }[] = [],
    public readonly retryable = false
  ) {
    super(message);
  }
}

export type StaffSortByField = "updatedAt" | "createdAt" | "requestedPriority" | "itPriority" | "status";
export type StaffSortDirection = "asc" | "desc";
export const STAFF_PAGE_SIZES = [10, 20, 50] as const;

export type OwnerFilter =
  | { type: "unassigned" }
  | { type: "me"; userId?: number }
  | { type: "user"; userId: number };

export interface NormalizedStaffQueueQuery {
  q: string;
  status: TicketStatus | null;
  requestedPriority: TicketPriority | null;
  itPriority: TicketPriority | null;
  categoryId: number | null;
  owner: OwnerFilter | null;
  sortBy: StaffSortByField;
  sortDirection: StaffSortDirection;
  page: number;
  pageSize: (typeof STAFF_PAGE_SIZES)[number];
}

const VALID_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

const VALID_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const VALID_SORT_FIELDS: StaffSortByField[] = [
  "updatedAt",
  "createdAt",
  "requestedPriority",
  "itPriority",
  "status",
];

export function validateStaffQueueQuery(
  raw: Record<string, unknown>,
  currentUserId?: number
): NormalizedStaffQueueQuery {
  const fields: { field: string; message: string }[] = [];
  const allowed = [
    "q",
    "status",
    "requestedPriority",
    "itPriority",
    "categoryId",
    "owner",
    "sortBy",
    "sortDirection",
    "page",
    "pageSize",
  ];

  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      fields.push({ field: key, message: "Unexpected query parameter." });
    }
  }

  // q
  let q = "";
  if (raw.q !== undefined && raw.q !== null && raw.q !== "") {
    if (typeof raw.q !== "string") {
      fields.push({ field: "q", message: "Search query must be a string." });
    } else {
      q = raw.q.trim();
    }
  }

  // status
  let status: TicketStatus | null = null;
  if (raw.status !== undefined && raw.status !== null && raw.status !== "") {
    if (typeof raw.status !== "string" || !VALID_STATUSES.includes(raw.status as TicketStatus)) {
      fields.push({ field: "status", message: "Choose a valid ticket status." });
    } else {
      status = raw.status as TicketStatus;
    }
  }

  // requestedPriority
  let requestedPriority: TicketPriority | null = null;
  if (raw.requestedPriority !== undefined && raw.requestedPriority !== null && raw.requestedPriority !== "") {
    if (typeof raw.requestedPriority !== "string" || !VALID_PRIORITIES.includes(raw.requestedPriority as TicketPriority)) {
      fields.push({ field: "requestedPriority", message: "Choose Low, Medium, High, or Critical." });
    } else {
      requestedPriority = raw.requestedPriority as TicketPriority;
    }
  }

  // itPriority
  let itPriority: TicketPriority | null = null;
  if (raw.itPriority !== undefined && raw.itPriority !== null && raw.itPriority !== "") {
    if (typeof raw.itPriority !== "string" || !VALID_PRIORITIES.includes(raw.itPriority as TicketPriority)) {
      fields.push({ field: "itPriority", message: "Choose Low, Medium, High, or Critical." });
    } else {
      itPriority = raw.itPriority as TicketPriority;
    }
  }

  // categoryId
  let categoryId: number | null = null;
  if (raw.categoryId !== undefined && raw.categoryId !== null && raw.categoryId !== "") {
    const num = Number(raw.categoryId);
    if (!Number.isInteger(num) || num <= 0) {
      fields.push({ field: "categoryId", message: "Category ID must be a positive integer." });
    } else {
      categoryId = num;
    }
  }

  // owner
  let owner: OwnerFilter | null = null;
  if (raw.owner !== undefined && raw.owner !== null && raw.owner !== "") {
    if (raw.owner === "unassigned") {
      owner = { type: "unassigned" };
    } else if (raw.owner === "me") {
      owner = { type: "me", userId: currentUserId };
    } else {
      const num = Number(raw.owner);
      if (Number.isInteger(num) && num > 0) {
        owner = { type: "user", userId: num };
      } else {
        fields.push({ field: "owner", message: "Owner must be unassigned, me, or a valid user ID." });
      }
    }
  }

  // sortBy
  let sortBy: StaffSortByField = "updatedAt";
  if (raw.sortBy !== undefined && raw.sortBy !== null && raw.sortBy !== "") {
    if (typeof raw.sortBy !== "string" || !VALID_SORT_FIELDS.includes(raw.sortBy as StaffSortByField)) {
      fields.push({ field: "sortBy", message: "Sort field must be updatedAt, createdAt, requestedPriority, itPriority, or status." });
    } else {
      sortBy = raw.sortBy as StaffSortByField;
    }
  }

  // sortDirection
  let sortDirection: StaffSortDirection = "desc";
  if (raw.sortDirection !== undefined && raw.sortDirection !== null && raw.sortDirection !== "") {
    if (raw.sortDirection !== "asc" && raw.sortDirection !== "desc") {
      fields.push({ field: "sortDirection", message: "Sort direction must be desc or asc." });
    } else {
      sortDirection = raw.sortDirection as StaffSortDirection;
    }
  }

  // page
  let page = 1;
  if (raw.page !== undefined && raw.page !== null && raw.page !== "") {
    const num = Number(raw.page);
    if (!Number.isInteger(num) || num < 1) {
      fields.push({ field: "page", message: "Page must be a positive integer starting at 1." });
    } else {
      page = num;
    }
  }

  // pageSize
  let pageSize: (typeof STAFF_PAGE_SIZES)[number] = 20;
  if (raw.pageSize !== undefined && raw.pageSize !== null && raw.pageSize !== "") {
    const num = Number(raw.pageSize);
    if (!STAFF_PAGE_SIZES.includes(num as never)) {
      fields.push({ field: "pageSize", message: "Page size must be 10, 20, or 50." });
    } else {
      pageSize = num as (typeof STAFF_PAGE_SIZES)[number];
    }
  }

  if (fields.length > 0) {
    throw new StaffQueueError(400, "INVALID_QUERY", "Some query parameters are invalid.", fields);
  }

  return {
    q,
    status,
    requestedPriority,
    itPriority,
    categoryId,
    owner,
    sortBy,
    sortDirection,
    page,
    pageSize,
  };
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const role = req.auth?.user.role;
    if (role !== "IT_STAFF" && role !== "ADMINISTRATOR") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "This operation is available to IT Staff or Administrator accounts only.",
          retryable: false,
        },
      });
      return;
    }
    next();
  });
}

export const staffQueueRouter = Router();

staffQueueRouter.use(requireStaff);

staffQueueRouter.get("/assignees", async (_req: Request, res: Response) => {
  try {
    const assignees = await getPrisma().user.findMany({
      where: {
        isActive: true,
        role: { in: ["IT_STAFF", "ADMINISTRATOR"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    res.status(200).json({ data: assignees });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "ASSIGNEES_UNAVAILABLE",
        message: "Assignees are temporarily unavailable.",
        retryable: true,
      },
    });
  }
});

staffQueueRouter.get("/tickets", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = validateStaffQueueQuery(req.query as Record<string, unknown>, req.auth?.user.id);

    const where: Prisma.TicketWhereInput = {};

    if (query.status) {
      where.currentStatus = query.status;
    }
    if (query.requestedPriority) {
      where.requestedPriority = query.requestedPriority;
    }
    if (query.itPriority) {
      where.itPriority = query.itPriority;
    }
    if (query.categoryId !== null) {
      where.categoryId = query.categoryId;
    }
    if (query.owner) {
      if (query.owner.type === "unassigned") {
        where.ownerId = null;
      } else if (query.owner.type === "me") {
        where.ownerId = req.auth!.user.id;
      } else if (query.owner.type === "user") {
        where.ownerId = query.owner.userId;
      }
    }
    if (query.q) {
      where.OR = [
        { ticketNumber: { contains: query.q, mode: "insensitive" } },
        { summary: { contains: query.q, mode: "insensitive" } },
        { requester: { name: { contains: query.q, mode: "insensitive" } } },
        { requester: { email: { contains: query.q, mode: "insensitive" } } },
        { category: { name: { contains: query.q, mode: "insensitive" } } },
      ];
    }

    const totalItems = await getPrisma().ticket.count({ where });
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const skip = (query.page - 1) * query.pageSize;

    const prismaSortField = query.sortBy === "status" ? "currentStatus" : query.sortBy;
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
      { [prismaSortField]: query.sortDirection },
      { ticketNumber: "desc" },
    ];

    const tickets =
      totalItems > 0 && skip < totalItems
        ? await getPrisma().ticket.findMany({
            where,
            skip,
            take: query.pageSize,
            orderBy,
            select: {
              id: true,
              ticketNumber: true,
              createdAt: true,
              updatedAt: true,
              summary: true,
              requestedPriority: true,
              itPriority: true,
              currentStatus: true,
              requesterResolutionIndicatedAt: true,
              category: { select: { id: true, name: true } },
              requester: { select: { id: true, name: true, email: true } },
              owner: { select: { id: true, name: true, email: true } },
            },
          })
        : [];

    const data = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      summary: t.summary,
      category: t.category,
      requester: t.requester,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      owner: t.owner ? { id: t.owner.id, name: t.owner.name, email: t.owner.email } : null,
      requesterResolutionIndicatedAt: t.requesterResolutionIndicatedAt
        ? t.requesterResolutionIndicatedAt.toISOString()
        : null,
    }));

    res.status(200).json({
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: query.page > 1,
        hasNextPage: query.page < totalPages,
      },
      query: {
        q: query.q,
        status: query.status,
        requestedPriority: query.requestedPriority,
        itPriority: query.itPriority,
        categoryId: query.categoryId,
        owner: typeof req.query.owner === "string" ? req.query.owner : null,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      },
    });
  } catch (error) {
    if (error instanceof StaffQueueError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
          retryable: error.retryable,
        },
      });
      return;
    }
    console.error(error);
    res.status(500).json({
      error: {
        code: "STAFF_QUEUE_FAILED",
        message: "Ticket queue is temporarily unavailable.",
        retryable: true,
      },
    });
  }
});
