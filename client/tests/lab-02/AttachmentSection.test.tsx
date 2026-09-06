import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection from "../../src/AttachmentSection.js";
import * as api from "../../src/api.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requester: api.Requester = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer@example.com",
  department: "Marketing",
  isActive: true,
};

const activeAttachment: api.AttachmentItem = {
  id: 101,
  originalName: "system_architecture.png",
  mimeType: "image/png",
  sizeBytes: 204800,
  isRemoved: false,
  removedAt: null,
  removalReason: null,
  createdAt: "2026-09-04T10:00:00.000Z",
};

const removedAttachment: api.AttachmentItem = {
  id: 102,
  originalName: "confidential_spec.pdf",
  mimeType: "application/pdf",
  sizeBytes: 512000,
  isRemoved: true,
  removedAt: "2026-09-04T11:00:00.000Z",
  removalReason: "Uploaded wrong document version containing confidential draft data.",
  createdAt: "2026-09-04T09:00:00.000Z",
};

function renderAttachments(
  initialAttachments: api.AttachmentItem[] = [activeAttachment],
  ticketId = 42
) {
  sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  return render(
    <RequesterProvider>
      <AttachmentSection
        ticketId={ticketId}
        initialAttachments={initialAttachments}
      />
    </RequesterProvider>
  );
}

describe("AttachmentSection", () => {
  let mockWindow: { location: { href: string }; document: { title: string }; close: ReturnType<typeof vi.fn>; closed: boolean };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "getAttachmentPreviewUrl").mockImplementation(
      (id) => `/api/attachments/${id}/preview`
    );
    vi.spyOn(api, "getAttachmentDownloadUrl").mockImplementation(
      (id) => `/api/attachments/${id}/download`
    );
    vi.spyOn(api, "previewAttachmentFile").mockResolvedValue({
      blob: new Blob(["preview"], { type: "image/png" }),
      contentType: "image/png",
    });
    vi.spyOn(api, "downloadAttachmentFile").mockResolvedValue({
      blob: new Blob(["download"], { type: "image/png" }),
      contentType: "image/png",
    });
    mockWindow = {
      location: { href: "" },
      document: { title: "" },
      close: vi.fn(),
      closed: false,
    };
    window.open = vi.fn().mockReturnValue(mockWindow);
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-blob");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  describe("UI-ATT-02: Active Attachments Rendering & Actions", () => {
    it("renders active attachments with preview, download, and remove actions", async () => {
      renderAttachments([activeAttachment]);

      expect(await screen.findByText(/system_architecture\.png/)).toBeInTheDocument();
      expect(screen.getByText(/200\.0 KB/)).toBeInTheDocument();

      // Preview button
      const previewBtn = screen.getByRole("button", { name: /preview/i });
      expect(previewBtn).toBeInTheDocument();
      await userEvent.click(previewBtn);
      expect(api.previewAttachmentFile).toHaveBeenCalledWith(1, 101);
      expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
      expect(mockWindow.location.href).toBe("blob:http://localhost/test-blob");

      // Download button
      const downloadBtn = screen.getByRole("button", { name: /download/i });
      expect(downloadBtn).toBeInTheDocument();
      await userEvent.click(downloadBtn);
      expect(api.downloadAttachmentFile).toHaveBeenCalledWith(1, 101);

      // Remove button
      const removeBtn = screen.getByRole("button", { name: "Remove" });
      expect(removeBtn).toBeInTheDocument();
    });

    it("displays friendly warning message when popup blocker blocks preview window", async () => {
      window.open = vi.fn().mockReturnValue(null);
      renderAttachments([activeAttachment]);

      const previewBtn = await screen.findByRole("button", { name: /preview/i });
      await userEvent.click(previewBtn);

      expect(
        await screen.findByText(/pop-up was blocked by browser/i)
      ).toBeInTheDocument();
    });
  });

  describe("UI-ATT-03: Upload Restrictions & Active Limit", () => {
    it("renders file upload input with proper restrictions and limits", async () => {
      renderAttachments([activeAttachment]);

      const fileInput = await screen.findByLabelText(/choose files to attach/i);
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute("multiple");
      expect(fileInput).not.toBeDisabled();
      expect(screen.getByText(/1 of 5 active files/)).toBeInTheDocument();
    });

    it("enforces max 5 active attachments limit by disabling upload input", async () => {
      const fiveActive: api.AttachmentItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: 200 + i,
        originalName: `file_${i + 1}.png`,
        mimeType: "image/png",
        sizeBytes: 10000,
        isRemoved: false,
        removedAt: null,
        removalReason: null,
        createdAt: "2026-09-04T10:00:00.000Z",
      }));

      renderAttachments(fiveActive);

      expect(await screen.findByText(/5 of 5 active files/)).toBeInTheDocument();
      expect(
        screen.getByText(/Maximum limit of 5 active attachments has been reached/i)
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/choose files to attach/i)).not.toBeInTheDocument();
    });

    it("rejects oversized or invalid file types before sending upload request", async () => {
      const user = userEvent.setup();
      const uploadSpy = vi.spyOn(api, "uploadAttachmentsToTicket");
      renderAttachments([]);

      const fileInput = (await screen.findByLabelText(/choose files to attach/i)) as HTMLInputElement;

      // Create an oversized file (6 MB)
      const hugeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], "oversized.png", {
        type: "image/png",
      });
      await user.upload(fileInput, hugeFile);

      expect(
        await screen.findByText(/exceeds the 5 MiB size limit/i)
      ).toBeInTheDocument();
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it("rejects mismatched file extension and MIME type before sending upload request", async () => {
      const user = userEvent.setup();
      const uploadSpy = vi.spyOn(api, "uploadAttachmentsToTicket");
      renderAttachments([]);

      const fileInput = (await screen.findByLabelText(/choose files to attach/i)) as HTMLInputElement;

      const mismatchedFile = new File(["fake-pdf"], "test.png", {
        type: "application/pdf",
      });
      await user.upload(fileInput, mismatchedFile);

      expect(
        await screen.findByText(/file type does not match its extension/i)
      ).toBeInTheDocument();
      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });

  describe("UI-ATT-04: Removal Dialog & Reason Validation", () => {
    it("opens removal dialog with focus on textarea and validates reason length (5-200 chars)", async () => {
      const user = userEvent.setup();
      const removeSpy = vi.spyOn(api, "removeAttachment");
      renderAttachments([activeAttachment]);

      const removeBtn = await screen.findByRole("button", { name: "Remove" });
      await user.click(removeBtn);

      // Dialog opens
      const dialog = screen.getByRole("dialog", { name: "Remove Attachment" });
      expect(dialog).toBeInTheDocument();

      const reasonInput = screen.getByRole("textbox", { name: /removal reason/i });
      expect(reasonInput).toHaveFocus();

      // Submit with empty reason
      const confirmBtn = screen.getByRole("button", { name: "Remove Attachment" });
      await user.click(confirmBtn);

      expect(
        await screen.findByText("Removal reason must be between 5 and 200 characters.")
      ).toBeInTheDocument();
      expect(removeSpy).not.toHaveBeenCalled();

      // Submit with whitespace only
      await user.type(reasonInput, "    ");
      await user.click(confirmBtn);
      expect(
        screen.getByText("Removal reason must be between 5 and 200 characters.")
      ).toBeInTheDocument();
      expect(removeSpy).not.toHaveBeenCalled();

      // Close via Cancel
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelBtn);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  describe("UI-ATT-05: Successful Removal & Audit State", () => {
    it("submits valid removal reason, updates UI to audit state, and blocks download/preview", async () => {
      const user = userEvent.setup();
      const removedResult: api.AttachmentItem = {
        ...activeAttachment,
        isRemoved: true,
        removedAt: "2026-09-04T11:30:00.000Z",
        removalReason: "File contained outdated credentials and had to be purged.",
      };

      vi.spyOn(api, "removeAttachment").mockResolvedValue({ data: removedResult });
      vi.spyOn(api, "getTicketAttachments").mockResolvedValue({
        data: [removedResult],
        activeCount: 0,
        activeLimit: 5,
      });

      renderAttachments([activeAttachment]);

      const removeBtn = await screen.findByRole("button", { name: "Remove" });
      await user.click(removeBtn);

      const reasonInput = screen.getByRole("textbox", { name: /removal reason/i });
      await user.type(
        reasonInput,
        "File contained outdated credentials and had to be purged."
      );

      const confirmBtn = screen.getByRole("button", { name: "Remove Attachment" });
      await user.click(confirmBtn);

      expect(api.removeAttachment).toHaveBeenCalledWith(
        1,
        101,
        "File contained outdated credentials and had to be purged."
      );

      // Active list now empty
      expect(await screen.findByText(/No active attachments/i)).toBeInTheDocument();

      // Moved to Removed Attachments section
      expect(screen.getByRole("heading", { name: "Removed Attachments" })).toBeInTheDocument();
      expect(screen.getByText("Removed")).toBeInTheDocument();
      expect(
        screen.getByText("File contained outdated credentials and had to be purged.")
      ).toBeInTheDocument();

      // Preview/Download are not available for removed files
      expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
      expect(screen.getByText("Unavailable")).toBeInTheDocument();
    });
  });

  describe("UI-ATT-06: Focus Management & Keyboard Trap", () => {
    it("restores focus to trigger button when removal dialog is closed via Cancel or Escape", async () => {
      const user = userEvent.setup();
      renderAttachments([activeAttachment]);

      const removeBtn = await screen.findByRole("button", { name: "Remove" });
      await user.click(removeBtn);

      const reasonInput = screen.getByRole("textbox", { name: /removal reason/i });
      expect(reasonInput).toHaveFocus();

      // Press Escape to cancel
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(removeBtn).toHaveFocus();
    });

    it("traps focus inside dialog on Shift+Tab and Tab cycling", async () => {
      const user = userEvent.setup();
      renderAttachments([activeAttachment]);

      const removeBtn = await screen.findByRole("button", { name: "Remove" });
      await user.click(removeBtn);

      const reasonInput = screen.getByRole("textbox", { name: /removal reason/i });
      const confirmBtn = screen.getByRole("button", { name: "Remove Attachment" });
      expect(reasonInput).toHaveFocus();

      // Press Shift+Tab on first element -> cycles to last element (confirm button)
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(confirmBtn).toHaveFocus();

      // Press Tab on last element -> cycles back to first element (textarea)
      await user.keyboard("{Tab}");
      expect(reasonInput).toHaveFocus();
    });
  });

  describe("UI-ATT-07: Decoupled Refresh Failure & Retry", () => {
    it("shows success message and retry banner when upload succeeds but list refresh fails", async () => {
      const user = userEvent.setup();
      vi.spyOn(api, "uploadAttachmentsToTicket").mockResolvedValue({
        data: [activeAttachment],
        activeCount: 1,
        activeLimit: 5,
      });
      vi.spyOn(api, "getTicketAttachments")
        .mockRejectedValueOnce(new Error("Network glitch"))
        .mockResolvedValueOnce({
          data: [activeAttachment],
          activeCount: 1,
          activeLimit: 5,
        });

      renderAttachments([]);
      const fileInput = (await screen.findByLabelText(/choose files to attach/i)) as HTMLInputElement;

      const validFile = new File(["valid-content"], "valid.png", { type: "image/png" });
      await user.upload(fileInput, validFile);

      expect(await screen.findByText(/uploaded 1 file\(s\) successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/attachment list could not be refreshed/i)).toBeInTheDocument();

      // Click retry refresh button
      const retryBtn = screen.getByRole("button", { name: /retry refresh/i });
      await user.click(retryBtn);

      expect(screen.queryByText(/attachment list could not be refreshed/i)).not.toBeInTheDocument();
    });

    it("updates local state immediately on successful deletion even when list refresh fails", async () => {
      const user = userEvent.setup();
      const removedResult: api.AttachmentItem = {
        ...activeAttachment,
        isRemoved: true,
        removedAt: "2026-09-04T12:00:00.000Z",
        removalReason: "Unneeded duplicate file.",
      };

      vi.spyOn(api, "removeAttachment").mockResolvedValue({ data: removedResult });
      vi.spyOn(api, "getTicketAttachments")
        .mockRejectedValueOnce(new Error("Refresh network error"))
        .mockResolvedValueOnce({
          data: [removedResult],
          activeCount: 0,
          activeLimit: 5,
        });

      renderAttachments([activeAttachment]);

      const removeBtn = await screen.findByRole("button", { name: "Remove" });
      await user.click(removeBtn);

      const reasonInput = screen.getByRole("textbox", { name: /removal reason/i });
      await user.type(reasonInput, "Unneeded duplicate file.");

      const confirmBtn = screen.getByRole("button", { name: "Remove Attachment" });
      await user.click(confirmBtn);

      // File must be marked removed immediately: active count is 0
      expect(await screen.findByText(/0 of 5 active files/i)).toBeInTheDocument();
      expect(screen.getByText(/No active attachments/i)).toBeInTheDocument();

      // Moved to removed list
      expect(screen.getByRole("heading", { name: "Removed Attachments" })).toBeInTheDocument();
      expect(screen.getByText("Removed")).toBeInTheDocument();

      // Refresh error banner with retry button is visible
      expect(
        screen.getByText(/attachment was removed, but the attachment list could not be refreshed/i)
      ).toBeInTheDocument();
      const retryBtn = screen.getByRole("button", { name: /retry refresh/i });
      expect(retryBtn).toBeInTheDocument();

      // Retry refresh clears error banner
      await user.click(retryBtn);
      expect(
        screen.queryByText(/attachment was removed, but the attachment list could not be refreshed/i)
      ).not.toBeInTheDocument();
    });
  });
});
