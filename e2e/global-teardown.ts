import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));
const { PrismaClient } = serverRequire("@prisma/client");

export default async function globalTeardown() {
  const baseDbUrl = process.env.DATABASE_URL || "postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=public";
  const admin = new PrismaClient({ datasources: { db: { url: baseDbUrl } } });

  try {
    // Drop test schema
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "e2e_test" CASCADE;`);
  } catch {
    // Ignore teardown error if already removed
  } finally {
    await admin.$disconnect();
  }

  // Remove test upload directory if created
  try {
    await rm(path.resolve(process.cwd(), "server/uploads_e2e"), { recursive: true, force: true });
  } catch {
    // Ignore
  }
}
