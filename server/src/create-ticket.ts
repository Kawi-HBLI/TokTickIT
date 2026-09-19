import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { Prisma, type TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireRequester, requireRequesterWrite } from "./requester-context.js";
import { requireAuth, requireCsrf } from "./auth.js";
import { TicketError, validateTicket, positiveId } from "./ticket-validation.js";
import { validateTicketQuery } from "./ticket-query.js";
import { attachmentStorage, MAX_FILE_BYTES, validateFiles } from "./attachment-storage.js";

const upload = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 5, fields: 5, fieldSize: 8192, parts: 11 } });
const ticketSelect = {
  id: true, ticketNumber: true, requesterId: true, categoryId: true, relatedSystemId: true,
  summary: true, description: true, requestedPriority: true, itPriority: true,
  currentStatus: true, ticketOwner: true, createdAt: true, updatedAt: true,
  requester: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  attachments: { orderBy: { id: "asc" as const }, select: {
    id: true, originalName: true, mimeType: true, sizeBytes: true, isRemoved: true, createdAt: true,
  } },
} satisfies Prisma.TicketSelect;

export const createTicketRouter = Router();

createTicketRouter.get("/", requireRequester, async (req, res, next) => {
  try {
    const query = validateTicketQuery(req.query as Record<string, unknown>);
    const requesterId = req.requester!.id;

    if (query.categoryId !== null) {
      const activeCategory = await getPrisma().category.findFirst({
        where: { id: query.categoryId, isActive: true },
      });
      if (!activeCategory) {
        throw new TicketError(400, "INVALID_QUERY", "Some query parameters are invalid.", [
          { field: "categoryId", message: "Category does not exist or is inactive." },
        ]);
      }
    }

    const where: Prisma.TicketWhereInput = {
      requesterId,
      ...(query.categoryId !== null ? { categoryId: query.categoryId } : {}),
      ...(query.requestedPriority !== null ? { requestedPriority: query.requestedPriority } : {}),
      ...(query.search
        ? {
            OR: [
              { ticketNumber: { contains: query.search, mode: "insensitive" } },
              { summary: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const totalItems = await getPrisma().ticket.count({ where });
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const skip = (query.page - 1) * query.pageSize;
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortOrder },
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
              summary: true,
              requestedPriority: true,
              currentStatus: true,
              createdAt: true,
              updatedAt: true,
              category: { select: { id: true, name: true } },
              relatedSystem: { select: { id: true, name: true } },
              _count: {
                select: {
                  attachments: {
                    where: { isRemoved: false },
                  },
                },
              },
            },
          })
        : [];

    const data = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      requestedPriority: t.requestedPriority,
      currentStatus: t.currentStatus,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      category: t.category,
      relatedSystem: t.relatedSystem,
      activeAttachmentCount: t._count.attachments,
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
        search: query.search,
        categoryId: query.categoryId,
        requestedPriority: query.requestedPriority,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    });
  } catch (error) {
    next(error);
  }
});
createTicketRouter.post("/", requireRequesterWrite, (req, _res, next) => {
  const key = req.header("Idempotency-Key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    return next(new TicketError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid UUID Idempotency-Key is required."));
  if (!req.is("multipart/form-data"))
    return next(new TicketError(400, "VALIDATION_ERROR", "Send the form as multipart/form-data."));
  next();
}, (req, res, next) => {
  upload.array("attachments", 5)(req, res, error => {
    // Busboy reports malformed multipart framing as plain Error, not MulterError.
    if (error && !(error instanceof multer.MulterError) &&
        /^(Multipart:|Unexpected end of (form|file)|Malformed part header)/.test(error.message)) {
      return next(new TicketError(400, "VALIDATION_ERROR", "Invalid multipart form. Please submit the form again."));
    }
    next(error);
  });
}, async (req, res, next) => {
  const createdFiles: string[] = [];
  try {
    const payload = validateTicket(req.body ?? {});
    const files = validateFiles((req.files ?? []) as Express.Multer.File[]);
    const requesterId = req.requester!.id;
    const key = req.header("Idempotency-Key")!.toLowerCase();
    const fingerprint = createHash("sha256").update(JSON.stringify({ ...payload,
      files: files.map(({ originalName, digest, file }) => ({ originalName, digest, type: file.mimetype, size: file.size }))
    })).digest("hex");
    const result = await getPrisma().$transaction(async tx => {
      // A database lock serializes retries across server processes, not only this instance.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(requesterId)}), hashtext(${key}))`;
      const existing = await tx.ticket.findUnique({ where: { requesterId_idempotencyKey: { requesterId, idempotencyKey: key } } });
      if (existing) {
        if (existing.creationFingerprint !== fingerprint || !existing.creationResponse)
          throw new TicketError(409, "IDEMPOTENCY_KEY_CONFLICT", "This submission key was already used for different values.");
        return { replay: true, body: existing.creationResponse };
      }
      const fields = [];
      if (!await tx.category.findFirst({ where: { id: payload.categoryId, isActive: true } }))
        fields.push({ field: "categoryId", message: "Choose an active Category." });
      if (!await tx.relatedSystem.findFirst({ where: { id: payload.relatedSystemId, isActive: true } }))
        fields.push({ field: "relatedSystemId", message: "Choose an active Related System." });
      if (fields.length) throw new TicketError(400, "VALIDATION_ERROR", "Some values are invalid.", fields);
      const ticket = await tx.ticket.create({
        data: {
          ...payload,
          requesterId,
          idempotencyKey: key,
          creationFingerprint: fingerprint,
          itPriority: payload.requestedPriority,
        },
      });
      const warnings: { code: string; filename: string; message: string }[] = [];
      for (const { file, originalName, extension } of files) {
        const storedName = `${randomUUID()}${extension}`;
        createdFiles.push(storedName);
        // Keep a metadata failure from aborting the valid Ticket and earlier attachments.
        await tx.$executeRawUnsafe("SAVEPOINT attachment_write");
        try {
          await attachmentStorage.write(storedName, file.buffer);
          await tx.attachment.create({ data: { ticketId: ticket.id, originalName, storedName,
            mimeType: file.mimetype, sizeBytes: file.size } });
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attachment_write");
          await attachmentStorage.remove(storedName);
          warnings.push({ code: "ATTACHMENT_STORAGE_FAILED", filename: originalName,
            message: "The ticket was created, but this file could not be stored. Add it again from Ticket Detail." });
          console.error("Attachment storage failed", error);
        }
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT attachment_write");
      }
      const data = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: ticketSelect });
      const body = JSON.parse(JSON.stringify({ data: { ...data, ticketDate: data.createdAt }, warnings })) as Prisma.InputJsonObject;
      await tx.ticket.update({ where: { id: ticket.id }, data: { creationResponse: body, updatedAt: data.updatedAt } });
      return { replay: false, body };
    }, { maxWait: 30_000, timeout: 30_000 });
    if (result.replay) res.set("Idempotency-Replayed", "true");
    res.status(result.replay ? 200 : 201).json(result.body);
  } catch (error) {
    // Only remove this request's generated names, never an upload directory.
    await Promise.all(createdFiles.map(name => attachmentStorage.remove(name).catch(cleanupError => console.error("Upload cleanup failed", cleanupError))));
    next(error);
  }
});

// GET /api/tickets/:ticketId/attachments
createTicketRouter.get("/:ticketId/attachments", requireRequester, async (req, res, next) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
    }

    const ticket = await getPrisma().ticket.findFirst({
      where: { id: ticketId, requesterId: req.requester!.id },
      select: { id: true },
    });

    if (!ticket) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    const attachments = await getPrisma().attachment.findMany({
      where: { ticketId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        isRemoved: true,
        createdAt: true,
        removedAt: true,
        removalReason: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const activeCount = attachments.filter((a) => !a.isRemoved).length;

    res.status(200).json({
      data: attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        isRemoved: a.isRemoved,
        createdAt: a.createdAt.toISOString(),
        removedAt: a.removedAt ? a.removedAt.toISOString() : null,
        removalReason: a.removalReason,
      })),
      activeCount,
      activeLimit: 5,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tickets/:ticketId/attachments
createTicketRouter.post(
  "/:ticketId/attachments",
  requireRequesterWrite,
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (error) => {
      if (
        error &&
        !(error instanceof multer.MulterError) &&
        /^(Multipart:|Unexpected end of (form|file)|Malformed part header)/.test(error.message)
      ) {
        return next(new TicketError(400, "VALIDATION_ERROR", "Invalid multipart form. Please submit the form again."));
      }
      next(error);
    });
  },
  async (req, res, next) => {
    const createdFiles: string[] = [];
    try {
      const ticketId = positiveId(req.params.ticketId);
      if (!ticketId) {
        throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
      }

      const ticket = await getPrisma().ticket.findFirst({
        where: { id: ticketId, requesterId: req.requester!.id },
        select: { id: true },
      });

      if (!ticket) {
        throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
      }

      const rawFiles = (req.files ?? []) as Express.Multer.File[];
      if (!rawFiles || rawFiles.length === 0) {
        throw new TicketError(400, "VALIDATION_ERROR", "Select at least one file.", [
          { field: "attachments", message: "Select at least one file." },
        ]);
      }

      const validated = validateFiles(rawFiles, 5);

      const result = await getPrisma().$transaction(
        async (tx) => {
          // Lock to serialize concurrent uploads to this ticket
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ticket_attachments'), hashtext(${String(ticketId)}))`;

          const currentActiveCount = await tx.attachment.count({
            where: { ticketId, isRemoved: false },
          });

          if (currentActiveCount + validated.length > 5) {
            throw new TicketError(
              409,
              "ATTACHMENT_LIMIT_REACHED",
              "Cannot exceed five active attachments per ticket.",
              [{ field: "attachments", message: "Cannot exceed five active attachments per ticket." }]
            );
          }

          const newlyCreated = [];
          for (const { file, originalName, extension } of validated) {
            const storedName = `${randomUUID()}${extension}`;
            createdFiles.push(storedName);
            await attachmentStorage.write(storedName, file.buffer);
            const record = await tx.attachment.create({
              data: {
                ticketId,
                originalName,
                storedName,
                mimeType: file.mimetype,
                sizeBytes: file.size,
              },
            });
            newlyCreated.push({
              id: record.id,
              originalName: record.originalName,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
              isRemoved: record.isRemoved,
              createdAt: record.createdAt.toISOString(),
            });
          }

          return {
            data: newlyCreated,
            activeCount: currentActiveCount + newlyCreated.length,
            activeLimit: 5,
          };
        },
        { maxWait: 30_000, timeout: 30_000 }
      );

      res.status(201).json(result);
    } catch (error) {
      await Promise.all(
        createdFiles.map((name) =>
          attachmentStorage.remove(name).catch((cleanupError) =>
            console.error("Attachment upload cleanup failed", cleanupError)
          )
        )
      );
      next(error);
    }
  }
);

// GET /api/tickets/:ticketId
createTicketRouter.get("/:ticketId", requireRequester, async (req, res, next) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
    }

    const ticket = await getPrisma().ticket.findFirst({
      where: { id: ticketId, requesterId: req.requester!.id },
      select: {
        id: true,
        ticketNumber: true,
        requesterId: true,
        categoryId: true,
        relatedSystemId: true,
        summary: true,
        description: true,
        requestedPriority: true,
        itPriority: true,
        currentStatus: true,
        ticketOwner: true,
        requesterResolutionIndicatedAt: true,
        createdAt: true,
        updatedAt: true,
        requester: {
          select: { id: true, name: true, email: true, department: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
        requesterResolutionIndicatedBy: {
          select: { id: true, name: true },
        },
        category: {
          select: { id: true, name: true },
        },
        relatedSystem: {
          select: { id: true, name: true },
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            isRemoved: true,
            createdAt: true,
            removedAt: true,
            removalReason: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!ticket) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    res.status(200).json({
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketDate: ticket.createdAt.toISOString(),
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
        ticketOwner: ticket.owner ? ticket.owner.name : ticket.ticketOwner,
        requesterResolutionIndicatedAt: ticket.requesterResolutionIndicatedAt
          ? ticket.requesterResolutionIndicatedAt.toISOString()
          : null,
        requesterResolutionIndicatedBy: ticket.requesterResolutionIndicatedBy
          ? {
              id: ticket.requesterResolutionIndicatedBy.id,
              name: ticket.requesterResolutionIndicatedBy.name,
            }
          : null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        requester: ticket.requester,
        category: ticket.category,
        relatedSystem: ticket.relatedSystem,
        attachments: ticket.attachments.map((att) => ({
          id: att.id,
          originalName: att.originalName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          isRemoved: att.isRemoved,
          createdAt: att.createdAt.toISOString(),
          removedAt: att.removedAt ? att.removedAt.toISOString() : null,
          removalReason: att.removalReason,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tickets/:ticketId/public-comments
createTicketRouter.get("/:ticketId/public-comments", requireAuth, async (req, res, next) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
    }

    const user = req.auth!.user;
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });

    if (!ticket) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    if (user.role === "REQUESTER" && ticket.requesterId !== user.id) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    const comments = await getPrisma().publicComment.findMany({
      where: { ticketId },
      select: {
        id: true,
        ticketId: true,
        content: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    res.status(200).json({
      data: comments.map((c) => ({
        id: c.id,
        ticketId: c.ticketId,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        author: c.author,
      })),
      meta: { count: comments.length },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tickets/:ticketId/public-comments
createTicketRouter.post("/:ticketId/public-comments", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
    }

    const user = req.auth!.user;
    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });

    if (!ticket) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    if (user.role === "REQUESTER" && ticket.requesterId !== user.id) {
      throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
    }

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length < 1 || content.length > 2000) {
      throw new TicketError(400, "VALIDATION_ERROR", "Comment must contain 1-2,000 characters.", [
        { field: "content", message: "Comment must contain 1-2,000 characters." },
      ]);
    }

    const created = await getPrisma().publicComment.create({
      data: {
        ticketId,
        authorId: user.id,
        content,
      },
      select: {
        id: true,
        ticketId: true,
        content: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    res.location(`/api/tickets/${ticketId}/public-comments/${created.id}`);
    res.status(201).json({
      data: {
        id: created.id,
        ticketId: created.ticketId,
        content: created.content,
        createdAt: created.createdAt.toISOString(),
        author: created.author,
      },
    });
  } catch (error) {
    next(error);
  }
});

const ELIGIBLE_RESOLUTION_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
];

// POST /api/tickets/:ticketId/resolution-indication
createTicketRouter.post(
  "/:ticketId/resolution-indication",
  requireRequesterWrite,
  async (req, res, next) => {
    try {
      const ticketId = positiveId(req.params.ticketId);
      if (!ticketId) {
        throw new TicketError(400, "VALIDATION_ERROR", "Invalid ticket ID.");
      }

      const requesterId = req.requester!.id;
      const ticket = await getPrisma().ticket.findFirst({
        where: { id: ticketId, requesterId },
        include: {
          requesterResolutionIndicatedBy: { select: { id: true, name: true } },
        },
      });

      if (!ticket) {
        throw new TicketError(404, "TICKET_NOT_FOUND", "Ticket not found.");
      }

      if (!ELIGIBLE_RESOLUTION_STATUSES.includes(ticket.currentStatus)) {
        throw new TicketError(
          409,
          "RESOLUTION_INDICATION_NOT_ALLOWED",
          "Problem appears resolved is only available for active tickets."
        );
      }

      const expectedUpdatedAtRaw = req.body?.expectedUpdatedAt;
      if (!expectedUpdatedAtRaw || typeof expectedUpdatedAtRaw !== "string") {
        throw new TicketError(400, "VALIDATION_ERROR", "expectedUpdatedAt is required.", [
          { field: "expectedUpdatedAt", message: "expectedUpdatedAt timestamp is required." },
        ]);
      }

      const expectedDate = new Date(expectedUpdatedAtRaw);
      if (
        isNaN(expectedDate.getTime()) ||
        Math.abs(expectedDate.getTime() - ticket.updatedAt.getTime()) > 1000
      ) {
        throw new TicketError(
          409,
          "TICKET_VERSION_CONFLICT",
          "The ticket was modified by another user. Please refresh and try again."
        );
      }

      // Idempotent return if already indicated with matching version
      if (ticket.requesterResolutionIndicatedAt) {
        res.status(200).json({
          data: {
            indicatedAt: ticket.requesterResolutionIndicatedAt.toISOString(),
            indicatedBy: {
              id: ticket.requesterResolutionIndicatedBy?.id ?? req.requester!.id,
              name: ticket.requesterResolutionIndicatedBy?.name ?? req.requester!.name,
            },
            currentStatus: ticket.currentStatus,
          },
        });
        return;
      }

      const updated = await getPrisma().ticket.update({
        where: { id: ticket.id },
        data: {
          requesterResolutionIndicatedAt: new Date(),
          requesterResolutionIndicatedById: requesterId,
        },
        include: {
          requesterResolutionIndicatedBy: { select: { id: true, name: true } },
        },
      });

      res.status(200).json({
        data: {
          indicatedAt: updated.requesterResolutionIndicatedAt!.toISOString(),
          indicatedBy: {
            id: updated.requesterResolutionIndicatedBy!.id,
            name: updated.requesterResolutionIndicatedBy!.name,
          },
          currentStatus: updated.currentStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "ATTACHMENT_TOO_LARGE" : "VALIDATION_ERROR",
        message: tooLarge
          ? "A file exceeds 5 MiB."
          : "Invalid multipart form or too many fields/files.",
        fields: [
          {
            field: "attachments",
            message: "Use at most five files, each no larger than 5 MiB.",
          },
        ],
        retryable: false,
      },
    });
  } else if (error instanceof TicketError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        retryable: false,
      },
    });
  } else {
    console.error("Ticket operation failed", error);
    if (req.method === "GET") {
      if (req.path.includes("/attachments")) {
        res.status(500).json({
          error: {
            code: "ATTACHMENT_LIST_FAILED",
            message: "Attachments are temporarily unavailable. Please try again.",
            retryable: true,
          },
        });
      } else if (req.path.includes("/public-comments")) {
        res.status(500).json({
          error: {
            code: "PUBLIC_COMMENTS_FAILED",
            message: "Public comments are temporarily unavailable. Please try again.",
            retryable: true,
          },
        });
      } else if (req.path === "/" || req.path === "") {
        res.status(500).json({
          error: {
            code: "TICKET_LIST_FAILED",
            message: "Tickets are temporarily unavailable. Please try again.",
            retryable: true,
          },
        });
      } else {
        res.status(500).json({
          error: {
            code: "TICKET_DETAIL_FAILED",
            message: "Ticket detail is temporarily unavailable. Please try again.",
            retryable: true,
          },
        });
      }
    } else if (req.method === "POST" && req.path.includes("/attachments")) {
      res.status(500).json({
        error: {
          code: "ATTACHMENT_UPLOAD_FAILED",
          message: "Failed to upload attachments. Please retry.",
          retryable: true,
        },
      });
    } else if (req.method === "POST" && req.path.includes("/public-comments")) {
      res.status(500).json({
        error: {
          code: "PUBLIC_COMMENT_CREATE_FAILED",
          message: "The public comment could not be created. Please retry.",
          retryable: true,
        },
      });
    } else if (req.method === "POST" && req.path.includes("/resolution-indication")) {
      res.status(500).json({
        error: {
          code: "RESOLUTION_INDICATION_FAILED",
          message: "Failed to record resolution indication. Please retry.",
          retryable: true,
        },
      });
    } else {
      res.status(500).json({
        error: {
          code: "TICKET_CREATE_FAILED",
          message: "The ticket could not be created. Please retry the same submission.",
          retryable: true,
        },
      });
    }
  }
};
createTicketRouter.use(errorHandler);
