import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireRequester } from "./requester-context.js";
import { TicketError, validateTicket } from "./ticket-validation.js";
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
createTicketRouter.post("/", requireRequester, (req, _res, next) => {
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
      const ticket = await tx.ticket.create({ data: { ...payload, requesterId, idempotencyKey: key, creationFingerprint: fingerprint } });
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

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({ error: {
      code: tooLarge ? "ATTACHMENT_TOO_LARGE" : "VALIDATION_ERROR",
      message: tooLarge ? "A file exceeds 5 MiB." : "Invalid multipart form or too many fields/files.",
      fields: [{ field: "attachments", message: "Use at most five files, each no larger than 5 MiB." }], retryable: false,
    } });
  } else if (error instanceof TicketError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message,
      ...(error.fields ? { fields: error.fields } : {}), retryable: false } });
  } else {
    console.error("Ticket creation failed", error);
    res.status(500).json({ error: { code: "TICKET_CREATE_FAILED",
      message: "The ticket could not be created. Please retry the same submission.", retryable: true } });
  }
};
createTicketRouter.use(errorHandler);
