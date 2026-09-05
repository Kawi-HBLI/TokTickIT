// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateTicket from "../../src/CreateTicket.js";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requester: api.Requester = {
  id: 1,
  name: "Amina Rahman",
  email: "amina.rahman@toktickit.local",
  department: "Academic Affairs",
  isActive: true,
};

describe("UI-A11Y-01: Accessibility Attributes, Labels, and Semantic Focus Checks", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    vi.restoreAllMocks();
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Account and Access" }]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 1, name: "Email", description: "Email system" }]);
  });

  it("associates labels, aria-invalid, and error descriptions with form controls", async () => {
    const user = userEvent.setup();
    render(
      <RequesterProvider>
        <CreateTicket onDirtyChange={vi.fn()} onBusyChange={vi.fn()} onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const summaryInput = screen.getByLabelText(/Summary/i);
    expect(summaryInput).toHaveAttribute("aria-describedby", "summary-count summary-error");
    expect(summaryInput).toHaveAttribute("aria-invalid", "false");

    // Click submit to trigger validation
    const submitBtn = screen.getByRole("button", { name: "Submit Ticket" });
    await user.click(submitBtn);

    // After validation failure, aria-invalid becomes true
    expect(summaryInput).toHaveAttribute("aria-invalid", "true");
    const summaryError = screen.getByText("Summary must be 5 to 100 characters after trimming.");
    expect(summaryError).toHaveAttribute("id", "summary-error");
  });

  it("provides polite live regions for dynamic counters and status announcements", async () => {
    const user = userEvent.setup();
    render(
      <RequesterProvider>
        <CreateTicket onDirtyChange={vi.fn()} onBusyChange={vi.fn()} onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("0 of 5 files")).toBeInTheDocument();
    });

    const fileCount = screen.getByText("0 of 5 files");
    expect(fileCount).toHaveAttribute("aria-live", "polite");

    const summaryInput = screen.getByLabelText(/Summary/i);
    await user.type(summaryInput, "Network login issue");

    const summaryCount = screen.getByText("19 of 100 characters");
    expect(summaryCount).toHaveAttribute("id", "summary-count");
  });

  it("provides accessible modal dialog semantics with aria-modal and aria-labelledby", async () => {
    const sampleTicket: api.TicketDetail = {
      id: 1,
      ticketNumber: "TKT-2026-00001",
      ticketDate: "2026-09-04T10:00:00.000Z",
      currentStatus: "NEW",
      requestedPriority: "MEDIUM",
      itPriority: null,
      ticketOwner: null,
      summary: "Sample Ticket",
      description: "Detailed description of the issue.",
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:15:00.000Z",
      requester,
      category: { id: 1, name: "Account and Access" },
      relatedSystem: { id: 1, name: "Email" },
      attachments: [
        {
          id: 5,
          originalName: "report.pdf",
          sizeBytes: 1024,
          mimeType: "application/pdf",
          isRemoved: false,
          createdAt: "2026-09-04T10:05:00.000Z",
        },
      ],
    };

    vi.spyOn(api, "getTicketDetail").mockResolvedValue(sampleTicket);
    const user = userEvent.setup();

    render(
      <RequesterProvider>
        <RequesterTicketDetail ticketId={1} onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00001")).toBeInTheDocument();
    });

    // Click remove button to open dialog
    const removeBtn = screen.getByRole("button", { name: "Remove" });
    await user.click(removeBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "removal-dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "removal-dialog-desc");
  });
});
