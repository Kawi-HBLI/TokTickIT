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
    resetAdminUserPassword: vi.fn(),
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
    department: "Executive",
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
    department: "IT Infrastructure",
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
    department: "Marketing",
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

describe("UI-ADMIN-01: Administrator User Management", () => {
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

  it("renders user table with name, email, department, role badges, and status", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Harper Morgan").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("harper.morgan@toktickit.local").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Avery Jordan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Robin Taylor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Executive").length).toBeGreaterThan(0);
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

  it("opens create user dialog, validates required fields, and submits new user", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createAdminUser).mockResolvedValue({
      data: {
        id: 4,
        name: "Morgan Vance",
        email: "morgan.vance@toktickit.local",
        department: "Operations",
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
    expect(within(dialog).getByText(/Initial Password:/i)).toBeInTheDocument();

    // Try submitting empty
    const submitBtn = within(dialog).getByRole("button", { name: "Create User" });
    await user.click(submitBtn);

    expect(within(dialog).getByText("Full name is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Email address is required.")).toBeInTheDocument();

    // Fill valid data
    await user.type(within(dialog).getByLabelText(/Full Name/i), "Morgan Vance");
    await user.type(within(dialog).getByLabelText(/Email Address/i), "morgan.vance@toktickit.local");
    await user.type(within(dialog).getByLabelText("Department"), "Operations");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.createAdminUser).toHaveBeenCalledWith({
        name: "Morgan Vance",
        email: "morgan.vance@toktickit.local",
        department: "Operations",
        role: "REQUESTER",
        isActive: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/User "Morgan Vance" was created successfully./i)).toBeInTheDocument();
    });
  });

  it("prevents self-deactivation and self-role demotion in edit dialog for current user", async () => {
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

    // Check that role and active account inputs are disabled
    const roleSelect = within(dialog).getByLabelText(/Role/i);
    const activeCheck = within(dialog).getByLabelText(/Active Account/i);

    expect(roleSelect).toBeDisabled();
    expect(activeCheck).toBeDisabled();
    expect(within(dialog).getByText("You cannot change your own administrator role.")).toBeInTheDocument();
    expect(within(dialog).getByText("You cannot deactivate your own account.")).toBeInTheDocument();

    // Cancel dialog
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("edits another user and saves successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateAdminUser).mockResolvedValue({
      data: {
        id: 2,
        name: "Avery Jordan",
        email: "avery.jordan@toktickit.local",
        department: "DevOps",
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

    // Change department and role
    const deptInput = within(dialog).getByLabelText("Department");
    await user.clear(deptInput);
    await user.type(deptInput, "DevOps");
    await user.selectOptions(roleSelect, "ADMINISTRATOR");

    const saveBtn = within(dialog).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.updateAdminUser).toHaveBeenCalledWith(2, {
        name: "Avery Jordan",
        email: "avery.jordan@toktickit.local",
        department: "DevOps",
        role: "ADMINISTRATOR",
        isActive: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/User "Avery Jordan" was updated successfully./i)).toBeInTheDocument();
    });
  });

  it("opens reset password confirmation dialog and resets password", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetAdminUserPassword).mockResolvedValue({
      data: { message: "Password reset successfully." },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText("Avery Jordan").length).toBeGreaterThan(0);
    });

    const resetBtns = screen.getAllByRole("button", { name: "Reset password for Avery Jordan" });
    await user.click(resetBtns[0]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Reset User Password\?/i)).toBeInTheDocument();
    expect(screen.getByText(/The password will be reset to/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Reset Password" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.resetAdminUserPassword).toHaveBeenCalledWith(2);
    });

    await waitFor(() => {
      expect(screen.getByText(/Password for "Avery Jordan" has been reset to ChangeMe-2026!/i)).toBeInTheDocument();
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
