import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import type { ActionStatus, ActionEventType, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireCsrf } from "./auth.js";
import { requireStaff } from "./staff-queue.js";
import { positiveId } from "./ticket-validation.js";

export function computeCanonicalFingerprint(payload: {
  assigneeId: number | null;
  attachmentNotes: string | null;
  description: string;
  followUpNote: string | null;
  followUpRequired: boolean;
}): string {
  const canonicalObj = {
    assigneeId: payload.assigneeId,
    attachmentNotes: payload.attachmentNotes,
    description: payload.description,
    followUpNote: payload.followUpNote,
    followUpRequired: payload.followUpRequired,
  };
  return createHash("sha256").update(JSON.stringify(canonicalObj)).digest("hex");
}

export function toActionTakenDto(action: any) {
  return {
    id: action.id,
    ticketId: action.ticketId,
    idempotencyKey: action.idempotencyKey ?? null,
    description: action.description,
    result: action.result ?? null,
    status: action.status,
    assignee: action.assignee
      ? {
          id: action.assignee.id,
          name: action.assignee.name,
          email: action.assignee.email,
          role: action.assignee.role,
        }
      : null,
    createdBy: {
      id: action.createdBy.id,
      name: action.createdBy.name,
      email: action.createdBy.email,
      role: action.createdBy.role,
    },
    completedBy: action.completedBy
      ? {
          id: action.completedBy.id,
          name: action.completedBy.name,
          email: action.completedBy.email,
          role: action.completedBy.role,
        }
      : null,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? null,
    attachmentNotes: action.attachmentNotes ?? null,
    cancellationReason: action.cancellationReason ?? null,
    version: action.version,
    completedAt: action.completedAt ? action.completedAt.toISOString() : null,
    cancelledAt: action.cancelledAt ? action.cancelledAt.toISOString() : null,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

export function toActionTakenHistoryDto(entry: any) {
  const snapshot = (entry.snapshot ?? {}) as Record<string, any>;
  return {
    id: entry.id,
    actionTakenId: entry.actionId,
    ticketId: entry.ticketId,
    eventType: entry.eventType,
    actor: {
      id: entry.actor.id,
      name: entry.actor.name,
      email: entry.actor.email,
      role: entry.actor.role,
    },
    changes: snapshot.changes ?? snapshot,
    versionBefore: snapshot.versionBefore ?? null,
    versionAfter: entry.version,
    createdAt: entry.createdAt.toISOString(),
  };
}

// Router mounted at /api/tickets/:ticketId/actions
export const ticketActionsRouter = Router({ mergeParams: true });

// GET /api/tickets/:ticketId/actions
ticketActionsRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const prisma = getPrisma();
    if (req.auth!.user.role === "REQUESTER") {
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, requesterId: req.auth!.user.id },
        select: { id: true },
      });
      if (!ticket) {
        res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
        return;
      }
    } else {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true },
      });
      if (!ticket) {
        res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
        return;
      }
    }

    const items = await prisma.actionTaken.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } },
        completedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.status(200).json({
      data: {
        ticketId,
        total: items.length,
        items: items.map(toActionTakenDto),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list actions.", retryable: true } });
  }
});

// POST /api/tickets/:ticketId/actions
ticketActionsRouter.post("/", requireStaff, requireCsrf, async (req: Request, res: Response) => {
  try {
    const ticketId = positiveId(req.params.ticketId);
    if (!ticketId) {
      res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.description !== "string") {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Description is required." } });
      return;
    }
    const rawDesc = body.description.trim();
    if (rawDesc.length < 5 || rawDesc.length > 2000) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Description must be between 5 and 2,000 characters." } });
      return;
    }

    let assigneeId: number | null = null;
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      if (typeof body.assigneeId !== "number" || !Number.isInteger(body.assigneeId) || body.assigneeId <= 0) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Assignee ID must be a positive integer." } });
        return;
      }
      assigneeId = body.assigneeId;
    }

    let followUpRequired = false;
    if (body.followUpRequired !== undefined) {
      if (typeof body.followUpRequired !== "boolean") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "followUpRequired must be a boolean." } });
        return;
      }
      followUpRequired = body.followUpRequired;
    }

    let followUpNote: string | null = null;
    if (body.followUpNote !== undefined && body.followUpNote !== null) {
      if (typeof body.followUpNote !== "string") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Follow-up note must be a string." } });
        return;
      }
      const trimmedFollowUp = body.followUpNote.trim();
      if (trimmedFollowUp.length > 1000) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Follow-up note must not exceed 1,000 characters." } });
        return;
      }
      followUpNote = trimmedFollowUp.length > 0 ? trimmedFollowUp : null;
    }

    if (followUpRequired && !followUpNote) {
      res.status(422).json({ error: { code: "FOLLOW_UP_NOTE_REQUIRED", message: "A follow-up note is required when followUpRequired is true." } });
      return;
    }
    if (!followUpRequired) {
      followUpNote = null;
    }

    let attachmentNotes: string | null = null;
    if (body.attachmentNotes !== undefined && body.attachmentNotes !== null) {
      if (typeof body.attachmentNotes !== "string") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Attachment notes must be a string." } });
        return;
      }
      const trimmedAttachment = body.attachmentNotes.trim();
      if (trimmedAttachment.length > 1000) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Attachment notes must not exceed 1,000 characters." } });
        return;
      }
      attachmentNotes = trimmedAttachment.length > 0 ? trimmedAttachment : null;
    }

    let idempotencyKey: string | null = null;
    const headerKey = req.get("Idempotency-Key");
    if (headerKey) {
      idempotencyKey = headerKey.trim();
    } else if (body.idempotencyKey !== undefined && body.idempotencyKey !== null) {
      if (typeof body.idempotencyKey !== "string") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Idempotency key must be a string." } });
        return;
      }
      const trimmedKey = body.idempotencyKey.trim();
      idempotencyKey = trimmedKey.length > 0 ? trimmedKey : null;
    }

    const normalizedPayload = {
      assigneeId,
      attachmentNotes,
      description: rawDesc,
      followUpNote: followUpRequired ? followUpNote : null,
      followUpRequired,
    };
    const incomingFingerprint = computeCanonicalFingerprint(normalizedPayload);

    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock parent ticket row
      const ticketRows = await tx.$queryRaw<Array<{
        id: number;
        currentStatus: TicketStatus;
        ownerId: number | null;
        updatedAt: Date;
      }>>`
        SELECT id, "currentStatus", "ownerId", "updatedAt"
        FROM "Ticket"
        WHERE id = ${ticketId}
        FOR UPDATE
      `;
      const ticketRow = ticketRows[0];
      if (!ticketRow) {
        return { status: 404, body: { error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } } };
      }

      // 2. Evaluate Idempotency Key BEFORE mutable creation gates
      if (idempotencyKey) {
        const existingAction = await tx.actionTaken.findFirst({
          where: { ticketId, idempotencyKey },
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
            createdBy: { select: { id: true, name: true, email: true, role: true } },
            completedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        });
        if (existingAction) {
          if (existingAction.creationFingerprint === incomingFingerprint) {
            const responseData = (existingAction.creationResponse as any) ?? { data: toActionTakenDto(existingAction) };
            return { status: 200, body: responseData, replayed: true };
          } else {
            return {
              status: 409,
              body: {
                error: {
                  code: "IDEMPOTENCY_CONFLICT",
                  message: "The idempotency key was previously used with a different request payload.",
                },
              },
            };
          }
        }
      }

      // 3. Mutable creation gates
      if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticketRow.currentStatus)) {
        return {
          status: 422,
          body: {
            error: {
              code: "TICKET_TERMINAL_IMMUTABLE",
              message: "Actions cannot be created or modified on resolved, closed, or cancelled tickets.",
            },
          },
        };
      }

      if (assigneeId !== null) {
        const assignee = await tx.user.findUnique({
          where: { id: assigneeId },
          select: { id: true, isActive: true, role: true },
        });
        if (!assignee || !assignee.isActive || (assignee.role !== "IT_STAFF" && assignee.role !== "ADMINISTRATOR")) {
          return {
            status: 422,
            body: {
              error: {
                code: "INVALID_ACTION_ASSIGNEE",
                message: "Assignee must be an active IT Staff or Administrator account.",
              },
            },
          };
        }
      }

      // 4. Insert ActionTaken
      const created = await tx.actionTaken.create({
        data: {
          ticketId,
          createdById: req.auth!.user.id,
          assigneeId,
          status: "PENDING",
          description: normalizedPayload.description,
          followUpRequired: normalizedPayload.followUpRequired,
          followUpNote: normalizedPayload.followUpNote,
          attachmentNotes: normalizedPayload.attachmentNotes,
          idempotencyKey,
          creationFingerprint: incomingFingerprint,
          version: 1,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          completedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      const dto = toActionTakenDto(created);
      await tx.actionTaken.update({
        where: { id: created.id },
        data: { creationResponse: { data: dto } },
      });

      // 5. Insert initial ActionTakenHistory record atomically
      await tx.actionTakenHistory.create({
        data: {
          actionId: created.id,
          ticketId,
          actorId: req.auth!.user.id,
          eventType: "CREATED",
          version: 1,
          snapshot: {
            changes: {
              description: { before: null, after: dto.description },
              status: { before: null, after: dto.status },
              assignee: { beforeId: null, afterId: dto.assignee?.id ?? null },
              followUpRequired: { before: null, after: dto.followUpRequired },
              followUpNote: { before: null, after: dto.followUpNote },
              attachmentNotes: { before: null, after: dto.attachmentNotes },
            },
            versionBefore: null,
            versionAfter: 1,
          },
        },
      });

      return { status: 201, body: { data: dto }, location: `/api/actions/${created.id}` };
    });

    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    if (result.location) {
      res.setHeader("Location", result.location);
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create action.", retryable: true } });
  }
});

// Router mounted at /api/actions
export const actionsRouter = Router();

// PATCH /api/actions/:id
actionsRouter.patch("/:id", requireStaff, requireCsrf, async (req: Request, res: Response) => {
  try {
    const actionId = positiveId(req.params.id);
    if (!actionId) {
      res.status(404).json({ error: { code: "ACTION_NOT_FOUND", message: "Action not found." } });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.version !== "number" || !Number.isInteger(body.version)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Version must be an integer." } });
      return;
    }

    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const actionRef = await tx.actionTaken.findUnique({
        where: { id: actionId },
        select: { id: true, ticketId: true },
      });

      if (!actionRef) {
        return { status: 404, body: { error: { code: "ACTION_NOT_FOUND", message: "Action not found." } } };
      }

      // Lock parent ticket
      const ticketRows = await tx.$queryRaw<Array<{
        id: number;
        currentStatus: TicketStatus;
        ownerId: number | null;
        updatedAt: Date;
      }>>`
        SELECT id, "currentStatus", "ownerId", "updatedAt"
        FROM "Ticket"
        WHERE id = ${actionRef.ticketId}
        FOR UPDATE
      `;
      const ticketRow = ticketRows[0];
      if (!ticketRow) {
        return { status: 404, body: { error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } } };
      }

      // Re-read action under lock to see any committed changes from previous transactions
      const existing = await tx.actionTaken.findUnique({
        where: { id: actionId },
        include: {
          assignee: { select: { id: true, name: true, email: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          completedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      if (!existing) {
        return { status: 404, body: { error: { code: "ACTION_NOT_FOUND", message: "Action not found." } } };
      }

      if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticketRow.currentStatus)) {
        return {
          status: 422,
          body: {
            error: {
              code: "TICKET_TERMINAL_IMMUTABLE",
              message: "Actions cannot be created or modified on resolved, closed, or cancelled tickets.",
            },
          },
        };
      }

      if (existing.status !== "PENDING") {
        return {
          status: 422,
          body: {
            error: {
              code: "ACTION_TERMINAL_IMMUTABLE",
              message: "Completed or cancelled actions cannot be modified.",
            },
          },
        };
      }

      if (body.version !== existing.version) {
        return {
          status: 409,
          body: {
            error: {
              code: "ACTION_VERSION_CONFLICT",
              message: "This action was modified by another operation. Refresh and try again.",
            },
          },
        };
      }

      // Validate description if provided
      let finalDesc = existing.description;
      if (body.description !== undefined) {
        if (typeof body.description !== "string") {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Description must be a string." } } };
        }
        const trimmed = body.description.trim();
        if (trimmed.length < 5 || trimmed.length > 2000) {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Description must be between 5 and 2,000 characters." } } };
        }
        finalDesc = trimmed;
      }

      // Validate assigneeId if provided
      let finalAssigneeId = existing.assigneeId;
      if (body.assigneeId !== undefined) {
        if (body.assigneeId === null) {
          finalAssigneeId = null;
        } else if (typeof body.assigneeId === "number" && Number.isInteger(body.assigneeId) && body.assigneeId > 0) {
          const assignee = await tx.user.findUnique({
            where: { id: body.assigneeId },
            select: { id: true, isActive: true, role: true },
          });
          if (!assignee || !assignee.isActive || (assignee.role !== "IT_STAFF" && assignee.role !== "ADMINISTRATOR")) {
            return {
              status: 422,
              body: {
                error: {
                  code: "INVALID_ACTION_ASSIGNEE",
                  message: "Assignee must be an active IT Staff or Administrator account.",
                },
              },
            };
          }
          finalAssigneeId = assignee.id;
        } else {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Assignee ID must be a positive integer or null." } } };
        }
      }

      // Validate followUpRequired if provided
      let finalFollowUpRequired = existing.followUpRequired;
      if (body.followUpRequired !== undefined) {
        if (typeof body.followUpRequired !== "boolean") {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "followUpRequired must be a boolean." } } };
        }
        finalFollowUpRequired = body.followUpRequired;
      }

      // Validate followUpNote if provided
      let newFollowUpNote = existing.followUpNote;
      if (body.followUpNote !== undefined) {
        if (body.followUpNote === null) {
          newFollowUpNote = null;
        } else if (typeof body.followUpNote === "string") {
          const trimmedNote = body.followUpNote.trim();
          if (trimmedNote.length > 1000) {
            return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Follow-up note must not exceed 1,000 characters." } } };
          }
          newFollowUpNote = trimmedNote.length > 0 ? trimmedNote : null;
        } else {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Follow-up note must be a string or null." } } };
        }
      }

      // Follow-up consistency normalization: when followUpRequired is false, normalize followUpNote to null
      let finalFollowUpNote: string | null;
      if (!finalFollowUpRequired) {
        finalFollowUpNote = null;
      } else {
        finalFollowUpNote = newFollowUpNote;
        if (!finalFollowUpNote) {
          return {
            status: 422,
            body: {
              error: {
                code: "FOLLOW_UP_NOTE_REQUIRED",
                message: "A follow-up note is required when followUpRequired is true.",
              },
            },
          };
        }
      }

      // Validate attachmentNotes if provided
      let finalAttachmentNotes = existing.attachmentNotes;
      if (body.attachmentNotes !== undefined) {
        if (body.attachmentNotes === null) {
          finalAttachmentNotes = null;
        } else if (typeof body.attachmentNotes === "string") {
          const trimmedAttachment = body.attachmentNotes.trim();
          if (trimmedAttachment.length > 1000) {
            return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Attachment notes must not exceed 1,000 characters." } } };
          }
          finalAttachmentNotes = trimmedAttachment.length > 0 ? trimmedAttachment : null;
        } else {
          return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Attachment notes must be a string or null." } } };
        }
      }

      // Check what changed
      const changes: Record<string, any> = {};
      if (finalDesc !== existing.description) {
        changes.description = { before: existing.description, after: finalDesc };
      }
      if (finalAssigneeId !== existing.assigneeId) {
        changes.assignee = { beforeId: existing.assigneeId, afterId: finalAssigneeId };
      }
      if (finalFollowUpRequired !== existing.followUpRequired) {
        changes.followUpRequired = { before: existing.followUpRequired, after: finalFollowUpRequired };
      }
      if (finalFollowUpNote !== existing.followUpNote) {
        changes.followUpNote = { before: existing.followUpNote, after: finalFollowUpNote };
      }
      if (finalAttachmentNotes !== existing.attachmentNotes) {
        changes.attachmentNotes = { before: existing.attachmentNotes, after: finalAttachmentNotes };
      }

      const onlyAssigneeChanged = Object.keys(changes).length === 1 && "assignee" in changes;
      const eventType: ActionEventType = onlyAssigneeChanged ? "ASSIGNED" : "UPDATED";
      const newVersion = existing.version + 1;

      const updated = await tx.actionTaken.update({
        where: { id: actionId },
        data: {
          description: finalDesc,
          assigneeId: finalAssigneeId,
          followUpRequired: finalFollowUpRequired,
          followUpNote: finalFollowUpNote,
          attachmentNotes: finalAttachmentNotes,
          version: newVersion,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          completedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      await tx.actionTakenHistory.create({
        data: {
          actionId,
          ticketId: existing.ticketId,
          actorId: req.auth!.user.id,
          eventType,
          version: newVersion,
          snapshot: {
            changes,
            versionBefore: existing.version,
            versionAfter: newVersion,
          },
        },
      });

      return { status: 200, body: { data: toActionTakenDto(updated) } };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to edit action.", retryable: true } });
  }
});

// PATCH /api/actions/:id/status
actionsRouter.patch("/:id/status", requireStaff, requireCsrf, async (req: Request, res: Response) => {
  try {
    const actionId = positiveId(req.params.id);
    if (!actionId) {
      res.status(404).json({ error: { code: "ACTION_NOT_FOUND", message: "Action not found." } });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.version !== "number" || !Number.isInteger(body.version)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Version must be an integer." } });
      return;
    }

    const targetStatus = body.status;
    if (targetStatus !== "COMPLETED" && targetStatus !== "CANCELLED") {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Status must be COMPLETED or CANCELLED." } });
      return;
    }

    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const actionRef = await tx.actionTaken.findUnique({
        where: { id: actionId },
        select: { id: true, ticketId: true },
      });

      if (!actionRef) {
        return { status: 404, body: { error: { code: "ACTION_NOT_FOUND", message: "Action not found." } } };
      }

      // Lock parent ticket
      const ticketRows = await tx.$queryRaw<Array<{
        id: number;
        currentStatus: TicketStatus;
        ownerId: number | null;
        updatedAt: Date;
      }>>`
        SELECT id, "currentStatus", "ownerId", "updatedAt"
        FROM "Ticket"
        WHERE id = ${actionRef.ticketId}
        FOR UPDATE
      `;
      const ticketRow = ticketRows[0];
      if (!ticketRow) {
        return { status: 404, body: { error: { code: "TICKET_NOT_FOUND", message: "Ticket not found." } } };
      }

      // Re-read action under lock to see any committed changes from previous transactions
      const existing = await tx.actionTaken.findUnique({
        where: { id: actionId },
        include: {
          assignee: { select: { id: true, name: true, email: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          completedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      if (!existing) {
        return { status: 404, body: { error: { code: "ACTION_NOT_FOUND", message: "Action not found." } } };
      }

      if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticketRow.currentStatus)) {
        return {
          status: 422,
          body: {
            error: {
              code: "TICKET_TERMINAL_IMMUTABLE",
              message: "Actions cannot be created or modified on resolved, closed, or cancelled tickets.",
            },
          },
        };
      }

      if (existing.status !== "PENDING") {
        return {
          status: 422,
          body: {
            error: {
              code: "ACTION_TERMINAL_IMMUTABLE",
              message: "Completed or cancelled actions cannot be modified.",
            },
          },
        };
      }

      if (body.version !== existing.version) {
        return {
          status: 409,
          body: {
            error: {
              code: "ACTION_VERSION_CONFLICT",
              message: "This action was modified by another operation. Refresh and try again.",
            },
          },
        };
      }

      const now = new Date();
      const newVersion = existing.version + 1;

      if (targetStatus === "COMPLETED") {
        const rawResult = typeof body.result === "string" ? body.result.trim() : "";
        if (rawResult.length < 3 || rawResult.length > 4000) {
          return {
            status: 422,
            body: {
              error: {
                code: "ACTION_RESULT_REQUIRED",
                message: "Result is required when completing an action and must be at least 3 characters.",
              },
            },
          };
        }

        const updated = await tx.actionTaken.update({
          where: { id: actionId },
          data: {
            status: "COMPLETED",
            result: rawResult,
            completedAt: now,
            completedById: req.auth!.user.id,
            version: newVersion,
          },
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
            createdBy: { select: { id: true, name: true, email: true, role: true } },
            completedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        });

        await tx.actionTakenHistory.create({
          data: {
            actionId,
            ticketId: existing.ticketId,
            actorId: req.auth!.user.id,
            eventType: "COMPLETED",
            version: newVersion,
            snapshot: {
              changes: {
                status: { before: "PENDING", after: "COMPLETED" },
                result: { before: null, after: rawResult },
                completedBy: { beforeId: null, afterId: req.auth!.user.id },
              },
              versionBefore: existing.version,
              versionAfter: newVersion,
            },
          },
        });

        return { status: 200, body: { data: toActionTakenDto(updated) } };
      } else {
        // targetStatus === "CANCELLED"
        const rawReason = typeof body.cancellationReason === "string" ? body.cancellationReason.trim() : "";
        if (rawReason.length < 3 || rawReason.length > 2000) {
          return {
            status: 422,
            body: {
              error: {
                code: "CANCELLATION_REASON_REQUIRED",
                message: "Cancellation reason is required when cancelling an action and must be at least 3 characters.",
              },
            },
          };
        }

        const updated = await tx.actionTaken.update({
          where: { id: actionId },
          data: {
            status: "CANCELLED",
            cancellationReason: rawReason,
            cancelledAt: now,
            version: newVersion,
          },
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
            createdBy: { select: { id: true, name: true, email: true, role: true } },
            completedBy: { select: { id: true, name: true, email: true, role: true } },
          },
        });

        await tx.actionTakenHistory.create({
          data: {
            actionId,
            ticketId: existing.ticketId,
            actorId: req.auth!.user.id,
            eventType: "CANCELLED",
            version: newVersion,
            snapshot: {
              changes: {
                status: { before: "PENDING", after: "CANCELLED" },
                cancellationReason: { before: null, after: rawReason },
              },
              versionBefore: existing.version,
              versionAfter: newVersion,
            },
          },
        });

        return { status: 200, body: { data: toActionTakenDto(updated) } };
      }
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update action status.", retryable: true } });
  }
});

// GET /api/actions/:id/history
actionsRouter.get("/:id/history", requireStaff, async (req: Request, res: Response) => {
  try {
    const actionId = positiveId(req.params.id);
    if (!actionId) {
      res.status(404).json({ error: { code: "ACTION_NOT_FOUND", message: "Action not found." } });
      return;
    }

    const prisma = getPrisma();
    const action = await prisma.actionTaken.findUnique({
      where: { id: actionId },
      select: { id: true },
    });
    if (!action) {
      res.status(404).json({ error: { code: "ACTION_NOT_FOUND", message: "Action not found." } });
      return;
    }

    const historyItems = await prisma.actionTakenHistory.findMany({
      where: { actionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.status(200).json({
      data: {
        actionTakenId: actionId,
        total: historyItems.length,
        items: historyItems.map(toActionTakenHistoryDto),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch action history.", retryable: true } });
  }
});
