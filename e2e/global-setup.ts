import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const serverRequire = createRequire(path.resolve(process.cwd(), "server/package.json"));
const { PrismaClient } = serverRequire("@prisma/client");

export default async function globalSetup() {
  const baseDbUrl = process.env.DATABASE_URL || "postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=public";
  const admin = new PrismaClient({ datasources: { db: { url: baseDbUrl } } });

  try {
    // Reset isolated E2E schema to guarantee pristine, repeatable known state
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "e2e_test" CASCADE;`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "e2e_test";`);
  } finally {
    await admin.$disconnect();
  }

  const e2eUrl = new URL(baseDbUrl);
  e2eUrl.searchParams.set("schema", "e2e_test");

  const serverDir = path.resolve(process.cwd(), "server");

  // Deploy migrations to isolated schema
  execFileSync(process.execPath, [
    serverRequire.resolve("prisma/build/index.js"), "migrate", "deploy",
  ], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: e2eUrl.toString() },
    encoding: "utf8",
    timeout: 30_000,
  });

  // Seed isolated schema
  const seedClient = new PrismaClient({ datasources: { db: { url: e2eUrl.toString() } } });
  try {
    const { seedDatabase } = await import("../server/prisma/seed.js");
    await seedDatabase(seedClient);
  } finally {
    await seedClient.$disconnect();
  }
}
