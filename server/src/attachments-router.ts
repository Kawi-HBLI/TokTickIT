import { Router, ErrorRequestHandler } from "express";
import { createReadStream } from "node:fs";
import { getPrisma } from "./prisma.js";
import { requireRequester } from "./requester-context.js";
import { TicketError, positiveId } from "./ticket-validation.js";
import { attachmentStorage, contentDispositionHeader, safeFilename } from "./attachment-storage.js";

export const attachmentsRouter = Router();

// GET /api/attachments/:id/preview
attachmentsRouter.get("/:id/preview", requireRequester, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid attachment ID.");
    }

    const attachment = await getPrisma().attachment.findUnique({
      where: { id },
      include: { ticket: { select: { requesterId: true } } },
    });

    if (!attachment || attachment.ticket.requesterId !== req.requester!.id) {
      throw new TicketError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
    }

    if (attachment.isRemoved) {
      throw new TicketError(410, "ATTACHMENT_REMOVED", "This attachment has been removed.");
    }

    const exists = await attachmentStorage.exists(attachment.storedName);
    if (!exists) {
      throw new TicketError(500, "ATTACHMENT_CONTENT_UNAVAILABLE", "Attachment content is temporarily unavailable.");
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", contentDispositionHeader("inline", attachment.originalName));
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = createReadStream(attachmentStorage.getPath(attachment.storedName));
    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// GET /api/attachments/:id/download
attachmentsRouter.get("/:id/download", requireRequester, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid attachment ID.");
    }

    const attachment = await getPrisma().attachment.findUnique({
      where: { id },
      include: { ticket: { select: { requesterId: true } } },
    });

    if (!attachment || attachment.ticket.requesterId !== req.requester!.id) {
      throw new TicketError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
    }

    if (attachment.isRemoved) {
      throw new TicketError(410, "ATTACHMENT_REMOVED", "This attachment has been removed.");
    }

    const exists = await attachmentStorage.exists(attachment.storedName);
    if (!exists) {
      throw new TicketError(500, "ATTACHMENT_CONTENT_UNAVAILABLE", "Attachment content is temporarily unavailable.");
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", attachment.originalName));
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = createReadStream(attachmentStorage.getPath(attachment.storedName));
    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/attachments/:id
attachmentsRouter.delete("/:id", requireRequester, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) {
      throw new TicketError(400, "VALIDATION_ERROR", "Invalid attachment ID.");
    }

    const rawReason = req.body?.reason;
    const reason = typeof rawReason === "string" ? rawReason.trim() : "";

    if (!reason || reason.length < 5 || reason.length > 200) {
      throw new TicketError(
        400,
        "VALIDATION_ERROR",
        "Removal reason must be between 5 and 200 characters.",
        [{ field: "reason", message: "Removal reason must be between 5 and 200 characters." }]
      );
    }

    const db = getPrisma();
    // Atomic update: only updates if isRemoved is false and requester owns the ticket
    const updateResult = await db.attachment.updateMany({
      where: {
        id,
        isRemoved: false,
        ticket: { requesterId: req.requester!.id },
      },
      data: {
        isRemoved: true,
        removalReason: reason,
        removedAt: new Date(),
        removedByRequesterId: req.requester!.id,
      },
    });

    if (updateResult.count === 0) {
      const existing = await db.attachment.findUnique({
        where: { id },
        include: { ticket: { select: { requesterId: true } } },
      });

      if (!existing || existing.ticket.requesterId !== req.requester!.id) {
        throw new TicketError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
      }

      if (existing.isRemoved) {
        throw new TicketError(409, "ATTACHMENT_ALREADY_REMOVED", "Attachment has already been removed.");
      }

      throw new TicketError(500, "ATTACHMENT_REMOVAL_FAILED", "Failed to remove attachment.");
    }

    const updated = await db.attachment.findUniqueOrThrow({
      where: { id },
    });

    res.status(200).json({
      data: {
        id: updated.id,
        originalName: updated.originalName,
        mimeType: updated.mimeType,
        sizeBytes: updated.sizeBytes,
        isRemoved: true,
        createdAt: updated.createdAt.toISOString(),
        removedAt: updated.removedAt!.toISOString(),
        removalReason: updated.removalReason,
      },
    });
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof TicketError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        retryable: false,
      },
    });
  } else {
    console.error("Attachment operation failed", error);
    if (req.method === "DELETE") {
      res.status(500).json({
        error: {
          code: "ATTACHMENT_REMOVE_FAILED",
          message: "Could not remove attachment. Please try again.",
          retryable: true,
        },
      });
    } else {
      res.status(500).json({
        error: {
          code: "ATTACHMENT_CONTENT_UNAVAILABLE",
          message: "Attachment content is temporarily unavailable. Please try again.",
          retryable: true,
        },
      });
    }
  }
};

attachmentsRouter.use(errorHandler);
