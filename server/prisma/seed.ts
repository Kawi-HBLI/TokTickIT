import type { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";
import { hashPassword, INITIAL_PASSWORD, MIGRATED_INITIAL_PASSWORD_HASH, normalizeEmail } from "../src/auth-crypto.js";
import {
  administratorUsers,
  categories,
  internalNoteFixtures,
  publicCommentFixtures,
  relatedSystems,
  requesterUsers,
  staffUsers,
  ticketFixtures,
} from "./seed-data.js";

type SeedClient = Pick<
  PrismaClient,
  "category" | "relatedSystem" | "user" | "ticket" | "publicComment" | "internalNote"
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

  // Keep the small Lab 2 seed unit fixture usable; the real Prisma client
  // always exposes these Lab 3 delegates.
  if (!("ticket" in prisma) || !("publicComment" in prisma) || !("internalNote" in prisma)) return;

  const seededTickets = new Map<string, { id: number }>();
  for (const fixture of ticketFixtures) {
    const requester = await prisma.user.findUnique({ where: { email: fixture.requesterEmail }, select: { id: true } });
    const category = await prisma.category.findUnique({ where: { name: fixture.categoryName }, select: { id: true } });
    const relatedSystem = await prisma.relatedSystem.findUnique({ where: { name: fixture.relatedSystemName }, select: { id: true } });
    if (!requester || !category || !relatedSystem) continue;
    const ownerEmail = "ownerEmail" in fixture ? fixture.ownerEmail : undefined;
    const owner = ownerEmail
      ? await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true, role: true, isActive: true } })
      : null;
    const ticket = await prisma.ticket.upsert({
      where: { requesterId_idempotencyKey: { requesterId: requester.id, idempotencyKey: fixture.idempotencyKey } },
      update: {},
      create: {
        requesterId: requester.id,
        idempotencyKey: fixture.idempotencyKey,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: fixture.summary,
        description: fixture.description,
        requestedPriority: fixture.requestedPriority,
        itPriority: fixture.itPriority,
        currentStatus: fixture.currentStatus,
        ownerId: owner?.isActive && owner.role !== "REQUESTER" ? owner.id : null,
      },
      select: { id: true },
    });
    seededTickets.set(fixture.idempotencyKey, ticket);
  }

  for (const fixture of publicCommentFixtures) {
    const ticket = seededTickets.get(fixture.ticketKey);
    const author = await prisma.user.findUnique({ where: { email: fixture.authorEmail }, select: { id: true } });
    if (!ticket || !author) continue;
    const existing = await prisma.publicComment.findFirst({ where: { ticketId: ticket.id, authorId: author.id, content: fixture.content }, select: { id: true } });
    if (!existing) await prisma.publicComment.create({ data: { ticketId: ticket.id, authorId: author.id, content: fixture.content } });
  }

  for (const fixture of internalNoteFixtures) {
    const ticket = seededTickets.get(fixture.ticketKey);
    const author = await prisma.user.findUnique({ where: { email: fixture.authorEmail }, select: { id: true } });
    if (!ticket || !author) continue;
    const existing = await prisma.internalNote.findFirst({ where: { ticketId: ticket.id, authorId: author.id, content: fixture.content }, select: { id: true } });
    if (!existing) await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: author.id, content: fixture.content } });
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
