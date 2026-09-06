import type { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";
import { categories, relatedSystems, requesterUsers } from "./seed-data.js";

type SeedClient = Pick<
  PrismaClient,
  "category" | "relatedSystem" | "requesterUser"
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

  for (const requesterUser of requesterUsers) {
    await prisma.requesterUser.upsert({
      where: { email: requesterUser.email },
      update: {
        name: requesterUser.name,
        department: requesterUser.department,
        isActive: requesterUser.isActive,
      },
      create: requesterUser,
    });
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma();

  try {
    await seedDatabase(prisma);
    console.log(
      `Database seeded: ${categories.length} categories, ` +
        `${relatedSystems.length} related systems, and ` +
        `${requesterUsers.length} requester users.`,
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
