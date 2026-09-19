// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequesterTicketDetail from "../../src/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { RequesterProvider } from "../../src/RequesterContext.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    getTicketDetail: vi.fn(),
    fetchPublicComments: vi.fn(),
    createPublicComment: vi.fn(),
    indicateProblemResolved: vi.fn(),
  };
});

const currentUser: api.CurrentUser = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer@example.com",
  role: "REQUESTER",
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

const sampleTicket: api.TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-00042",
  ticketDate: "2026-09-04T10:00:00.000Z",
  currentStatus: "IN_PROGRESS",
  requestedPriority: "HIGH",
  itPriority: "HIGH",
  ticketOwner: "Staff Bob",
  summary: "VPN authentication timeout error",
  description: "Unable to connect to the corporate VPN gateway from remote office.",
  createdAt: "2026-09-04T10:00:00.000Z",
  updatedAt: "2026-09-04T10:15:00.000Z",
  requesterResolutionIndicatedAt: null,
  requesterResolutionIndicatedBy: null,
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
  attachments: [],
};

const sampleComments: api.PublicComment[] = [
  {
    id: 101,
    ticketId: 42,
    content: "Please check your credentials or reset your 2FA token.",
    createdAt: "2026-09-04T10:30:00.000Z",
    author: {
      id: 5,
      name: "Staff Bob",
      role: "IT_STAFF",
    },
  },
];

function renderDetail(ticketId = 42, onNavigate = vi.fn()) {
  return render(
    <RequesterProvider>
      <RequesterTicketDetail ticketId={ticketId} onNavigate={onNavigate} />
    </RequesterProvider>
  );
}

describe("UI-REQ-01: Requester Ticket Detail & Conversation Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentUser).mockResolvedValue({
      user: currentUser,
      csrfToken: "mock-csrf-token",
    });
    vi.mocked(api.getTicketDetail).mockResolvedValue(sampleTicket);
    vi.mocked(api.fetchPublicComments).mockResolvedValue({
      data: sampleComments,
      meta: { count: 1 },
    });
  });

  it("renders ticket details and the Conversation section with public comments", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Conversation" })).toBeInTheDocument();
    expect(screen.getByText("Please check your credentials or reset your 2FA token.")).toBeInTheDocument();
    expect(screen.getAllByText("Staff Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
  });

  it("proves Internal Notes never appear in Requester DOM or accessible tree", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/internal note/i)).not.toBeInTheDocument();
  });

  it("validates and posts a new public comment", async () => {
    const user = userEvent.setup();
    const newComment: api.PublicComment = {
      id: 102,
      ticketId: 42,
      content: "Resetting 2FA worked, thanks!",
      createdAt: "2026-09-04T10:45:00.000Z",
      author: {
        id: 1,
        name: "Jennifer Anderson",
        role: "REQUESTER",
      },
    };

    vi.mocked(api.createPublicComment).mockResolvedValue({ data: newComment });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText("Add a comment");
    const submitBtn = screen.getByRole("button", { name: "Post public comment" });

    // Try posting empty/whitespace comment
    await user.click(submitBtn);
    // Button is disabled when text is empty
    expect(api.createPublicComment).not.toHaveBeenCalled();

    // Type valid comment
    await user.type(textarea, "Resetting 2FA worked, thanks!");
    expect(screen.getByText(/29 \/ 2000 characters/)).toBeInTheDocument();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.createPublicComment).toHaveBeenCalledWith(42, "Resetting 2FA worked, thanks!");
      expect(screen.getByText("Resetting 2FA worked, thanks!")).toBeInTheDocument();
      expect(screen.getByText("Your comment has been posted.")).toBeInTheDocument();
    });

    expect(textarea).toHaveValue("");
  });

  it("retains typed comment draft when posting fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPublicComment).mockRejectedValue(
      new api.ApiError("Service temporarily unavailable", 500, "SERVER_ERROR")
    );

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText("Add a comment");
    const submitBtn = screen.getByRole("button", { name: "Post public comment" });

    await user.type(textarea, "Draft comment that should be retained");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Service temporarily unavailable")).toBeInTheDocument();
    });

    // Content is retained in textarea
    expect(textarea).toHaveValue("Draft comment that should be retained");
  });

  it("renders Problem Appears Resolved button for eligible status and records indication", async () => {
    const user = userEvent.setup();
    vi.mocked(api.indicateProblemResolved).mockResolvedValue({
      data: {
        indicatedAt: "2026-09-04T11:00:00.000Z",
        indicatedBy: { id: 1, name: "Jennifer Anderson" },
        currentStatus: "IN_PROGRESS",
      },
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole("button", { name: "Problem appears resolved" });
    expect(resolveBtn).toBeInTheDocument();

    await user.click(resolveBtn);

    await waitFor(() => {
      expect(api.indicateProblemResolved).toHaveBeenCalledWith(42, "2026-09-04T10:15:00.000Z");
      expect(screen.getByText("Problem indicated as resolved")).toBeInTheDocument();
    });

    // Button is replaced by the status banner
    expect(screen.queryByRole("button", { name: "Problem appears resolved" })).not.toBeInTheDocument();
  });

  it("renders indicated status banner when ticket already has requesterResolutionIndicatedAt", async () => {
    const alreadyIndicatedTicket: api.TicketDetail = {
      ...sampleTicket,
      requesterResolutionIndicatedAt: "2026-09-04T10:50:00.000Z",
      requesterResolutionIndicatedBy: { id: 1, name: "Jennifer Anderson" },
    };

    vi.mocked(api.getTicketDetail).mockResolvedValue(alreadyIndicatedTicket);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    expect(screen.getByText("Problem indicated as resolved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem appears resolved" })).not.toBeInTheDocument();
  });

  it("handles 409 conflict when indicating resolution by reloading ticket", async () => {
    const user = userEvent.setup();
    vi.mocked(api.indicateProblemResolved).mockRejectedValue(
      new api.ApiError("Ticket status changed concurrently", 409, "TICKET_VERSION_CONFLICT")
    );

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("TKT-2026-00042")).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole("button", { name: "Problem appears resolved" });
    await user.click(resolveBtn);

    await waitFor(() => {
      expect(screen.getByText(/The ticket status or version changed. Reloading latest details/)).toBeInTheDocument();
    });

    // Verify ticket reload was triggered
    expect(api.getTicketDetail).toHaveBeenCalledTimes(2);
  });
});
