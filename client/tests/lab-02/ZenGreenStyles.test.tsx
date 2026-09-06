// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import MyTickets from "../../src/MyTickets.js";
import * as api from "../../src/api.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requester: api.Requester = {
  id: 1,
  name: "Amina Rahman",
  email: "amina.rahman@toktickit.local",
  department: "Academic Affairs",
  isActive: true,
};

const sampleTicket: api.TicketDetail = {
  id: 1,
  ticketNumber: "TKT-2026-00001",
  ticketDate: "2026-09-04T10:00:00.000Z",
  currentStatus: "NEW",
  requestedPriority: "HIGH",
  itPriority: null,
  ticketOwner: null,
  summary: "Email synchronization failure",
  description: "Unable to receive external emails in inbox.",
  createdAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:15:00.000Z",
  requester: {
    id: 1,
    name: "Amina Rahman",
    email: "amina.rahman@toktickit.local",
    department: "Academic Affairs",
  },
  category: { id: 1, name: "Account and Access" },
  relatedSystem: { id: 1, name: "Email" },
  attachments: [
    {
      id: 10,
      originalName: "error.png",
      sizeBytes: 2048,
      mimeType: "image/png",
      isRemoved: false,
      createdAt: "2026-09-04T10:05:00.000Z",
    },
    {
      id: 11,
      originalName: "old_log.txt",
      sizeBytes: 1024,
      mimeType: "text/plain",
      isRemoved: true,
      removalReason: "Obsolete log",
      removedAt: "2026-09-04T10:10:00.000Z",
      createdAt: "2026-09-04T10:01:00.000Z",
    },
  ],
};

describe("UI-STYLE-01: Zen Green Styles and Responsive Design Tokens", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    vi.restoreAllMocks();
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(sampleTicket);
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Account and Access" }]);
    vi.spyOn(api, "getMyTickets").mockResolvedValue({
      data: [
        {
          id: 1,
          ticketNumber: "TKT-2026-00001",
          summary: "Email synchronization failure",
          requestedPriority: "HIGH",
          currentStatus: "NEW",
          createdAt: "2026-09-04T10:00:00.000Z",
          updatedAt: "2026-09-04T10:15:00.000Z",
          category: { id: 1, name: "Account and Access" },
          relatedSystem: { id: 1, name: "Email" },
          activeAttachmentCount: 1,
        },
      ],
      pagination: { page: 1, pageSize: 10, totalPages: 1, totalItems: 1, hasPreviousPage: false, hasNextPage: false },
      query: { search: "", categoryId: null, requestedPriority: null, sortBy: "updatedAt", sortOrder: "desc" },
    });
  });

  it("applies status and priority badge classes with distinct styling", async () => {
    render(
      <RequesterProvider>
        <RequesterTicketDetail ticketId={1} onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00001")).toBeInTheDocument();
    });

    const statusBadge = screen.getByText("NEW");
    expect(statusBadge).toHaveClass("status-badge", "status-new");

    const priorityBadge = screen.getByText("HIGH Priority");
    expect(priorityBadge).toHaveClass("priority-badge", "priority-high");

    const removedBadge = screen.getByText("Removed");
    expect(removedBadge).toHaveClass("status-badge", "status-removed");
  });

  it("renders both desktop table and mobile card views for responsive display", async () => {
    const { container } = render(
      <RequesterProvider>
        <MyTickets onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Email synchronization failure").length).toBeGreaterThan(0);
    });

    // Desktop table container exists
    expect(container.querySelector(".ticket-table-container")).toBeInTheDocument();
    expect(container.querySelector(".ticket-table")).toBeInTheDocument();

    // Mobile card list container exists
    expect(container.querySelector(".ticket-card-list")).toBeInTheDocument();
    expect(container.querySelector(".mobile-ticket-card")).toBeInTheDocument();
  });

  it("renders read-only layout structures and distinct button variants", async () => {
    const { container } = render(
      <RequesterProvider>
        <RequesterTicketDetail ticketId={1} onNavigate={vi.fn()} />
      </RequesterProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00001")).toBeInTheDocument();
    });

    // Readonly grid sections
    expect(container.querySelector(".readonly-summary-grid")).toBeInTheDocument();
    expect(container.querySelector(".problem-details")).toBeInTheDocument();

    // Secondary / outline button
    const previewBtn = screen.getByRole("button", { name: "Preview error.png" });
    expect(previewBtn).toHaveClass("btn", "btn-outline-secondary");

    // Danger / destructive button
    const removeBtn = screen.getByRole("button", { name: "Remove" });
    expect(removeBtn).toHaveClass("btn", "btn-outline-danger");
  });
});
