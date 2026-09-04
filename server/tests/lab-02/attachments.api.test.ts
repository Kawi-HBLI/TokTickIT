import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { seedDatabase } from "../../prisma/seed.js";
import { attachmentStorage } from "../../src/attachment-storage.js";

const schemaName = `lab2_att_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;
let requesterAId: number;
let requesterBId: number;
let categoryId: number;
let systemId: number;
let ticketAId: number;
let ticketBId: number;
let tempUploadDir: string;
const originalUploadDir = process.env.UPLOAD_DIR;

beforeAll(async () => {
  tempUploadDir = await mkdtemp(join(tmpdir(), "toktickit-att-test-"));
  process.env.UPLOAD_DIR = tempUploadDir;

  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schemaName);
  execFileSync(
    process.execPath,
    [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await seedDatabase(db);

  const activeRequesters = await db.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  requesterAId = activeRequesters[0].id;
  requesterBId = activeRequesters[1].id;

  const categories = await db.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  categoryId = categories[0].id;
  systemId = (await db.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

  // Create Ticket A for Requester A
  const tA = await db.ticket.create({
    data: {
      requesterId: requesterAId,
      categoryId,
      relatedSystemId: systemId,
      summary: "Printer toner leaking",
      description: "Toner is leaking all over tray 2 in building B.",
      requestedPriority: "MEDIUM",
      idempotencyKey: randomUUID(),
    },
  });
  ticketAId = tA.id;

  // Create Ticket B for Requester B
  const tB = await db.ticket.create({
    data: {
      requesterId: requesterBId,
      categoryId,
      relatedSystemId: systemId,
      summary: "Email sync error",
      description: "Outlook mobile client not receiving incoming mail.",
      requestedPriority: "LOW",
      idempotencyKey: randomUUID(),
    },
  });
  ticketBId = tB.id;
}, 40000);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  process.env.UPLOAD_DIR = originalUploadDir;
  await rm(tempUploadDir, { recursive: true, force: true }).catch(() => undefined);
  if (db) await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
});

describe("Attachment Lifecycle API (API-ATT-03 to API-ATT-08)", () => {
  let createdAttachmentId: number;
  let sampleStoredName: string;

  it("API-ATT-03: adds valid attachment to owned ticket below the 5-active limit", async () => {
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    const res = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("x-requester-id", String(requesterAId))
      .attach("attachments", pngBuffer, "toner-leak.png");

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].originalName).toBe("toner-leak.png");
    expect(res.body.data[0].mimeType).toBe("image/png");
    expect(res.body.data[0].isRemoved).toBe(false);
    expect(res.body.activeCount).toBe(1);
    expect(res.body.activeLimit).toBe(5);

    createdAttachmentId = res.body.data[0].id;

    // Verify stored record
    const record = await db.attachment.findUniqueOrThrow({ where: { id: createdAttachmentId } });
    sampleStoredName = record.storedName;
    expect(await attachmentStorage.exists(sampleStoredName)).toBe(true);

    // Also verify GET /api/tickets/:id/attachments returns it
    const listRes = await request(app)
      .get(`/api/tickets/${ticketAId}/attachments`)
      .set("x-requester-id", String(requesterAId));

    expect(listRes.status).toBe(200);
    expect(listRes.body.activeCount).toBe(1);
    expect(listRes.body.data).toHaveLength(1);
  });

  it("API-ATT-04: rejects upload when 5 active attachments exist", async () => {
    const dummyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    // Ticket A currently has 1 active attachment. Let's add 4 more to reach 5 active.
    for (let i = 2; i <= 5; i++) {
      const stored = `${randomUUID()}.png`;
      await attachmentStorage.write(stored, dummyPng);
      await db.attachment.create({
        data: {
          ticketId: ticketAId,
          originalName: `file-${i}.png`,
          storedName: stored,
          mimeType: "image/png",
          sizeBytes: dummyPng.length,
          isRemoved: false,
        },
      });
    }

    const count = await db.attachment.count({ where: { ticketId: ticketAId, isRemoved: false } });
    expect(count).toBe(5);

    // Attempt to upload 6th active attachment
    const res = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("x-requester-id", String(requesterAId))
      .attach("attachments", dummyPng, "overflow.png");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");

    // Existing count remains exactly 5
    const finalCount = await db.attachment.count({ where: { ticketId: ticketAId, isRemoved: false } });
    expect(finalCount).toBe(5);
  });

  it("API-ATT-05: preview and download return correct headers, content, and safe original filename with UTF-8 encoding", async () => {
    // 1. Preview
    const previewRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/preview`)
      .set("x-requester-id", String(requesterAId));

    expect(previewRes.status).toBe(200);
    expect(previewRes.headers["content-type"]).toBe("image/png");
    expect(previewRes.headers["content-disposition"]).toContain('inline; filename="toner-leak.png"');
    expect(previewRes.headers["content-disposition"]).toContain("filename*=UTF-8''toner-leak.png");
    expect(previewRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(previewRes.body).toBeInstanceOf(Buffer);

    // 2. Download
    const downloadRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/download`)
      .set("x-requester-id", String(requesterAId));

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toBe("image/png");
    expect(downloadRes.headers["content-disposition"]).toContain('attachment; filename="toner-leak.png"');
    expect(downloadRes.headers["content-disposition"]).toContain("filename*=UTF-8''toner-leak.png");
    expect(downloadRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(downloadRes.body).toBeInstanceOf(Buffer);

    // 3. Thai filename support (does not fail with 500 or header encoding error)
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const thaiUploadRes = await request(app)
      .post(`/api/tickets/${ticketBId}/attachments`)
      .set("x-requester-id", String(requesterBId))
      .attach("attachments", pngBuffer, "หลักฐาน.png");

    expect(thaiUploadRes.status).toBe(201);
    const thaiAttId = thaiUploadRes.body.data[0].id;

    const thaiDownloadRes = await request(app)
      .get(`/api/attachments/${thaiAttId}/download`)
      .set("x-requester-id", String(requesterBId));

    expect(thaiDownloadRes.status).toBe(200);
    expect(thaiDownloadRes.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(thaiDownloadRes.headers["content-disposition"]).toContain(encodeURIComponent("หลักฐาน.png"));
  });

  it("API-ATT-06: soft removal validates reason (5-200 chars) and records audit metadata", async () => {
    // 1. Invalid reason: too short (< 5 chars)
    const shortRes = await request(app)
      .delete(`/api/attachments/${createdAttachmentId}`)
      .set("x-requester-id", String(requesterAId))
      .send({ reason: "bad" });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error.code).toBe("VALIDATION_ERROR");

    // 2. Invalid reason: missing
    const missingRes = await request(app)
      .delete(`/api/attachments/${createdAttachmentId}`)
      .set("x-requester-id", String(requesterAId))
      .send({});

    expect(missingRes.status).toBe(400);

    // 3. Valid reason (5-200 chars)
    const validReason = "The photo is blurry and does not show the leak clearly.";
    const removeRes = await request(app)
      .delete(`/api/attachments/${createdAttachmentId}`)
      .set("x-requester-id", String(requesterAId))
      .send({ reason: `  ${validReason}  ` });

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.id).toBe(createdAttachmentId);
    expect(removeRes.body.data.isRemoved).toBe(true);
    expect(removeRes.body.data.removalReason).toBe(validReason);
    expect(removeRes.body.data.removedAt).toBeDefined();

    // Verify stored record in DB
    const updated = await db.attachment.findUniqueOrThrow({ where: { id: createdAttachmentId } });
    expect(updated.isRemoved).toBe(true);
    expect(updated.removalReason).toBe(validReason);
    expect(updated.removedByRequesterId).toBe(requesterAId);

    // Audit retention check: binary file is NOT deleted from disk
    expect(await attachmentStorage.exists(updated.storedName)).toBe(true);
  });

  it("API-ATT-07: removed attachment blocks preview/download with 410 and repeated removal with 409", async () => {
    // 1. Preview returns 410
    const previewRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/preview`)
      .set("x-requester-id", String(requesterAId));

    expect(previewRes.status).toBe(410);
    expect(previewRes.body.error.code).toBe("ATTACHMENT_REMOVED");

    // 2. Download returns 410
    const downloadRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/download`)
      .set("x-requester-id", String(requesterAId));

    expect(downloadRes.status).toBe(410);
    expect(downloadRes.body.error.code).toBe("ATTACHMENT_REMOVED");

    // 3. Repeated removal returns 409 ATTACHMENT_ALREADY_REMOVED
    const repeatRes = await request(app)
      .delete(`/api/attachments/${createdAttachmentId}`)
      .set("x-requester-id", String(requesterAId))
      .send({ reason: "Attempting duplicate removal" });

    expect(repeatRes.status).toBe(409);
    expect(repeatRes.body.error.code).toBe("ATTACHMENT_ALREADY_REMOVED");

    // Original audit reason unchanged
    const record = await db.attachment.findUniqueOrThrow({ where: { id: createdAttachmentId } });
    expect(record.removalReason).toBe("The photo is blurry and does not show the leak clearly.");

    // 4. Concurrency protection: create a fresh active attachment and attempt simultaneous removal
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const freshRes = await request(app)
      .post(`/api/tickets/${ticketBId}/attachments`)
      .set("x-requester-id", String(requesterBId))
      .attach("attachments", pngBuffer, "concurrent-test.png");

    const freshAttId = freshRes.body.data[0].id;

    // Send two removal requests concurrently
    const [c1, c2] = await Promise.all([
      request(app)
        .delete(`/api/attachments/${freshAttId}`)
        .set("x-requester-id", String(requesterBId))
        .send({ reason: "First concurrent removal attempt" }),
      request(app)
        .delete(`/api/attachments/${freshAttId}`)
        .set("x-requester-id", String(requesterBId))
        .send({ reason: "Second concurrent removal attempt" }),
    ]);

    const statuses = [c1.status, c2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const failedRes = c1.status === 409 ? c1 : c2;
    expect(failedRes.body.error.code).toBe("ATTACHMENT_ALREADY_REMOVED");
  });

  it("API-ATT-08: cross-requester attachment operations return safe 404 without disclosure", async () => {
    // Requester B attempting operations on Requester A's attachment
    // 1. Preview
    const prevRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/preview`)
      .set("x-requester-id", String(requesterBId));
    expect(prevRes.status).toBe(404);
    expect(prevRes.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // 2. Download
    const downRes = await request(app)
      .get(`/api/attachments/${createdAttachmentId}/download`)
      .set("x-requester-id", String(requesterBId));
    expect(downRes.status).toBe(404);
    expect(downRes.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // 3. Delete
    const delRes = await request(app)
      .delete(`/api/attachments/${createdAttachmentId}`)
      .set("x-requester-id", String(requesterBId))
      .send({ reason: "Unauthorized attempt" });
    expect(delRes.status).toBe(404);
    expect(delRes.body.error.code).toBe("ATTACHMENT_NOT_FOUND");

    // 4. Upload to Requester A's ticket
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const uploadRes = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("x-requester-id", String(requesterBId))
      .attach("attachments", pngBuffer, "hacker.png");
    expect(uploadRes.status).toBe(404);
    expect(uploadRes.body.error.code).toBe("TICKET_NOT_FOUND");
  });
});
