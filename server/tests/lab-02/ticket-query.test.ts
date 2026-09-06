import { describe, expect, it } from "vitest";
import { TicketError } from "../../src/ticket-validation.js";
import { validateTicketQuery } from "../../src/ticket-query.js";

describe("UNIT-04: Ticket query parsing and normalization", () => {
  it("applies approved defaults to an empty query", () => {
    const result = validateTicketQuery({});
    expect(result).toEqual({
      search: "",
      categoryId: null,
      requestedPriority: null,
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 10,
    });
  });

  it("normalizes and trims valid query parameters", () => {
    const result = validateTicketQuery({
      search: "   printer offline   ",
      categoryId: "2",
      requestedPriority: "HIGH",
      sortBy: "createdAt",
      sortOrder: "asc",
      page: "3",
      pageSize: "20",
    });
    expect(result).toEqual({
      search: "printer offline",
      categoryId: 2,
      requestedPriority: "HIGH",
      sortBy: "createdAt",
      sortOrder: "asc",
      page: 3,
      pageSize: 20,
    });
  });

  it.each([10, 20, 50])("accepts allowed page size %i", (size) => {
    const result = validateTicketQuery({ pageSize: String(size) });
    expect(result.pageSize).toBe(size);
  });

  it.each(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)("accepts requested priority %s", (priority) => {
    const result = validateTicketQuery({ requestedPriority: priority });
    expect(result.requestedPriority).toBe(priority);
  });

  it.each(["createdAt", "updatedAt", "requestedPriority"] as const)("accepts sort field %s", (field) => {
    const result = validateTicketQuery({ sortBy: field });
    expect(result.sortBy).toBe(field);
  });

  it("rejects unexpected query parameters", () => {
    expect(() => validateTicketQuery({ unknownField: "test" })).toThrow(TicketError);
    try {
      validateTicketQuery({ unknownField: "test" });
    } catch (error) {
      expect(error).toBeInstanceOf(TicketError);
      const ticketError = error as TicketError;
      expect(ticketError.status).toBe(400);
      expect(ticketError.code).toBe("INVALID_QUERY");
      expect(ticketError.fields).toEqual(
        expect.arrayContaining([{ field: "unknownField", message: "Unexpected query parameter." }]),
      );
    }
  });

  it.each(["0", "-1", "abc", "1.5", "invalid"])("rejects invalid categoryId %s", (val) => {
    expect(() => validateTicketQuery({ categoryId: val })).toThrow(TicketError);
  });

  it.each(["URGENT", "low", "123", ""])("rejects invalid requestedPriority %s", (val) => {
    if (val === "") {
      // empty string is treated as not provided
      expect(validateTicketQuery({ requestedPriority: val }).requestedPriority).toBeNull();
    } else {
      expect(() => validateTicketQuery({ requestedPriority: val })).toThrow(TicketError);
    }
  });

  it.each(["id", "summary", "ticketNumber", "status"])("rejects unapproved sort field %s", (field) => {
    expect(() => validateTicketQuery({ sortBy: field })).toThrow(TicketError);
  });

  it.each(["ascending", "descending", "none", "1"])("rejects invalid sort order %s", (order) => {
    expect(() => validateTicketQuery({ sortOrder: order })).toThrow(TicketError);
  });

  it.each(["0", "-5", "abc", "1.5"])("rejects non-positive integer page %s", (pageVal) => {
    expect(() => validateTicketQuery({ page: pageVal })).toThrow(TicketError);
  });

  it.each(["5", "15", "25", "100", "0", "-10"])("rejects unapproved page size %s", (sizeVal) => {
    expect(() => validateTicketQuery({ pageSize: sizeVal })).toThrow(TicketError);
  });
});
