import { describe, expect, it } from "vitest";
import { positiveId, TicketError, validateTicket } from "../../src/ticket-validation.js";
const valid = { categoryId: "1", relatedSystemId: "2", summary: "  Email issue  ", description: "  Cannot open the mailbox today.  ", requestedPriority: "MEDIUM" };
describe("Ticket field validation", () => {
  it("trims text before storage", () => {
    expect(validateTicket(valid)).toMatchObject({ summary: "Email issue", description: "Cannot open the mailbox today.", categoryId: 1 });
  });
  it.each(["LOW", "MEDIUM", "HIGH", "CRITICAL"])("accepts %s", requestedPriority => {
    expect(validateTicket({ ...valid, requestedPriority }).requestedPriority).toBe(requestedPriority);
  });
  it.each([undefined, null, "", "0", "-1", "01", "1x", "1.5", "2147483648", ["1", "2"]])("rejects noncanonical id %s", value => {
    expect(positiveId(value)).toBeNull();
  });
  it("rejects duplicate fields and server-controlled fields", () => {
    expect(() => validateTicket({ ...valid, summary: ["hello", "world"] })).toThrow(TicketError);
    expect(() => validateTicket({ ...valid, requesterId: "7" })).toThrow(TicketError);
  });
});
