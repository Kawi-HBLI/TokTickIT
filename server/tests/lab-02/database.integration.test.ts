import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab2_feature13_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient | undefined;
let year: string;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schemaName);
  const require = createRequire(import.meta.url);
  const output = execFileSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "migrate", "deploy",
  ], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8",
    timeout: 30_000,
  });
  console.info(output);
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await seedDatabase(db);
  requesterId = (await db.requesterUser.findFirstOrThrow({ where: { isActive: true } })).id;
  categoryId = (await db.category.findFirstOrThrow()).id;
  relatedSystemId = (await db.relatedSystem.findFirstOrThrow()).id;
  const rows = await db.$queryRaw<{ year: string }[]>`SELECT to_char(CURRENT_DATE, 'YYYY') AS year`;
  year = rows[0].year;
}, 40_000);

afterAll(async () => {
  await db?.$disconnect();
  // Only the random schema owned by this suite may be removed; never public.
  if (!/^lab2_feature13_test_[a-f0-9]{32}$/.test(schemaName)) {
    throw new Error("Refusing to remove an unexpected test schema");
  }
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

function createTicket(idempotencyKey = randomUUID()) {
  return db!.ticket.create({
    data: {
      requesterId, categoryId, relatedSystemId, idempotencyKey,
      summary: "Database regression test",
      description: "Verify the database-generated ticket number.",
      requestedPriority: "MEDIUM",
    },
  });
}

describe("Lab 2 database migrations and persistence", () => {
  it("seeds twice without duplicate records or changed identities", async () => {
    const snapshot = async () => ({
      categories: await db!.category.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, isActive: true } }),
      systems: await db!.relatedSystem.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, isActive: true } }),
      requesters: await db!.requesterUser.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, isActive: true } }),
    });
    const first = await snapshot();
    await seedDatabase(db!);
    expect(await snapshot()).toEqual(first);
    expect(first.categories).toHaveLength(4);
    expect(first.systems.filter((row) => row.isActive)).toHaveLength(7);
    expect(first.requesters.filter((row) => row.isActive)).toHaveLength(4);
    expect(first.requesters.filter((row) => !row.isActive)).toHaveLength(1);
  });

  it.each([
    [1n, "00001"],
    [99999n, "99999"],
    [100000n, "100000"],
    [100001n, "100001"],
    [9223372036854775807n, "9223372036854775807"],
  ])("preserves every digit at sequence value %s", async (value, suffix) => {
    await db!.$queryRaw`SELECT setval(${`${schemaName}.ticket_number_seq`}::regclass, ${value}::bigint, false)`;
    const ticket = await createTicket();
    expect(ticket.ticketNumber).toBe(`TKT-${year}-${suffix}`);
    expect(ticket.currentStatus).toBe("NEW");
    expect(ticket.itPriority).toBeNull();
    expect(ticket.ticketOwner).toBeNull();
  });

  it("generates distinct numbers for concurrent inserts", async () => {
    await db!.$queryRaw`SELECT setval(${`${schemaName}.ticket_number_seq`}::regclass, 200000, false)`;
    const tickets = await Promise.all(Array.from({ length: 20 }, () => createTicket()));
    expect(new Set(tickets.map((ticket) => ticket.ticketNumber)).size).toBe(20);
    expect(tickets.map((ticket) => ticket.ticketNumber).sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `TKT-${year}-${200000 + index}`),
    );
  });

  it("enforces requester-scoped idempotency and foreign-key restrictions", async () => {
    const key = randomUUID();
    await createTicket(key);
    await expect(createTicket(key)).rejects.toMatchObject({ code: "P2002" });
    await expect(db!.requesterUser.delete({ where: { id: requesterId } })).rejects.toMatchObject({ code: "P2003" });
  });
});
