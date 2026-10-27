import type { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";
import { hashPassword, INITIAL_PASSWORD, MIGRATED_INITIAL_PASSWORD_HASH, normalizeEmail } from "../src/auth-crypto.js";
import {
  actionTakenFixtures,
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
  "category" | "relatedSystem" | "user" | "ticket" | "publicComment" | "internalNote" | "actionTaken" | "actionTakenHistory"
>;

export interface SeedOptions {
  seedActions?: boolean;
}

export async function seedDatabase(prisma: SeedClient, options?: SeedOptions): Promise<void> {
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
  if (options?.seedActions && "actionTaken" in prisma && "actionTakenHistory" in prisma) {
    for (const fixture of actionTakenFixtures) {
      const ticket = seededTickets.get(fixture.ticketKey);
      if (!ticket) continue;
      const creator = await prisma.user.findUnique({ where: { email: fixture.creatorEmail }, select: { id: true } });
      if (!creator) continue;
      const assignee = fixture.assigneeEmail
        ? await prisma.user.findUnique({ where: { email: fixture.assigneeEmail }, select: { id: true } })
        : null;
      const completedBy = fixture.completedByEmail
        ? await prisma.user.findUnique({ where: { email: fixture.completedByEmail }, select: { id: true } })
        : null;

      const existing = await prisma.actionTaken.findFirst({
        where: { ticketId: ticket.id, idempotencyKey: fixture.idempotencyKey },
        select: { id: true },
      });

      if (!existing) {
        const now = new Date();
        const created = await prisma.actionTaken.create({
          data: {
            ticketId: ticket.id,
            idempotencyKey: fixture.idempotencyKey,
            createdById: creator.id,
            assigneeId: assignee?.id ?? null,
            completedById: completedBy?.id ?? null,
            status: fixture.status,
            description: fixture.description,
            result: fixture.result ?? null,
            cancellationReason: fixture.cancellationReason ?? null,
            followUpRequired: fixture.followUpRequired ?? false,
            followUpNote: fixture.followUpNote ?? null,
            attachmentNotes: fixture.attachmentNotes ?? null,
            completedAt: fixture.status === "COMPLETED" ? now : null,
            cancelledAt: fixture.status === "CANCELLED" ? now : null,
          },
          select: { id: true },
        });

        await prisma.actionTakenHistory.create({
          data: {
            actionId: created.id,
            ticketId: ticket.id,
            actorId: creator.id,
            eventType: "CREATED",
            version: 1,
            snapshot: {
              status: "PENDING",
              description: fixture.description,
              assigneeId: assignee?.id ?? null,
              followUpRequired: fixture.followUpRequired ?? false,
              followUpNote: fixture.followUpNote ?? null,
            },
          },
        });

        if (fixture.status === "COMPLETED" && completedBy) {
          await prisma.actionTakenHistory.create({
            data: {
              actionId: created.id,
              ticketId: ticket.id,
              actorId: completedBy.id,
              eventType: "COMPLETED",
              version: 2,
              snapshot: {
                status: "COMPLETED",
                result: fixture.result,
                completedById: completedBy.id,
              },
            },
          });
        }

        if (fixture.status === "CANCELLED") {
          await prisma.actionTakenHistory.create({
            data: {
              actionId: created.id,
              ticketId: ticket.id,
              actorId: creator.id,
              eventType: "CANCELLED",
              version: 2,
              snapshot: {
                status: "CANCELLED",
                cancellationReason: fixture.cancellationReason,
              },
            },
          });
        }
      }
    }
  }
}


async function main(): Promise<void> {
  const prisma = getPrisma();

  try {
    await seedDatabase(prisma, { seedActions: true });
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
