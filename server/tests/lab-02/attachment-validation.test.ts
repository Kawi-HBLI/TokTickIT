import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, safeFilename, validateFiles } from "../../src/attachment-storage.js";
function file(originalname: string, mimetype: string, size = 10) {
  return { originalname, mimetype, size, buffer: Buffer.from("test") } as Express.Multer.File;
}
describe("Attachment validation", () => {
  it.each([["JPG", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["pdf", "application/pdf"]])("accepts %s and its MIME at the limit", (extension, mime) => {
    expect(validateFiles([file(`report.${extension}`, mime, MAX_FILE_BYTES)])).toHaveLength(1);
  });
  it("strips both separator styles and control characters from display names", () => {
    expect(safeFilename("C:\\fakepath\\nested/report\u0000.pdf")).toBe("report.pdf");
    expect(validateFiles([file("../report.PDF", "application/pdf")])[0].extension).toBe(".pdf");
  });
  it("rejects unsupported and MIME-mismatched files", () => {
    expect(() => validateFiles([file("report.pdf", "image/png")])).toThrow();
    expect(() => validateFiles([file("image.svg", "image/svg+xml")])).toThrow();
  });
  it("accepts five and rejects six files or oversized files", () => {
    const value = file("report.pdf", "application/pdf");
    expect(validateFiles(Array(5).fill(value))).toHaveLength(5);
    expect(() => validateFiles(Array(6).fill(value))).toThrow();
    expect(() => validateFiles([file("report.pdf", "application/pdf", MAX_FILE_BYTES + 1)])).toThrow();
  });
});
