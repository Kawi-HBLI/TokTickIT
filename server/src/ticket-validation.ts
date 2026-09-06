import type { TicketPriority } from "@prisma/client";
export interface FieldError { field: string; message: string }
export class TicketError extends Error {
  constructor(public status: number, public code: string, message: string,
    public fields?: FieldError[]) { super(message); }
}
export function positiveId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}
export function validateTicket(body: Record<string, unknown>) {
  const fields: FieldError[] = [];
  const allowed = ["categoryId", "relatedSystemId", "summary", "description", "requestedPriority"];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fields.push({ field: key, message: "Unexpected field." });
  }
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (summary.length < 5 || summary.length > 100)
    fields.push({ field: "summary", message: "Summary must contain 5 to 100 characters." });
  if (description.length < 10 || description.length > 2000)
    fields.push({ field: "description", message: "Description must contain 10 to 2,000 characters." });
  const categoryId = positiveId(body.categoryId);
  const relatedSystemId = positiveId(body.relatedSystemId);
  if (!categoryId) fields.push({ field: "categoryId", message: "Choose an active Category." });
  if (!relatedSystemId) fields.push({ field: "relatedSystemId", message: "Choose an active Related System." });
  const priority = body.requestedPriority;
  if (typeof priority !== "string" || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priority))
    fields.push({ field: "requestedPriority", message: "Choose Low, Medium, High, or Critical." });
  if (fields.length) throw new TicketError(400, "VALIDATION_ERROR", "Some values are invalid.", fields);
  return { summary, description, categoryId: categoryId!, relatedSystemId: relatedSystemId!,
    requestedPriority: priority as TicketPriority };
}
