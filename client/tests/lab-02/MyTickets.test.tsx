import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requesterA: api.Requester = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer@example.com",
  department: "Marketing",
  isActive: true,
};

const requesterB: api.Requester = {
  id: 2,
  name: "Marcus Chen",
  email: "marcus@example.com",
  department: "Finance",
  isActive: true,
};

const categories: api.Category[] = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];

const ticketA1: api.TicketListItem = {
  id: 101,
  ticketNumber: "TKT-2026-00101",
  summary: "Laptop keyboard not working",
  requestedPriority: "HIGH",
  currentStatus: "NEW",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  activeAttachmentCount: 2,
};

const ticketA2: api.TicketListItem = {
  id: 102,
  ticketNumber: "TKT-2026-00102",
  summary: "VPN connection drops frequently",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-09-02T10:00:00.000Z",
  updatedAt: "2026-09-02T11:00:00.000Z",
  category: { id: 2, name: "Software" },
  relatedSystem: { id: 8, name: "VPN Gateway" },
  activeAttachmentCount: 0,
};

const ticketB1: api.TicketListItem = {
  id: 201,
  ticketNumber: "TKT-2026-00201",
  summary: "Payroll software calculation error",
  requestedPriority: "CRITICAL",
  currentStatus: "NEW",
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T14:00:00.000Z",
  category: { id: 2, name: "Software" },
  relatedSystem: { id: 9, name: "Financial ERP" },
  activeAttachmentCount: 1,
};

function makeResponse(tickets: api.TicketListItem[], page = 1, pageSize = 10, totalItems = tickets.length): api.MyTicketsResponse {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    data: tickets,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    query: {
      search: "",
      categoryId: null,
      requestedPriority: null,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
  };
}

describe("My Tickets workflow (UI-LIST-01 to UI-LIST-04)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/tickets");
    vi.spyOn(api, "getRequesters").mockResolvedValue([requesterA, requesterB]);
    vi.spyOn(api, "getCategories").mockResolvedValue(categories);
  });

  it.each(["success", "failure"])("ignores a stale search %s after a newer result", async (outcome) => {
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    const pending: { resolve: (value: api.MyTicketsResponse) => void; reject: (reason: Error) => void }[] = [];
    vi.spyOn(api, "getMyTickets").mockResolvedValueOnce(makeResponse([ticketA1]))
      .mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    render(<App />);
    await screen.findAllByText(ticketA1.summary);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "keyboard" } });
    fireEvent.change(input, { target: { value: "VPN" } });
    await act(async () => pending[1].resolve(makeResponse([ticketA2])));
    await act(async () => {
      if (outcome === "success") pending[0].resolve(makeResponse([ticketA1]));
      else pending[0].reject(new Error("Old search failed"));
    });
    expect(input).toHaveValue("VPN");
    expect(screen.getAllByText(ticketA2.summary).length).toBeGreaterThan(0);
    expect(screen.queryByText(ticketA1.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(/Old search failed/)).not.toBeInTheDocument();
  });

  it("keeps the current request loading when an older request finishes first", async () => {
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    const pending: ((value: api.MyTicketsResponse) => void)[] = [];
    vi.spyOn(api, "getMyTickets").mockResolvedValueOnce(makeResponse([ticketA1]))
      .mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    render(<App />);
    await screen.findAllByText(ticketA1.summary);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "keyboard" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "VPN" } });
    await act(async () => pending[0](makeResponse([ticketA1])));
    expect(screen.getByText("Loading tickets…")).toBeInTheDocument();
    await act(async () => pending[1](makeResponse([ticketA2])));
    expect(screen.getAllByText(ticketA2.summary).length).toBeGreaterThan(0);
  });

  it("shows Category loading/failure and retries without clearing other filters", async () => {
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    let rejectCategories!: (error: Error) => void;
    vi.spyOn(api, "getCategories").mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCategories = reject; }))
      .mockResolvedValueOnce(categories);
    const list = vi.spyOn(api, "getMyTickets").mockResolvedValue(makeResponse([ticketA1]));
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByText(ticketA1.summary);
    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category).toBeDisabled();
    expect(screen.getByText("Loading Categories...")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "keyboard" } });
    await act(async () => rejectCategories(new Error("private reference error")));
    expect(screen.getByRole("alert")).toHaveTextContent("Categories could not be loaded.");
    expect(screen.queryByText("private reference error")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Categories" }));
    await waitFor(() => expect(category).toBeEnabled());
    await user.selectOptions(category, "1");
    expect(screen.getByRole("searchbox")).toHaveValue("keyboard");
    expect(list).toHaveBeenLastCalledWith(1, expect.objectContaining({ search: "keyboard", categoryId: 1, page: 1 }));
  });

  describe("UI-LIST-01: Requester-owned list and switching behavior", () => {
    it("displays requester A's tickets and switches to requester B's tickets when persona changes", async () => {
      sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
      const user = userEvent.setup();

      const getTicketsMock = vi.spyOn(api, "getMyTickets").mockImplementation(async (reqId) => {
        if (reqId === 1) return makeResponse([ticketA1, ticketA2]);
        if (reqId === 2) return makeResponse([ticketB1]);
        return makeResponse([]);
      });

      render(<App />);

      // Verify Requester A tickets load
      expect((await screen.findAllByText("TKT-2026-00101")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Laptop keyboard not working").length).toBeGreaterThan(0);
      expect(screen.getAllByText("VPN connection drops frequently").length).toBeGreaterThan(0);
      expect(screen.queryByText("Payroll software calculation error")).not.toBeInTheDocument();

      // Switch to Requester B
      await user.click(screen.getByRole("button", { name: "Change Requester" }));
      const requesterSelect = await screen.findByRole("combobox", { name: "Development Requester" });
      await user.selectOptions(requesterSelect, "2");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      // Verify Requester B's ticket appears and A's disappear
      expect((await screen.findAllByText("TKT-2026-00201")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Payroll software calculation error").length).toBeGreaterThan(0);
      expect(screen.queryByText("TKT-2026-00101")).not.toBeInTheDocument();
      expect(getTicketsMock).toHaveBeenCalledWith(2, expect.anything());
    });
  });

  describe("UI-LIST-02: Search, combined filters, clear filters, and page reset", () => {
    it("sends updated search and filter parameters and resets page to 1", async () => {
      sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
      const user = userEvent.setup();

      const getTicketsMock = vi.spyOn(api, "getMyTickets").mockResolvedValue(makeResponse([ticketA1, ticketA2]));

      render(<App />);
      await screen.findAllByText("TKT-2026-00101");

      // Search input
      const searchInput = screen.getByRole("searchbox", { name: /search by ticket number or summary/i });
      await user.type(searchInput, "keyboard");

      expect(getTicketsMock).toHaveBeenLastCalledWith(1, expect.objectContaining({ search: "keyboard", page: 1 }));

      // Priority filter
      const prioritySelect = screen.getByRole("combobox", { name: /requested priority/i });
      await user.selectOptions(prioritySelect, "HIGH");

      expect(getTicketsMock).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ requestedPriority: "HIGH", page: 1 }),
      );

      // Clear filters button should be visible
      const clearBtn = (await screen.findAllByRole("button", { name: /clear filters/i }))[0];
      await user.click(clearBtn);

      expect(searchInput).toHaveValue("");
      expect(prioritySelect).toHaveValue("");
      expect(getTicketsMock).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ search: undefined, requestedPriority: null, page: 1 }),
      );
    });
  });

  describe("UI-LIST-03: Sort, page size, pagination controls, and safe error handling", () => {
    it("controls sort, page size, next/previous pagination, and handles errors with retry", async () => {
      sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
      const user = userEvent.setup();

      // Page 1 of 2
      const getTicketsMock = vi.spyOn(api, "getMyTickets").mockResolvedValue(
        makeResponse([ticketA1], 1, 10, 15),
      );

      render(<App />);
      await screen.findAllByText("TKT-2026-00101");

      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
      const nextBtn = screen.getByRole("button", { name: "Next" });
      expect(nextBtn).toBeEnabled();

      // Click next page
      await user.click(nextBtn);
      expect(getTicketsMock).toHaveBeenLastCalledWith(1, expect.objectContaining({ page: 2 }));

      // Sort change
      const sortSelect = screen.getByRole("combobox", { name: /sort by/i });
      await user.selectOptions(sortSelect, "createdAt");
      expect(getTicketsMock).toHaveBeenLastCalledWith(1, expect.objectContaining({ sortBy: "createdAt", page: 1 }));

      // API failure error handling and retry
      getTicketsMock.mockRejectedValueOnce(new Error("Network connection error"));
      const directionSelect = screen.getByRole("combobox", { name: /direction/i });
      await user.selectOptions(directionSelect, "asc");

      expect(await screen.findByText(/error loading tickets/i)).toBeInTheDocument();
      const retryBtn = screen.getByRole("button", { name: "Retry" });

      getTicketsMock.mockResolvedValueOnce(makeResponse([ticketA1], 1, 10, 15));
      await user.click(retryBtn);

      expect((await screen.findAllByText("TKT-2026-00101")).length).toBeGreaterThan(0);
    });
  });

  describe("UI-LIST-04: Empty state vs no search results", () => {
    it("displays empty state with Create Ticket CTA when requester has no tickets", async () => {
      sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
      const user = userEvent.setup();

      vi.spyOn(api, "getMyTickets").mockResolvedValue(makeResponse([]));

      render(<App />);

      expect(await screen.findByRole("heading", { name: "No tickets yet" })).toBeInTheDocument();
      expect(screen.getByText(/haven't submitted any support requests/i)).toBeInTheDocument();

      // Clicking Create Ticket in empty state navigates to /tickets/new
      const emptyCreateBtn = screen.getAllByRole("button", { name: "Create Ticket" });
      await user.click(emptyCreateBtn[emptyCreateBtn.length - 1]);

      expect(await screen.findByRole("heading", { name: "Create Ticket" })).toBeInTheDocument();
    });

    it("displays no-results state with Clear Filters CTA when search returns no matches", async () => {
      sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
      const user = userEvent.setup();

      vi.spyOn(api, "getMyTickets").mockResolvedValue(makeResponse([]));

      render(<App />);

      const searchInput = await screen.findByRole("searchbox", { name: /search by ticket number or summary/i });
      await user.type(searchInput, "nonexistent-keyword-999");

      expect(await screen.findByRole("heading", { name: "No matching tickets found" })).toBeInTheDocument();
      expect(screen.getByText(/could not find any tickets matching your search/i)).toBeInTheDocument();

      const clearBtns = screen.getAllByRole("button", { name: "Clear Filters" });
      await user.click(clearBtns[0]);

      expect(searchInput).toHaveValue("");
    });
  });
});
