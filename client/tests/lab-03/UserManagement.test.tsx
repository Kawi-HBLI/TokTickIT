// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserManagement from "../../src/UserManagement.js";
import * as api from "../../src/api.js";
import { RequesterProvider } from "../../src/RequesterContext.js";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    fetchAdminUsers: vi.fn(),
    createAdminUser: vi.fn(),
    updateAdminUser: vi.fn(),
    setAdminUserInitialPassword: vi.fn(),
  };
});

const currentAdminUser: api.CurrentUser = {
  id: 1,
  name: "Harper Morgan",
  email: "harper.morgan@toktickit.local",
  role: "ADMINISTRATOR",
  isActive: true,
  mustChangePassword: false,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const sampleUsers: api.AdminUser[] = [
  {
    id: 1,
    name: "Harper Morgan",
    email: "harper.morgan@toktickit.local",
    role: "ADMINISTRATOR",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Avery Jordan",
    email: "avery.jordan@toktickit.local",
    role: "IT_STAFF",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
  {
    id: 3,
    name: "Robin Taylor",
    email: "robin.taylor@toktickit.local",
    role: "REQUESTER",
    isActive: false,
    mustChangePassword: false,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
];

function renderComponent(onNavigate = vi.fn()) {
  return render(
    <RequesterProvider>
      <UserManagement onNavigate={onNavigate} />
    </RequesterProvider>
  );
}

describe("UI-USER-01: Administrator User Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentUser).mockResolvedValue({
      user: currentAdminUser,
      csrfToken: "mock-csrf-token",
    });
    vi.mocked(api.fetchAdminUsers).mockResolvedValue({
      data: sampleUsers,
    });
  });

  it("renders user table with name, email, role badges, and status", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Harper Morgan").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("harper.morgan@toktickit.local").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Avery Jordan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Robin Taylor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IT Staff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 3 users/i)).toBeInTheDocument();
  });

  it("filters users by role and search query", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Harper Morgan").length).toBeGreaterThan(0);
    });

    const roleSelect = screen.getByLabelText("Role");
    await user.selectOptions(roleSelect, "IT_STAFF");

    await waitFor(() => {
      expect(api.fetchAdminUsers).toHaveBeenCalledWith({
        q: "",
        role: "IT_STAFF",
      });
    });

    const searchInput = screen.getByLabelText("Search users");
    await user.type(searchInput, "avery");

    await waitFor(() => {
      expect(api.fetchAdminUsers).toHaveBeenCalledWith({
        q: "avery",
        role: "IT_STAFF",
      });
    });

    // Clear filters button appears and resets
    const clearBtn = screen.getByRole("button", { name: "Clear filters" });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(api.fetchAdminUsers).toHaveBeenCalledWith({
        q: "",
        role: "ALL",
      });
    });
  });

  it("opens create user dialog, validates required fields, and submits new user with initial password", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createAdminUser).mockResolvedValue({
      data: {
        id: 4,
        name: "Morgan Vance",
        email: "morgan.vance@toktickit.local",
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Harper Morgan").length).toBeGreaterThan(0);
    });

    const createBtn = screen.getByRole("button", { name: "Create User" });
    await user.click(createBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Try submitting empty
    const submitBtn = within(dialog).getByRole("button", { name: "Create User" });
    await user.click(submitBtn);

    expect(within(dialog).getByText("Full name must be between 2 and 100 characters.")).toBeInTheDocument();
    expect(within(dialog).getByText("Email address is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Initial password must contain 12-72 characters.")).toBeInTheDocument();

    // Fill valid data
    await user.type(within(dialog).getByLabelText(/Full Name/i), "Morgan Vance");
    await user.type(within(dialog).getByLabelText(/Email Address/i), "morgan.vance@toktickit.local");
    await user.type(within(dialog).getByLabelText(/Initial Password/i), "ValidPass123456!");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.createAdminUser).toHaveBeenCalledWith({
        name: "Morgan Vance",
        email: "morgan.vance@toktickit.local",
        role: "REQUESTER",
        isActive: true,
        initialPassword: "ValidPass123456!",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/User "Morgan Vance" was created successfully./i)).toBeInTheDocument();
    });
  });

  it("prevents self-deactivation in edit dialog for current user", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Harper Morgan").length).toBeGreaterThan(0);
    });

    // Edit Harper Morgan (id 1, who is currentUser)
    const editHarperBtns = screen.getAllByRole("button", { name: "Edit Harper Morgan" });
    await user.click(editHarperBtns[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Active account checkbox should be disabled for self
    const activeCheck = within(dialog).getByLabelText(/Active Account/i);
    expect(activeCheck).toBeDisabled();
    expect(within(dialog).getByText("You cannot deactivate your own account.")).toBeInTheDocument();

    // Role select is NOT disabled for self on client (server handles last-active-admin check)
    const roleSelect = within(dialog).getByLabelText(/Role/i);
    expect(roleSelect).not.toBeDisabled();

    // Cancel dialog
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("edits another user and saves successfully with expectedUpdatedAt", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateAdminUser).mockResolvedValue({
      data: {
        id: 2,
        name: "Avery Jordan",
        email: "avery.jordan@toktickit.local",
        role: "ADMINISTRATOR",
        isActive: true,
        mustChangePassword: false,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Avery Jordan").length).toBeGreaterThan(0);
    });

    const editBtns = screen.getAllByRole("button", { name: "Edit Avery Jordan" });
    await user.click(editBtns[0]);

    const dialog = screen.getByRole("dialog");
    const roleSelect = within(dialog).getByLabelText(/Role/i);
    const activeCheck = within(dialog).getByLabelText(/Active Account/i);

    expect(roleSelect).not.toBeDisabled();
    expect(activeCheck).not.toBeDisabled();

    // Change role to ADMINISTRATOR
    await user.selectOptions(roleSelect, "ADMINISTRATOR");

    const saveBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.updateAdminUser).toHaveBeenCalledWith(2, {
        name: "Avery Jordan",
        email: "avery.jordan@toktickit.local",
        role: "ADMINISTRATOR",
        isActive: true,
        expectedUpdatedAt: "2026-09-02T00:00:00.000Z",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/User "Avery Jordan" was updated successfully./i)).toBeInTheDocument();
    });
  });

  it("opens reset password dialog and sets new initial password", async () => {
    const user = userEvent.setup();
    vi.mocked(api.setAdminUserInitialPassword).mockResolvedValue({
      data: {
        id: 2,
        name: "Avery Jordan",
        email: "avery.jordan@toktickit.local",
        role: "IT_STAFF",
        isActive: true,
        mustChangePassword: true,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Avery Jordan").length).toBeGreaterThan(0);
    });

    const resetBtns = screen.getAllByRole("button", { name: "Reset password for Avery Jordan" });
    await user.click(resetBtns[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Set Initial Password" })).toBeVisible();

    const passwordInput = within(dialog).getByLabelText(/New Initial Password/i);
    await user.type(passwordInput, "NewTempSecret-2026!");

    const confirmBtn = within(dialog).getByRole("button", { name: "Set Initial Password" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.setAdminUserInitialPassword).toHaveBeenCalledWith(2, "NewTempSecret-2026!");
    });

    await waitFor(() => {
      expect(screen.getByText(/Initial password for "Avery Jordan" has been set/i)).toBeInTheDocument();
    });
  });

  it("displays forbidden access denied state when user does not have permission", async () => {
    vi.mocked(api.fetchAdminUsers).mockRejectedValue(
      new api.ApiError("Forbidden", 403, "FORBIDDEN")
    );

    const onNavigate = vi.fn();
    renderComponent(onNavigate);

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Only Administrators may access this page./i)
    ).toBeInTheDocument();

    const queueBtn = screen.getByRole("button", { name: "Go to Support Queue" });
    await userEvent.click(queueBtn);
    expect(onNavigate).toHaveBeenCalledWith("/staff/tickets");
  });
});
