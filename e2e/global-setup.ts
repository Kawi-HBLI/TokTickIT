import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { E2E_DATABASE_URL } from "./test-environment.js";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));
const { PrismaClient } = serverRequire("@prisma/client");

export default async function globalSetup() {
  const admin = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });

  try {
    // Reset isolated E2E schema to guarantee pristine, repeatable known state
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "e2e_test" CASCADE;`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "e2e_test";`);
  } finally {
    await admin.$disconnect();
  }

  const serverDir = path.resolve(process.cwd(), "server");

  // Deploy migrations to isolated schema
  execFileSync(process.execPath, [
    serverRequire.resolve("prisma/build/index.js"), "migrate", "deploy",
  ], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    encoding: "utf8",
    timeout: 30_000,
  });

  // Seed isolated schema
  const seedClient = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const { seedDatabase } = await import("../server/prisma/seed.js");
    await seedDatabase(seedClient);
  } finally {
    await seedClient.$disconnect();
  }
}
