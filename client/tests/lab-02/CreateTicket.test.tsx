import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { REQUESTER_STORAGE_KEY } from "../../src/RequesterContext.js";

const requester: api.Requester = { id: 1, name: "Jennifer Anderson", email: "jennifer@example.com", department: "Marketing", isActive: true };
const secondRequester: api.Requester = { id: 2, name: "Marcus Chen", email: "marcus@example.com", department: "Finance", isActive: true };
const categories: api.Category[] = [{ id: 1, name: "Hardware" }];
const systems: api.RelatedSystem[] = [{ id: 7, name: "Corporate Laptop", description: "Managed laptop" }];
const created: api.CreateTicketResult = { data: { id: 41, ticketNumber: "TKT-2026-00041", ticketDate: "2026-09-04T10:00:00.000Z", currentStatus: "NEW" }, warnings: [], replayed: false };

async function renderTicketPage() {
  sessionStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  render(<App />);
  const user = userEvent.setup();
  const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
  await user.click(navigation.querySelector("button:last-child") as HTMLButtonElement);
  await screen.findByRole("heading", { name: "Create Ticket" });
  return user;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox", { name: /category/i }), "1");
  await user.selectOptions(screen.getByRole("combobox", { name: /related system/i }), "7");
  await user.type(screen.getByRole("textbox", { name: /summary/i }), "Laptop battery drains");
  await user.type(screen.getByRole("textbox", { name: /description/i }), "Battery drops from full charge in under thirty minutes.");
}

describe("Create Ticket", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/tickets");
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "getCategories").mockResolvedValue(categories);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(systems);
    vi.spyOn(api, "createTicket").mockResolvedValue(created);
  });

  it("loads references, defaults to Medium, validates inline, and does not submit invalid data", async () => {
    const user = await renderTicketPage();
    expect(screen.getByRole("combobox", { name: /requested priority/i })).toHaveValue("MEDIUM");
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(await screen.findByText("Choose a Category.")).toBeInTheDocument();
    expect(screen.getByText("Summary must be 5 to 100 characters after trimming.")).toBeInTheDocument();
    expect(api.createTicket).not.toHaveBeenCalled();
  });

  it("submits one multipart Ticket, blocks duplicate activation, and shows server generated values", async () => {
    let resolveCreate!: (value: api.CreateTicketResult) => void;
    vi.spyOn(api, "createTicket").mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const user = await renderTicketPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(screen.getByRole("button", { name: "Submitting ticket..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Submitting ticket..." }));
    expect(api.createTicket).toHaveBeenCalledTimes(1);
    resolveCreate(created);
    expect(await screen.findByText("TKT-2026-00041")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("keeps values and the same idempotency key after a safe API failure", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValueOnce(new api.ApiError("Ticket could not be created. Please try again.", 500)).mockResolvedValueOnce(created);
    const user = await renderTicketPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ticket could not be created");
    expect(screen.getByRole("textbox", { name: /summary/i })).toHaveValue("Laptop battery drains");
    expect(screen.getByRole("textbox", { name: /summary/i })).toBeDisabled();
    expect(screen.getByText(/draft is locked to prevent a duplicate/i)).toBeInTheDocument();
    const firstKey = vi.mocked(api.createTicket).mock.calls[0][1];
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.createTicket).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createTicket).mock.calls[1][1]).toBe(firstKey);
    expect(await screen.findByText("TKT-2026-00041")).toBeInTheDocument();
  });

  it("identifies invalid files, lists valid files, and permits removal", async () => {
    const user = await renderTicketPage();
    const invalid = new File(["not executable"], "danger.exe", { type: "application/octet-stream" });
    fireEvent.change(screen.getByLabelText(/add files/i), { target: { files: [invalid] } });
    expect(await screen.findByText(/danger.exe: JPG, JPEG, PNG, WEBP, and PDF files are allowed/i)).toBeInTheDocument();
    expect(screen.getByText("0 of 5 files")).toBeInTheDocument();
    const valid = new File(["png"], "diagnostic.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/add files/i), { target: { files: [valid] } });
    expect(await screen.findByText("diagnostic.png")).toBeInTheDocument();
    expect(screen.getByText("1 of 5 files")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove before submit" }));
    expect(screen.getByText("0 of 5 files")).toBeInTheDocument();
  });

  it("unlocks an uncertain draft when retry confirms a validation rejection", async () => {
    vi.spyOn(api, "createTicket")
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockRejectedValueOnce(new api.ApiError("Correct the form.", 400, "VALIDATION_ERROR", [{ field: "summary", message: "Correct this summary." }], false));
    const user = await renderTicketPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(await screen.findByText(/draft is locked to prevent a duplicate/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /summary/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Correct this summary.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /summary/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("blocks a valid subset while an invalid file is still listed", async () => {
    const user = await renderTicketPage();
    await fillValidForm(user);
    const invalid = new File(["bad"], "danger.exe", { type: "application/octet-stream" });
    const valid = new File(["png"], "diagnostic.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/add files/i), { target: { files: [invalid, valid] } });
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(api.createTicket).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove invalid file" }));
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(api.createTicket).toHaveBeenCalledTimes(1);
  });

  it("shows a partial attachment warning without hiding the created Ticket", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue({ ...created, warnings: [{ code: "ATTACHMENT_STORAGE_FAILED", filename: "diagnostic.png", message: "The ticket was created, but this file could not be stored." }] });
    const user = await renderTicketPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(await screen.findByText("TKT-2026-00041")).toBeInTheDocument();
    expect(screen.getByText(/Some attachments need attention/i)).toBeInTheDocument();
    expect(screen.getByText(/diagnostic.png/i)).toBeInTheDocument();
  });

  it("keeps typed values through a reference-data failure and shows server field messages inline", async () => {
    // Target Create Ticket directly; My Tickets now loads its own Category reference.
    window.history.replaceState({}, "", "/tickets/new");
    vi.spyOn(api, "getCategories").mockRejectedValueOnce(new api.ApiError("Categories are unavailable.", 500)).mockResolvedValueOnce(categories);
    const user = await renderTicketPage();
    await user.type(screen.getByRole("textbox", { name: /summary/i }), "Keep this summary");
    expect(await screen.findByText(/Reference data could not be loaded/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /summary/i })).toHaveValue("Keep this summary");
    await user.selectOptions(screen.getByRole("combobox", { name: /category/i }), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: /related system/i }), "7");
    await user.type(screen.getByRole("textbox", { name: /description/i }), "A sufficiently detailed problem description.");
    vi.spyOn(api, "createTicket").mockRejectedValueOnce(new api.ApiError("Some values are invalid.", 400, "VALIDATION_ERROR", [{ field: "summary", message: "Summary is no longer accepted." }, { field: "requestedPriority", message: "Priority is no longer accepted." }], false));
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));
    expect(await screen.findByText("Summary is no longer accepted.")).toBeInTheDocument();
    expect(screen.getByText("Priority is no longer accepted.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /requested priority/i })).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("guards direct history navigation and clears the old form after a confirmed switch", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValue([requester, secondRequester]);
    const user = await renderTicketPage();
    await user.type(screen.getByRole("textbox", { name: /summary/i }), "This must not disappear");
    await act(async () => { window.history.pushState({}, "", "/tickets"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(await screen.findByRole("dialog", { name: /discard unsaved ticket/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Development Requester" }), "2");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    await user.click(navigation.querySelector("button:last-child") as HTMLButtonElement);
    expect(await screen.findByRole("heading", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /summary/i })).toHaveValue("");
  });

  it("treats a priority-only edit as unsaved work before changing Requester", async () => {
    const user = await renderTicketPage();
    await user.selectOptions(screen.getByRole("combobox", { name: /requested priority/i }), "HIGH");
    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    expect(await screen.findByRole("dialog", { name: /discard unsaved ticket/i })).toBeInTheDocument();
  });

  it("asks before switching Requester with a dirty form and discards only after confirmation", async () => {
    const user = await renderTicketPage();
    await user.type(screen.getByRole("textbox", { name: /summary/i }), "Still typing");
    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    expect(await screen.findByRole("dialog", { name: /discard unsaved ticket/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: /summary/i })).toHaveValue("Still typing");
    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Select Development Requester" })).toBeInTheDocument();
  });
});
