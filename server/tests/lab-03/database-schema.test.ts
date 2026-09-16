import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { administratorUsers, requesterUsers, staffUsers } from "../../prisma/seed-data.js";

const schema = readFileSync(
  fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../prisma/migrations/20260916090000_lab3_authentication_foundation/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Lab 3 authentication database foundation", () => {
  it("defines User roles and server-side Session storage", () => {
    expect(schema).toContain("enum UserRole {");
    expect(schema).toContain("model User {");
    expect(schema).toContain("normalizedEmail    String       @unique");
    expect(schema).toContain("passwordHash       String");
    expect(schema).toContain("model Session {");
    expect(schema).toContain("tokenHash  String   @unique");
    expect(schema).toContain("csrfToken  String");
  });

  it("migrates the existing requester table in place and preserves IDs", () => {
    expect(migration).toContain('ALTER TABLE "RequesterUser" RENAME TO "User"');
    expect(migration).toContain('ALTER TABLE "Ticket"\n  ADD COLUMN "ownerId" INTEGER');
    expect(migration).toContain('CREATE TABLE "Session"');
    expect(migration).not.toMatch(/DROP TABLE\s+"?(RequesterUser|Ticket|Attachment)/i);
    expect(migration).not.toMatch(/DROP\s+SCHEMA|CREATE\s+DATABASE/i);
  });

  it("removes the database password default after migrating existing users", () => {
    expect(migration).toContain('ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT');
    expect(migration).toContain('ALTER COLUMN "passwordHash" DROP DEFAULT');
    expect(migration).not.toContain("ChangeMe-2026!'");
  });

  it("provides the minimum active/inactive role fixtures required by Lab 3", () => {
    expect(requesterUsers.filter(({ isActive }) => isActive)).toHaveLength(4);
    expect(requesterUsers.filter(({ isActive }) => !isActive)).toHaveLength(1);
    expect(staffUsers.filter(({ isActive }) => isActive)).toHaveLength(3);
    expect(staffUsers.filter(({ isActive }) => !isActive)).toHaveLength(1);
    expect(administratorUsers.filter(({ isActive }) => isActive)).toHaveLength(1);
  });
});
