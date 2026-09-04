import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requester: api.Requester = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer@example.com",
  department: "Marketing",
  isActive: true,
};

const sampleTicket: api.TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-00042",
  ticketDate: "2026-09-04T10:00:00.000Z",
  currentStatus: "NEW",
  requestedPriority: "HIGH",
  itPriority: null,
  ticketOwner: null,
  summary: "VPN authentication timeout error",
  description: "Unable to connect to the corporate VPN gateway from remote office.",
  createdAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:15:00.000Z",
  requester: {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer@example.com",
    department: "Marketing",
  },
  category: {
    id: 2,
    name: "Network & VPN",
  },
  relatedSystem: {
    id: 8,
    name: "Corporate VPN",
  },
  attachments: [
    {
      id: 10,
      originalName: "vpn_error.png",
      mimeType: "image/png",
      sizeBytes: 102400,
      isRemoved: false,
      removedAt: null,
      removalReason: null,
      createdAt: "2026-09-04T10:05:00.000Z",
    },
  ],
};

function renderDetail(ticketId = 42, onNavigate = vi.fn()) {
  sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  return {
    ...render(
      <RequesterProvider>
        <RequesterTicketDetail ticketId={ticketId} onNavigate={onNavigate} />
      </RequesterProvider>
    ),
    onNavigate,
  };
}

describe("RequesterTicketDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(sampleTicket);
    vi.spyOn(api, "getTicketAttachments").mockResolvedValue({
      data: sampleTicket.attachments,
      activeCount: 1,
      activeLimit: 5,
    });
  });

  describe("UI-DETAIL-01: Read-Only Attribute Rendering", () => {
    it("renders all ticket attributes accurately in read-only format", async () => {
      renderDetail(42);

      // Ticket number in heading
      expect(await screen.findByRole("heading", { name: "TKT-2026-00042" })).toBeInTheDocument();

      // Badges
      expect(screen.getByText("NEW")).toBeInTheDocument();
      expect(screen.getByText("HIGH Priority")).toBeInTheDocument();

      // Information definition list
      expect(screen.getByText("Jennifer Anderson")).toBeInTheDocument();
      expect(screen.getByText("jennifer@example.com")).toBeInTheDocument();
      expect(screen.getByText("Network & VPN")).toBeInTheDocument();
      expect(screen.getByText("Corporate VPN")).toBeInTheDocument();

      // Summary and description
      expect(screen.getByText("VPN authentication timeout error")).toBeInTheDocument();
      expect(
        screen.getByText("Unable to connect to the corporate VPN gateway from remote office.")
      ).toBeInTheDocument();

      // Unassigned staff fields rendered gracefully
      const unassignedElements = screen.getAllByText("Unassigned");
      expect(unassignedElements.length).toBeGreaterThanOrEqual(2);
    });

    it("navigates back to My Tickets when back button is clicked", async () => {
      const user = userEvent.setup();
      const { onNavigate } = renderDetail(42);

      await screen.findByRole("heading", { name: "TKT-2026-00042" });
      const backBtn = screen.getByRole("button", { name: /back to my tickets/i });
      await user.click(backBtn);

      expect(onNavigate).toHaveBeenCalledWith("/tickets");
    });
  });

  describe("UI-DETAIL-02: Error and Not Found States", () => {
    it("shows friendly 404 state when ticket does not exist or belongs to another requester", async () => {
      const notFoundError = new api.ApiError("Ticket not found", 404, "TICKET_NOT_FOUND");
      vi.spyOn(api, "getTicketDetail").mockRejectedValue(notFoundError);

      const { onNavigate } = renderDetail(999);

      expect(await screen.findByRole("heading", { name: /ticket not found/i })).toBeInTheDocument();
      expect(
        screen.getByText(/could not be found or is not accessible under your current Requester/i)
      ).toBeInTheDocument();

      // Provides Back to My Tickets navigation
      const backBtn = screen.getByRole("button", { name: "Back to My Tickets" });
      await userEvent.setup().click(backBtn);
      expect(onNavigate).toHaveBeenCalledWith("/tickets");
    });

    it("displays error with retry capability on server failure (500)", async () => {
      const user = userEvent.setup();
      const serverError = new api.ApiError("Database connection failed", 500, "TICKET_DETAIL_FAILED");
      const getDetailSpy = vi
        .spyOn(api, "getTicketDetail")
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(sampleTicket);

      renderDetail(42);

      expect(await screen.findByRole("heading", { name: /error loading ticket/i })).toBeInTheDocument();
      expect(screen.getByText("Database connection failed")).toBeInTheDocument();

      // Click retry
      const retryBtn = screen.getByRole("button", { name: "Retry" });
      await user.click(retryBtn);

      // Successfully recovers
      expect(await screen.findByRole("heading", { name: "TKT-2026-00042" })).toBeInTheDocument();
      expect(getDetailSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("UI-SCOPE-01: Scope Boundaries (Strict Read-Only)", () => {
    it("does not render any IT Staff controls, status changer, comment box, or internal notes", async () => {
      renderDetail(42);
      await screen.findByRole("heading", { name: "TKT-2026-00042" });

      // No status dropdowns or controls
      expect(screen.queryByLabelText(/change status/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();

      // No comment box or textarea (except removal dialog when opened)
      expect(screen.queryByLabelText(/comment/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/add a comment/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/internal notes/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/action taken/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /assign/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /resolve ticket/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /close ticket/i })).not.toBeInTheDocument();
    });
  });
});
