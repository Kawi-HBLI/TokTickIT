import type { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";
import { hashPassword, INITIAL_PASSWORD, MIGRATED_INITIAL_PASSWORD_HASH, normalizeEmail } from "../src/auth-crypto.js";
import { administratorUsers, categories, relatedSystems, requesterUsers, staffUsers } from "./seed-data.js";

type SeedClient = Pick<
  PrismaClient,
  "category" | "relatedSystem" | "user"
>;

export async function seedDatabase(prisma: SeedClient): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { isActive: category.isActive },
      create: category,
    });
  }

  for (const relatedSystem of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name: relatedSystem.name },
      update: {
        description: relatedSystem.description,
        isActive: relatedSystem.isActive,
      },
      create: relatedSystem,
    });
  }

  const users = [
    ...requesterUsers.map((user) => ({ ...user, role: "REQUESTER" as const })),
    ...staffUsers.map((user) => ({ ...user, role: "IT_STAFF" as const })),
    ...administratorUsers.map((user) => ({ ...user, role: "ADMINISTRATOR" as const })),
  ];

  for (const requesterUser of users) {
    const persisted = await prisma.user.upsert({
      where: { email: requesterUser.email },
      update: {
        name: requesterUser.name,
        department: requesterUser.department,
        normalizedEmail: normalizeEmail(requesterUser.email),
      },
      create: {
        ...requesterUser,
        normalizedEmail: normalizeEmail(requesterUser.email),
        passwordHash: await hashPassword(INITIAL_PASSWORD),
        mustChangePassword: true,
      },
    });
    if (persisted.passwordHash === MIGRATED_INITIAL_PASSWORD_HASH) {
      await prisma.user.update({
        where: { id: persisted.id },
        data: { passwordHash: await hashPassword(INITIAL_PASSWORD) },
      });
    }
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma();

  try {
    await seedDatabase(prisma);
    console.log(
      `Database seeded: ${categories.length} categories, ` +
        `${relatedSystems.length} related systems, and ` +
        `${requesterUsers.length + staffUsers.length + administratorUsers.length} users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
