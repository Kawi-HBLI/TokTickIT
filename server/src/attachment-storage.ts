import { createHash } from "node:crypto";
import { access, mkdir, writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TicketError } from "./ticket-validation.js";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const types: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".pdf": "application/pdf",
};
export function decodeOriginalName(name: string): string {
  const hasOnlyLatin1 = /^[\x00-\xFF]*$/.test(name);
  const hasExtendedAscii = /[\x80-\xFF]/.test(name);
  if (hasOnlyLatin1 && hasExtendedAscii) {
    try {
      const decoded = Buffer.from(name, "latin1").toString("utf8");
      if (!decoded.includes("\ufffd")) {
        return decoded;
      }
    } catch {
      // ignore fallback
    }
  }
  return name;
}

export function safeFilename(name: string): string {
  const decoded = decodeOriginalName(name);
  return decoded.replaceAll("\\", "/").split("/").pop()!
    .replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240);
}

export function contentDispositionHeader(type: "inline" | "attachment", originalName: string): string {
  const safe = safeFilename(originalName);
  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "") || "attachment";
  const encoded = encodeURIComponent(safe);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
export function validateFiles(files: Express.Multer.File[], maxFiles = 5) {
  if (files.length > maxFiles) throw new TicketError(400, "VALIDATION_ERROR", `Select at most ${maxFiles} files.`,
    [{ field: "attachments", message: `Select at most ${maxFiles} files.` }]);
  return files.map(file => {
    const originalName = safeFilename(file.originalname);
    const extension = extname(originalName).toLowerCase();
    const field = [{ field: "attachments", message: `${originalName || "File"}: use JPG, PNG, WEBP, or PDF up to 5 MiB.` }];
    if (file.size > MAX_FILE_BYTES) throw new TicketError(413, "ATTACHMENT_TOO_LARGE", "A file exceeds 5 MiB.", field);
    if (!types[extension] || types[extension] !== file.mimetype)
      throw new TicketError(415, "UNSUPPORTED_ATTACHMENT_TYPE", "Unsupported or mismatched file type.", field);
    return { file, originalName, extension, digest: createHash("sha256").update(file.buffer).digest("hex") };
  });
}
// Never expose this private directory via express.static.
const defaultRoot = fileURLToPath(new URL("../uploads/", import.meta.url));
export function filePath(name: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|pdf)$/.test(name)) throw new Error("Invalid stored filename");
  return join(process.env.UPLOAD_DIR || defaultRoot, name);
}
export const attachmentStorage = {
  getPath(name: string) {
    return filePath(name);
  },
  async exists(name: string) {
    try {
      await access(filePath(name));
      return true;
    } catch {
      return false;
    }
  },
  async write(name: string, bytes: Buffer) {
    const path = filePath(name);
    await mkdir(process.env.UPLOAD_DIR || defaultRoot, { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
  },
  async remove(name: string) {
    try { await unlink(filePath(name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  },
};
