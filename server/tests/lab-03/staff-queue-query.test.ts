import { describe, expect, it } from "vitest";
import { validateStaffQueueQuery } from "../../src/staff-queue.js";

describe("UNIT-WORKFLOW-02: Staff Queue query validation", () => {
  it("applies documented defaults: empty query, null filters, updatedAt desc, page 1, pageSize 20", () => {
    const parsed = validateStaffQueueQuery({}, 5);
    expect(parsed).toEqual({
      q: "",
      status: null,
      requestedPriority: null,
      itPriority: null,
      categoryId: null,
      owner: null,
      sortBy: "updatedAt",
      sortDirection: "desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("accepts valid combinable filters, sort fields, and page sizes (10, 20, 50)", () => {
    const parsed = validateStaffQueueQuery(
      {
        q: " network failure ",
        status: "IN_PROGRESS",
        requestedPriority: "HIGH",
        itPriority: "CRITICAL",
        categoryId: "2",
        owner: "me",
        sortBy: "status",
        sortDirection: "asc",
        page: "3",
        pageSize: "50",
      },
      7
    );

    expect(parsed).toEqual({
      q: "network failure",
      status: "IN_PROGRESS",
      requestedPriority: "HIGH",
      itPriority: "CRITICAL",
      categoryId: 2,
      owner: { type: "me", userId: 7 },
      sortBy: "status",
      sortDirection: "asc",
      page: 3,
      pageSize: 50,
    });
  });

  it("handles owner=unassigned and owner=<numeric_id>", () => {
    const unassigned = validateStaffQueueQuery({ owner: "unassigned" });
    expect(unassigned.owner).toEqual({ type: "unassigned" });

    const specific = validateStaffQueueQuery({ owner: "12" });
    expect(specific.owner).toEqual({ type: "user", userId: 12 });
  });

  it("rejects unknown query parameters with 400 INVALID_QUERY", () => {
    expect(() => validateStaffQueueQuery({ randomParam: "val" })).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "INVALID_QUERY",
      })
    );
  });

  it("rejects invalid enum values and out-of-range numbers", () => {
    expect(() => validateStaffQueueQuery({ status: "UNKNOWN_STATUS" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );

    expect(() => validateStaffQueueQuery({ itPriority: "SUPER_HIGH" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );

    expect(() => validateStaffQueueQuery({ categoryId: "-1" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );

    expect(() => validateStaffQueueQuery({ pageSize: "100" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );

    expect(() => validateStaffQueueQuery({ page: "0" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );

    expect(() => validateStaffQueueQuery({ owner: "invalid_owner" })).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_QUERY" })
    );
  });
});
