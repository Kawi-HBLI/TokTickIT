import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { E2E_DATABASE_URL, E2E_UPLOAD_DIR } from "./test-environment.js";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));
const { PrismaClient } = serverRequire("@prisma/client");

export default async function globalTeardown() {
  const admin = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });

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
    await rm(path.resolve(process.cwd(), "server", E2E_UPLOAD_DIR), { recursive: true, force: true });
  } catch {
    // Ignore
  }
}
