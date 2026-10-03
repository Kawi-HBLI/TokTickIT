import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, type TicketPriority, type TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireCsrf } from "./auth.js";
import { positiveId } from "./ticket-validation.js";
import {
  isValidStatusTransition,
  clearsResolutionIndication,
  validateInternalNoteContent,
} from "./ticket-workflow.js";

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

// GET /api/staff/tickets/:id
staffQueueRouter.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        requesterResolutionIndicatedBy: { select: { id: true, name: true } },
        publicComments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        internalNotes: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            isRemoved: true,
            removalReason: true,
            removedAt: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    res.status(200).json({
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        summary: ticket.summary,
        description: ticket.description,
        category: ticket.category,
        relatedSystem: ticket.relatedSystem,
        requester: ticket.requester,
        owner: ticket.owner ? { id: ticket.owner.id, name: ticket.owner.name, email: ticket.owner.email } : null,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
        requesterResolutionIndicatedAt: ticket.requesterResolutionIndicatedAt
          ? ticket.requesterResolutionIndicatedAt.toISOString()
          : null,
        requesterResolutionIndicatedBy: ticket.requesterResolutionIndicatedBy
          ? { id: ticket.requesterResolutionIndicatedBy.id, name: ticket.requesterResolutionIndicatedBy.name }
          : null,
        publicComments: ticket.publicComments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          author: c.author,
        })),
        internalNotes: ticket.internalNotes.map((n) => ({
          id: n.id,
          content: n.content,
          createdAt: n.createdAt.toISOString(),
          author: n.author,
        })),
        attachments: ticket.attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt.toISOString(),
          isRemoved: a.isRemoved,
          removalReason: a.removalReason,
          removedAt: a.removedAt ? a.removedAt.toISOString() : null,
        })),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "STAFF_TICKET_DETAIL_FAILED",
        message: "Ticket detail is temporarily unavailable.",
        retryable: true,
      },
    });
  }
});

// POST /api/staff/tickets/:id/claim
staffQueueRouter.post("/tickets/:id/claim", requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, ownerId: true },
    });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    if (ticket.ownerId !== null) {
      res.status(409).json({
        error: {
          code: "TICKET_ALREADY_ASSIGNED",
          message: "This ticket is already assigned to another staff member.",
        },
      });
      return;
    }

    const result = await getPrisma().ticket.updateMany({
      where: { id: ticketId, ownerId: null },
      data: { ownerId: req.auth!.user.id },
    });

    if (result.count === 0) {
      res.status(409).json({
        error: {
          code: "TICKET_ALREADY_ASSIGNED",
          message: "This ticket is already assigned to another staff member.",
        },
      });
      return;
    }

    const updated = await getPrisma().ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    res.status(200).json({
      data: {
        owner: updated.owner ? { id: updated.owner.id, name: updated.owner.name, email: updated.owner.email } : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "TICKET_CLAIM_FAILED",
        message: "We could not claim this ticket right now. Try again.",
        retryable: true,
      },
    });
  }
});

// PATCH /api/staff/tickets/:id/owner
staffQueueRouter.patch("/tickets/:id/owner", requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const { ownerId, expectedUpdatedAt } = req.body || {};
    if (!expectedUpdatedAt || typeof expectedUpdatedAt !== "string" || isNaN(Date.parse(expectedUpdatedAt))) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid expectedUpdatedAt is required." } });
      return;
    }

    if (ownerId !== null && (typeof ownerId !== "number" || !Number.isSafeInteger(ownerId) || ownerId <= 0)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid ownerId is required." } });
      return;
    }

    if (ownerId !== null) {
      const assignee = await getPrisma().user.findUnique({ where: { id: ownerId } });
      if (!assignee || !assignee.isActive || (assignee.role !== "IT_STAFF" && assignee.role !== "ADMINISTRATOR")) {
        res.status(409).json({
          error: {
            code: "ASSIGNEE_NOT_ELIGIBLE",
            message: "The selected user cannot be assigned as ticket owner.",
          },
        });
        return;
      }
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, updatedAt: true },
    });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const expectedDate = new Date(expectedUpdatedAt);
    if (ticket.updatedAt.toISOString() !== expectedDate.toISOString()) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updateResult = await getPrisma().ticket.updateMany({
      where: { id: ticketId, updatedAt: expectedDate },
      data: { ownerId },
    });

    if (updateResult.count === 0) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updated = await getPrisma().ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    res.status(200).json({
      data: {
        owner: updated.owner ? { id: updated.owner.id, name: updated.owner.name, email: updated.owner.email } : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "TICKET_OWNER_UPDATE_FAILED",
        message: "We could not update the ticket owner right now. Try again.",
        retryable: true,
      },
    });
  }
});

// PATCH /api/staff/tickets/:id/priority
staffQueueRouter.patch("/tickets/:id/priority", requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    if (req.body?.requestedPriority !== undefined) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Requested Priority cannot be changed." } });
      return;
    }

    const { itPriority, expectedUpdatedAt } = req.body || {};
    if (!expectedUpdatedAt || typeof expectedUpdatedAt !== "string" || isNaN(Date.parse(expectedUpdatedAt))) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid expectedUpdatedAt is required." } });
      return;
    }

    if (!itPriority || typeof itPriority !== "string" || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(itPriority)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Choose Low, Medium, High, or Critical." } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, updatedAt: true, requestedPriority: true },
    });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const expectedDate = new Date(expectedUpdatedAt);
    if (ticket.updatedAt.toISOString() !== expectedDate.toISOString()) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updateResult = await getPrisma().ticket.updateMany({
      where: { id: ticketId, updatedAt: expectedDate },
      data: { itPriority: itPriority as TicketPriority },
    });

    if (updateResult.count === 0) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updated = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } });
    res.status(200).json({
      data: {
        requestedPriority: updated.requestedPriority,
        itPriority: updated.itPriority,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "IT_PRIORITY_UPDATE_FAILED",
        message: "We could not update the IT priority right now. Try again.",
        retryable: true,
      },
    });
  }
});

// PATCH /api/staff/tickets/:id/status
staffQueueRouter.patch("/tickets/:id/status", requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const { status, expectedUpdatedAt } = req.body || {};
    if (!expectedUpdatedAt || typeof expectedUpdatedAt !== "string" || isNaN(Date.parse(expectedUpdatedAt))) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid expectedUpdatedAt is required." } });
      return;
    }

    if (!status || typeof status !== "string" || !VALID_STATUSES.includes(status as TicketStatus)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Choose a valid ticket status." } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, currentStatus: true, updatedAt: true },
    });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const targetStatus = status as TicketStatus;
    if (!isValidStatusTransition(ticket.currentStatus, targetStatus)) {
      res.status(409).json({
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: "This status transition is not permitted.",
        },
      });
      return;
    }

    const expectedDate = new Date(expectedUpdatedAt);
    if (ticket.updatedAt.toISOString() !== expectedDate.toISOString()) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updateResult = await getPrisma().ticket.updateMany({
      where: { id: ticketId, updatedAt: expectedDate },
      data: clearsResolutionIndication(targetStatus)
        ? { currentStatus: targetStatus, requesterResolutionIndicatedAt: null, requesterResolutionIndicatedById: null }
        : { currentStatus: targetStatus },
    });

    if (updateResult.count === 0) {
      res.status(409).json({
        error: {
          code: "TICKET_VERSION_CONFLICT",
          message: "This ticket was modified by another operation. Refresh and try again.",
        },
      });
      return;
    }

    const updated = await getPrisma().ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { requesterResolutionIndicatedBy: { select: { id: true, name: true } } },
    });

    res.status(200).json({
      data: {
        previousStatus: ticket.currentStatus,
        currentStatus: updated.currentStatus,
        requesterResolutionIndicatedAt: updated.requesterResolutionIndicatedAt
          ? updated.requesterResolutionIndicatedAt.toISOString()
          : null,
        requesterResolutionIndicatedBy: updated.requesterResolutionIndicatedBy
          ? { id: updated.requesterResolutionIndicatedBy.id, name: updated.requesterResolutionIndicatedBy.name }
          : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "TICKET_STATUS_UPDATE_FAILED",
        message: "We could not update the ticket status right now. Try again.",
        retryable: true,
      },
    });
  }
});

// GET /api/staff/tickets/:id/internal-notes
staffQueueRouter.get("/tickets/:id/internal-notes", async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    res.status(200).json({
      data: notes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        author: n.author,
      })),
      meta: { count: notes.length },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "INTERNAL_NOTES_FETCH_FAILED",
        message: "Internal notes are temporarily unavailable.",
        retryable: true,
      },
    });
  }
});

// POST /api/staff/tickets/:id/internal-notes
staffQueueRouter.post("/tickets/:id/internal-notes", requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.id);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    let content: string;
    try {
      content = validateInternalNoteContent(req.body?.content);
    } catch (err) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err instanceof Error ? err.message : "Invalid internal note.",
          fields: [{ field: "content", message: err instanceof Error ? err.message : "Invalid internal note." }],
        },
      });
      return;
    }

    const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!ticket) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const note = await getPrisma().internalNote.create({
      data: {
        ticketId,
        authorId: req.auth!.user.id,
        content,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    res.setHeader("Location", `/api/staff/tickets/${ticketId}/internal-notes/${note.id}`);
    res.status(201).json({
      data: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        author: note.author,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "INTERNAL_NOTE_CREATE_FAILED",
        message: "We could not add the internal note right now. Try again.",
        retryable: true,
      },
    });
  }
});
