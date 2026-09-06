import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readdir, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { app } from "../../src/app.js";
import * as prismaModule from "../../src/prisma.js";
import { attachmentStorage } from "../../src/attachment-storage.js";
import { seedDatabase } from "../../prisma/seed.js";

const schemaName = `lab2_create_test_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient();
let db: PrismaClient;
let uploadDir: string;
let requesterId: number;
let otherId: number;
let inactiveId: number;
let categoryId: number;
let relatedSystemId: number;
let inactiveCategory: number;
let inactiveSystem: number;
const previousUploadDir = process.env.UPLOAD_DIR;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schemaName);
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8", timeout: 30000,
  });
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await seedDatabase(db);
  const active = await db.requesterUser.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  requesterId = active[0].id; otherId = active[1].id;
  inactiveId = (await db.requesterUser.findFirstOrThrow({ where: { isActive: false } })).id;
  categoryId = (await db.category.findFirstOrThrow()).id;
  relatedSystemId = (await db.relatedSystem.findFirstOrThrow()).id;
  inactiveCategory = (await db.category.create({ data: { id: 1001, name: "Inactive test category", isActive: false } })).id;
  inactiveSystem = (await db.relatedSystem.create({ data: { id: 1001, name: "Inactive test system", isActive: false } })).id;
  uploadDir = await mkdtemp(join(tmpdir(), "toktickit-create-"));
  process.env.UPLOAD_DIR = uploadDir;
}, 40000);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(prismaModule, "getPrisma").mockReturnValue(db);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previousUploadDir;
  await db?.$disconnect();
  if (!/^lab2_create_test_[a-f0-9]{32}$/.test(schemaName)) throw new Error("Unsafe schema cleanup");
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
  // The suite only deletes files inside its own mkdtemp directory; no recursive deletion.
  if (uploadDir && resolve(uploadDir).startsWith(resolve(tmpdir()) + "\\toktickit-create-")) {
    for (const file of await readdir(uploadDir)) await unlink(join(uploadDir, file));
    await rmdir(uploadDir);
  }
});

function post(key: string = randomUUID(), changes: Record<string, string> = {}, owner = requesterId) {
  const values = { categoryId: String(categoryId), relatedSystemId: String(relatedSystemId),
    summary: "Cannot access email", description: "The email service shows an error every morning.",
    requestedPriority: "MEDIUM", ...changes };
  let call = request(app).post("/api/tickets").set("x-requester-id", String(owner)).set("Idempotency-Key", key);
  for (const [field, value] of Object.entries(values)) call = call.field(field, value);
  return call;
}
const pdf = Buffer.from("%PDF-1.4\nfixture content");

describe("Create Ticket API", () => {
  it("creates a ticket with server-generated values", async () => {
    const key = randomUUID();
    const response = await post(key, { summary: "  Cannot access email  " });
    expect(response.status).toBe(201);
    expect(response.body.data.currentStatus).toBe("NEW");
    expect(response.body.data.ticketNumber).toMatch(/^TKT-\d{4}-\d{5,}$/);
    expect(response.body.data.ticketDate).toBe(response.body.data.createdAt);
    expect(response.body.data).toMatchObject({ requesterId, summary: "Cannot access email", itPriority: null, ticketOwner: null });
    expect(await db.ticket.count({ where: { requesterId, idempotencyKey: key } })).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(/creationFingerprint|creationResponse|idempotencyKey|storedName/);
  });

  it("replays concurrent identical requests and rejects changed payloads", async () => {
    const key = randomUUID();
    const responses = await Promise.all([post(key), post(key), post(key)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(responses.map(r => r.body.data.id)).size).toBe(1);
    for (const r of responses.filter(r => r.status === 200)) expect(r.headers["idempotency-replayed"]).toBe("true");
    expect((await post(key, { summary: " Different payload " })).status).toBe(409);
    expect((await post(key, {}, otherId)).status).toBe(201);
    expect(await db.ticket.count({ where: { requesterId, idempotencyKey: key } })).toBe(1);
  });

  it.each([
    ["summary", "    "], ["summary", "x".repeat(101)], ["description", "short"],
    ["description", "x".repeat(2001)], ["categoryId", "1x"], ["relatedSystemId", "0"],
    ["requestedPriority", "medium"],
  ])("rejects invalid %s without a Ticket", async (field, value) => {
    const key = randomUUID();
    const response = await post(key, { [field]: value });
    expect(response.status).toBe(400);
    expect(response.body.error.fields).toContainEqual(expect.objectContaining({ field }));
    expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it("accepts exact text boundaries and rejects inactive references", async () => {
    for (const [summary, description] of [[5, 10], [100, 2000]])
      expect((await post(randomUUID(), { summary: "x".repeat(summary), description: "x".repeat(description) })).status).toBe(201);
    const inactiveFields: Record<string, string>[] = [{ categoryId: String(inactiveCategory) }, { relatedSystemId: String(inactiveSystem) }];
    for (const fields of inactiveFields) {
      const response = await post(randomUUID(), fields);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects unexpected server-controlled fields", async () => {
    const key = randomUUID();
    expect((await post(key, { requesterId: String(otherId) })).status).toBe(400);
    expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it("rejects malformed multipart data as a non-retryable validation error", async () => {
    const response = await request(app).post("/api/tickets")
      .set("x-requester-id", String(requesterId)).set("Idempotency-Key", randomUUID())
      .set("Content-Type", "multipart/form-data").send("missing boundary");
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR", retryable: false });
  });

  it("enforces requester and idempotency headers on the real create endpoint", async () => {
    for (const owner of [inactiveId, 2147483647]) {
      const response = await post(randomUUID(), {}, owner);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUESTER_CONTEXT");
    }
    const missing = await request(app).post("/api/tickets");
    expect(missing.body.error.code).toBe("REQUESTER_CONTEXT_REQUIRED");
    expect((await post("not-a-uuid")).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("stores files once, persists bytes, and detects changed content on retry", async () => {
    const key = randomUUID();
    const first = await post(key).attach("attachments", pdf, { filename: "report.pdf", contentType: "application/pdf" });
    expect(first.status).toBe(201);
    const record = await db.attachment.findFirstOrThrow({ where: { ticketId: first.body.data.id } });
    expect(await readFile(join(uploadDir, record.storedName))).toEqual(pdf);
    const replay = await post(key).attach("attachments", pdf, { filename: "report.pdf", contentType: "application/pdf" });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(await db.attachment.count({ where: { ticketId: record.ticketId } })).toBe(1);
    expect((await post(key).attach("attachments", Buffer.from("changed"), { filename: "report.pdf", contentType: "application/pdf" })).status).toBe(409);
  });

  it("rejects unsupported, MIME-mismatched, oversized, and six-file batches before creation", async () => {
    const scenarios = [
      { filename: "script.exe", contentType: "application/octet-stream", bytes: pdf, status: 415 },
      { filename: "image.png", contentType: "application/pdf", bytes: pdf, status: 415 },
      { filename: "large.pdf", contentType: "application/pdf", bytes: Buffer.alloc(5 * 1024 * 1024 + 1), status: 413 },
    ];
    for (const scenario of scenarios) {
      const key = randomUUID();
      const response = await post(key).attach("attachments", scenario.bytes, scenario);
      expect(response.status).toBe(scenario.status);
      expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
    }
    const key = randomUUID();
    let call = post(key);
    for (let i = 0; i < 6; i++) call = call.attach("attachments", pdf, { filename: `file${i}.pdf`, contentType: "application/pdf" });
    expect((await call).status).toBe(400);
    expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it("accepts exactly five files and exactly 5 MiB", async () => {
    let call = post();
    for (let i = 0; i < 5; i++) call = call.attach("attachments", i === 0 ? Buffer.alloc(5 * 1024 * 1024) : pdf,
      { filename: `boundary${i}.pdf`, contentType: "application/pdf" });
    const response = await call;
    expect(response.status).toBe(201);
    expect(response.body.data.attachments).toHaveLength(5);
  });

  it("preserves Ticket and successful files after a partial storage write failure, including replay", async () => {
    const write = attachmentStorage.write;
    vi.spyOn(attachmentStorage, "write").mockImplementationOnce(async (name, bytes) => {
      await write(name, bytes); throw new Error("private filesystem details");
    });
    const key = randomUUID();
    const submit = () => post(key)
      .attach("attachments", pdf, { filename: "failed.pdf", contentType: "application/pdf" })
      .attach("attachments", pdf, { filename: "saved.pdf", contentType: "application/pdf" });
    const response = await submit();
    expect(response.status).toBe(201);
    expect(response.body.data.attachments).toHaveLength(1);
    expect(response.body.warnings[0]).toMatchObject({ code: "ATTACHMENT_STORAGE_FAILED", filename: "failed.pdf" });
    const names = await readdir(uploadDir);
    const failedName = vi.mocked(attachmentStorage.write).mock.calls[0][0];
    expect(names).not.toContain(failedName);
    expect((await submit()).body).toEqual(response.body);
    expect(JSON.stringify(response.body)).not.toContain("private filesystem");
  });

  it("recovers a real attachment metadata failure using a savepoint", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_test_attachment() RETURNS trigger AS $$ BEGIN IF NEW."originalName" = 'metadata-failure.pdf' THEN RAISE EXCEPTION 'test metadata failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_test_attachment BEFORE INSERT ON "Attachment" FOR EACH ROW EXECUTE FUNCTION reject_test_attachment()`);
    try {
      const response = await post().attach("attachments", pdf, { filename: "metadata-failure.pdf", contentType: "application/pdf" });
      expect(response.status).toBe(201);
      expect(response.body.data.attachments).toEqual([]);
      expect(response.body.warnings[0].filename).toBe("metadata-failure.pdf");
      expect(await db.ticket.findUnique({ where: { id: response.body.data.id } })).not.toBeNull();
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER reject_test_attachment ON "Attachment"`); }
  });

  it("reports a safe database failure before creation", async () => {
    vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("private database detail"));
    const key = randomUUID();
    const response = await post(key);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("TICKET_CREATE_FAILED");
    expect(JSON.stringify(response.body)).not.toContain("private database");
    expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it("rolls back the Ticket and cleans files when saving the final receipt fails", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_test_receipt() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'private receipt failure'; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_test_receipt BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION reject_test_receipt()`);
    const before = (await readdir(uploadDir)).sort();
    const key = randomUUID();
    try {
      const response = await post(key).attach("attachments", pdf, { filename: "rollback.pdf", contentType: "application/pdf" });
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("TICKET_CREATE_FAILED");
      expect(await db.ticket.count({ where: { idempotencyKey: key } })).toBe(0);
      expect((await readdir(uploadDir)).sort()).toEqual(before);
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER reject_test_receipt ON "Ticket"`); }
  });

  it("returns only active category/system references in the documented envelopes", async () => {
    const categories = await request(app).get("/api/categories");
    const systems = await request(app).get("/api/related-systems");
    expect(categories.body.data).toHaveLength(4);
    expect(systems.body.data).toHaveLength(7);
    expect(categories.body.data.map((row: { id: number }) => row.id)).not.toContain(inactiveCategory);
    expect(systems.body.data.map((row: { id: number }) => row.id)).not.toContain(inactiveSystem);
    const names = systems.body.data.map((row: { name: string }) => row.name);
    expect(names).toEqual([...names].sort());
    vi.spyOn(db.relatedSystem, "findMany").mockRejectedValueOnce(new Error("internal"));
    const error = await request(app).get("/api/related-systems");
    expect(error.status).toBe(500);
    expect(error.body.error).toMatchObject({ code: "REFERENCE_DATA_UNAVAILABLE", retryable: true });
  });
});
