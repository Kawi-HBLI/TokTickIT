import { describe, expect, it } from "vitest";
import {
  validateInternalNoteContent,
  validatePublicCommentContent,
} from "../../src/ticket-workflow.js";

describe("UNIT-DISCUSSION-01: Discussion Validation", () => {
  describe("Public Comments validation", () => {
    it("accepts valid content between 1 and 2,000 characters and trims whitespace", () => {
      expect(validatePublicCommentContent("  A valid comment  ")).toBe("A valid comment");
      expect(validatePublicCommentContent("a")).toBe("a");
      const longComment = "x".repeat(2000);
      expect(validatePublicCommentContent(longComment)).toBe(longComment);
    });

    it("rejects empty or whitespace-only comments", () => {
      expect(() => validatePublicCommentContent("")).toThrow("Comment must contain 1 to 2,000 characters.");
      expect(() => validatePublicCommentContent("   \t\n  ")).toThrow("Comment must contain 1 to 2,000 characters.");
    });

    it("rejects comments exceeding 2,000 characters", () => {
      const tooLong = "x".repeat(2001);
      expect(() => validatePublicCommentContent(tooLong)).toThrow("Comment must contain 1 to 2,000 characters.");
    });

    it("rejects non-string values", () => {
      expect(() => validatePublicCommentContent(null)).toThrow("Comment must be text.");
      expect(() => validatePublicCommentContent(123)).toThrow("Comment must be text.");
      expect(() => validatePublicCommentContent({})).toThrow("Comment must be text.");
    });
  });

  describe("Internal Notes validation", () => {
    it("accepts valid content between 1 and 4,000 characters and trims whitespace", () => {
      expect(validateInternalNoteContent("  Internal note context  ")).toBe("Internal note context");
      expect(validateInternalNoteContent("n")).toBe("n");
      const longNote = "y".repeat(4000);
      expect(validateInternalNoteContent(longNote)).toBe(longNote);
    });

    it("rejects empty or whitespace-only internal notes", () => {
      expect(() => validateInternalNoteContent("")).toThrow("Internal note must contain 1 to 4,000 characters.");
      expect(() => validateInternalNoteContent("   \n\t  ")).toThrow("Internal note must contain 1 to 4,000 characters.");
    });

    it("rejects internal notes exceeding 4,000 characters", () => {
      const tooLong = "y".repeat(4001);
      expect(() => validateInternalNoteContent(tooLong)).toThrow("Internal note must contain 1 to 4,000 characters.");
    });

    it("rejects non-string values", () => {
      expect(() => validateInternalNoteContent(null)).toThrow("Internal note must be text.");
      expect(() => validateInternalNoteContent(undefined)).toThrow("Internal note must be text.");
      expect(() => validateInternalNoteContent({ note: "text" })).toThrow("Internal note must be text.");
    });
  });
});
