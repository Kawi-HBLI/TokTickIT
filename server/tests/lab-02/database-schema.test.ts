import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../prisma/migrations/20260829153000_lab2_data_foundation/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Lab 2 database schema", () => {
  it.each(["RequesterUser", "Category", "RelatedSystem", "Ticket", "Attachment"])(
    "defines the %s model",
    (model) => {
      expect(schema).toContain(`model ${model} {`);
    },
  );

  it("defines ownership, filtering, and idempotency constraints", () => {
    expect(schema).toContain("@@unique([requesterId, idempotencyKey])");
    expect(schema).toContain("@@index([requesterId, updatedAt])");
    expect(schema).toContain("@@index([requesterId, categoryId])");
    expect(schema).toContain("@@index([requesterId, requestedPriority])");
    expect(schema).toContain("@@index([ticketId, isRemoved])");
    expect(schema).toContain("onDelete: Restrict");
  });

  it("uses a database sequence for concurrency-safe ticket numbers", () => {
    expect(schema).toContain('@default(dbgenerated("next_ticket_number()"))');
    expect(migration).toContain('CREATE SEQUENCE "ticket_number_seq"');
    expect(migration).toContain("CREATE FUNCTION next_ticket_number()");
    expect(migration).not.toMatch(/count\s*\(/i);
  });
});
