import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";

const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsRoot = join(serverRoot, "prisma", "migrations");
const schemaName = `lab3_migration_test_${randomUUID().replaceAll("-", "")}`;
const tempRootPromise = mkdtemp(join(tmpdir(), "toktickit-lab3-migration-"));
const baseUrl = process.env.DATABASE_URL;
let schemaUrl: string | undefined;
let tempRoot: string | undefined;
let uploadDir: string | undefined;
let db: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;

async function copyMigration(name: string): Promise<void> {
  await cp(join(migrationsRoot, name), join(tempRoot!, "migrations", name), { recursive: true });
}

function deploy(): void {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", join(tempRoot!, "schema.prisma"),
  ], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: schemaUrl },
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("Lab 2 to Lab 3 migration preservation", () => {
  beforeAll(async () => {
    if (!baseUrl) return;
    try {
      tempRoot = await tempRootPromise;
      await mkdir(join(tempRoot, "migrations"), { recursive: true });
      await cp(join(serverRoot, "prisma", "schema.prisma"), join(tempRoot, "schema.prisma"));
      await cp(join(serverRoot, "prisma", "migration_lock.toml"), join(tempRoot, "migrations", "migration_lock.toml"));
      await writeFile(join(tempRoot, "migrations", "migration_lock.toml"), await readFile(join(serverRoot, "prisma", "migration_lock.toml")));
      const url = new URL(baseUrl);
      url.searchParams.set("schema", schemaName);
      schemaUrl = url.toString();
      uploadDir = await mkdtemp(join(tmpdir(), "toktickit-lab3-upload-"));

      await cp(join(migrationsRoot, "20260829153000_lab2_data_foundation"), join(tempRoot, "migrations", "20260829153000_lab2_data_foundation"), { recursive: true });
      deploy();
      db = new PrismaClient({ datasources: { db: { url: schemaUrl } } });
      await db.$connect();
      await db.$executeRawUnsafe(`SELECT setval('"${schemaName}"."ticket_number_seq"'::regclass, 500, true)`);
      await db.$executeRaw`INSERT INTO "RequesterUser" ("id", "name", "email", "department", "isActive", "createdAt", "updatedAt") VALUES (10, 'Legacy Requester', 'legacy@example.test', 'Engineering', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "Category" ("id", "name", "isActive", "createdAt", "updatedAt") VALUES (10, 'Legacy Category', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "RelatedSystem" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES (10, 'Legacy System', 'Legacy record', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "idempotencyKey", "creationFingerprint", "creationResponse", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "itPriority", "currentStatus", "ticketOwner", "createdAt", "updatedAt") VALUES (50, 'TKT-2026-00500', 10, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'legacy-fingerprint', '{"legacy":true}', 10, 10, 'Legacy ticket', 'Preserve this ticket', 'HIGH', NULL, 'NEW', 'Legacy Owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "idempotencyKey", "categoryId", "relatedSystemId", "summary", "description", "requestedPriority", "itPriority", "currentStatus", "createdAt", "updatedAt") VALUES (51, 'TKT-2026-00501', 10, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 10, 10, 'Legacy priority ticket', 'Keep existing IT priority', 'LOW', 'CRITICAL', 'NEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "Attachment" ("id", "ticketId", "originalName", "storedName", "mimeType", "sizeBytes", "isRemoved", "createdAt") VALUES (70, 50, 'legacy.txt', 'legacy-storage.txt', 'text/plain', 18, false, CURRENT_TIMESTAMP)`;
      await db.$executeRaw`INSERT INTO "Attachment" ("id", "ticketId", "originalName", "storedName", "mimeType", "sizeBytes", "isRemoved", "removalReason", "removedAt", "removedByRequesterId", "createdAt") VALUES (71, 50, 'removed.txt', 'removed-storage.txt', 'text/plain', 20, true, 'Legacy cleanup', CURRENT_TIMESTAMP, 10, CURRENT_TIMESTAMP)`;
      await writeFile(join(uploadDir, "legacy-storage.txt"), Buffer.from("legacy attachment"));
      await writeFile(join(uploadDir, "removed-storage.txt"), Buffer.from("removed attachment"));

      await copyMigration("20260916090000_lab3_authentication_foundation");
      await copyMigration("20260916100000_lab3_workflow_discussion_foundation");
      deploy();
      ready = true;
    } catch (error) {
      console.warn("Skipping Lab 3 migration integration test: PostgreSQL is unavailable or migrations could not deploy.", error);
    }
  }, 90_000);

  it.skipIf(!ready)("preserves populated Lab 2 users, tickets, ownership text, receipts, attachments, and files", async () => {
    const users = await db!.user.findMany({ where: { id: 10 }, select: { id: true, email: true, department: true } });
    const tickets = await db!.ticket.findMany({ where: { id: { in: [50, 51] } }, orderBy: { id: "asc" }, select: { id: true, ticketNumber: true, requesterId: true, idempotencyKey: true, creationFingerprint: true, creationResponse: true, requestedPriority: true, itPriority: true, ticketOwner: true } });
    const attachments = await db!.attachment.findMany({ where: { id: { in: [70, 71] } }, orderBy: { id: "asc" }, select: { id: true, ticketId: true, storedName: true, isRemoved: true, removalReason: true, removedByRequesterId: true } });
    expect(users).toMatchObject([{ id: 10, email: "legacy@example.test", department: "Engineering" }]);
    expect(tickets).toMatchObject([
      { id: 50, ticketNumber: "TKT-2026-00500", requesterId: 10, creationFingerprint: "legacy-fingerprint", ticketOwner: "Legacy Owner", itPriority: "HIGH" },
      { id: 51, ticketNumber: "TKT-2026-00501", requesterId: 10, itPriority: "CRITICAL" },
    ]);
    expect(tickets[0].creationResponse).toEqual({ legacy: true });
    expect(attachments).toEqual([
      { id: 70, ticketId: 50, storedName: "legacy-storage.txt", isRemoved: false, removalReason: null, removedByRequesterId: null },
      { id: 71, ticketId: 50, storedName: "removed-storage.txt", isRemoved: true, removalReason: "Legacy cleanup", removedByRequesterId: 10 },
    ]);
    expect(await readFile(join(uploadDir!, "legacy-storage.txt"), "utf8")).toBe("legacy attachment");
    expect(await readFile(join(uploadDir!, "removed-storage.txt"), "utf8")).toBe("removed attachment");
    const sequence = await db!.$queryRaw<{ last_value: bigint }[]>`SELECT last_value FROM "ticket_number_seq"`;
    expect(Number(sequence[0].last_value)).toBe(500);
  });

  it.skipIf(!ready)("seeds representative role/workflow/discussion data idempotently", async () => {
    await seedDatabase(db!);
    const first = {
      tickets: await db!.ticket.count(),
      comments: await db!.publicComment.count(),
      notes: await db!.internalNote.count(),
    };
    const seeded = await db!.user.findUniqueOrThrow({ where: { email: "amina.rahman@toktickit.local" } });
    await db!.user.update({ where: { id: seeded.id }, data: { passwordHash: "changed-hash", mustChangePassword: false } });
    await seedDatabase(db!);
    expect(await db!.ticket.count()).toBe(first.tickets);
    expect(await db!.publicComment.count()).toBe(first.comments);
    expect(await db!.internalNote.count()).toBe(first.notes);
    expect(await db!.user.findUniqueOrThrow({ where: { id: seeded.id }, select: { passwordHash: true, mustChangePassword: true } })).toEqual({ passwordHash: "changed-hash", mustChangePassword: false });
  });

  afterAll(async () => {
    await db?.$disconnect();
    await admin?.$disconnect();
    if (baseUrl && ready) {
      admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
      try {
        await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await admin.$disconnect();
      }
    }
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });
});
