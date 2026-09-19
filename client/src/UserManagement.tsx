import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AdminUser,
  ApiError,
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  UserRole,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";

export interface UserManagementProps {
  onNavigate: (path: string) => void;
}

interface CreateUserState {
  name: string;
  email: string;
  department: string;
  role: UserRole;
  isActive: boolean;
}

interface EditUserState {
  name: string;
  email: string;
  department: string;
  role: UserRole;
  isActive: boolean;
}

const INITIAL_CREATE_STATE: CreateUserState = {
  name: "",
  email: "",
  department: "",
  role: "REQUESTER",
  isActive: true,
};

function formatRole(role: UserRole): string {
  switch (role) {
    case "ADMINISTRATOR":
      return "Administrator";
    case "IT_STAFF":
      return "IT Staff";
    case "REQUESTER":
      return "Requester";
    default:
      return role;
  }
}

export default function UserManagement({ onNavigate }: UserManagementProps) {
  const { currentUser } = useRequester();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserState>(INITIAL_CREATE_STATE);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserState | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  // Reset Password Modal
  const [resettingUser, setResettingUser] = useState<AdminUser | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Focus management
  const previousFocus = useRef<HTMLElement | null>(null);
  const createModalRef = useRef<HTMLElement | null>(null);
  const editModalRef = useRef<HTMLElement | null>(null);
  const resetModalRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const searchId = useId();
  const roleFilterId = useId();

  // Load users
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchAdminUsers({ q: search, role: roleFilter })
      .then((res) => {
        if (!active) return;
        setUsers(res.data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        const status = err?.status;
        const message =
          status === 403
            ? "You do not have permission to view User Management. Only Administrators may access this page."
            : err?.message || "Failed to load users.";
        setError({ status, message });
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, roleFilter, reloadTrigger]);

  // Dialog keydown handler (Escape and Tab trapping)
  function handleModalKeyDown(
    e: KeyboardEvent<HTMLElement>,
    closeFn: () => void,
    containerRef: React.RefObject<HTMLElement | null>
  ) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeFn();
      return;
    }
    if (e.key !== "Tab" || !containerRef.current) return;

    const focusable = containerRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Open / Close Create Modal
  function openCreateModal() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreateForm(INITIAL_CREATE_STATE);
    setCreateError(null);
    setCreateFieldErrors({});
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setCreateForm(INITIAL_CREATE_STATE);
    setCreateError(null);
    setCreateFieldErrors({});
    previousFocus.current?.focus();
  }

  // Open / Close Edit Modal
  function openEditModal(user: AdminUser) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      department: user.department || "",
      role: user.role,
      isActive: user.isActive,
    });
    setEditError(null);
    setEditFieldErrors({});
  }

  function closeEditModal() {
    setEditingUser(null);
    setEditForm(null);
    setEditError(null);
    setEditFieldErrors({});
    previousFocus.current?.focus();
  }

  // Open / Close Reset Password Modal
  function openResetModal(user: AdminUser) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setResettingUser(user);
    setResetError(null);
  }

  function closeResetModal() {
    setResettingUser(null);
    setResetError(null);
    previousFocus.current?.focus();
  }

  // Focus first element when modal opens
  useEffect(() => {
    if (showCreateModal && createModalRef.current) {
      const firstInput = createModalRef.current.querySelector<HTMLElement>("input, select, button");
      firstInput?.focus();
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (editingUser && editModalRef.current) {
      const firstInput = editModalRef.current.querySelector<HTMLElement>("input, select, button");
      firstInput?.focus();
    }
  }, [editingUser]);

  useEffect(() => {
    if (resettingUser && resetModalRef.current) {
      const confirmBtn = resetModalRef.current.querySelector<HTMLButtonElement>(".btn-danger, .btn-primary");
      confirmBtn?.focus();
    }
  }, [resettingUser]);

  // Submit Create User
  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateFieldErrors({});

    const fieldErrors: Record<string, string> = {};
    if (!createForm.name.trim()) {
      fieldErrors.name = "Full name is required.";
    }
    if (!createForm.email.trim()) {
      fieldErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      fieldErrors.email = "Please enter a valid email address.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      setCreateFieldErrors(fieldErrors);
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await createAdminUser({
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        department: createForm.department.trim() || null,
        role: createForm.role,
        isActive: createForm.isActive,
      });

      setFeedback({
        type: "success",
        message: `User "${res.data.name}" was created successfully.`,
      });
      closeCreateModal();
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          const mapped: Record<string, string> = {};
          for (const f of err.fields) {
            mapped[f.field] = f.message;
          }
          setCreateFieldErrors(mapped);
        }
        setCreateError(err.message);
      } else {
        setCreateError("Could not create user. Please try again.");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  // Submit Edit User
  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingUser || !editForm) return;

    setEditError(null);
    setEditFieldErrors({});

    const fieldErrors: Record<string, string> = {};
    if (!editForm.name.trim()) {
      fieldErrors.name = "Full name is required.";
    }
    if (!editForm.email.trim()) {
      fieldErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) {
      fieldErrors.email = "Please enter a valid email address.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      setEditFieldErrors(fieldErrors);
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await updateAdminUser(editingUser.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        department: editForm.department.trim() || null,
        role: editForm.role,
        isActive: editForm.isActive,
      });

      setFeedback({
        type: "success",
        message: `User "${res.data.name}" was updated successfully.`,
      });
      closeEditModal();
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          const mapped: Record<string, string> = {};
          for (const f of err.fields) {
            mapped[f.field] = f.message;
          }
          setEditFieldErrors(mapped);
        }
        setEditError(err.message);
      } else {
        setEditError("Could not update user. Please try again.");
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  // Submit Reset Password
  async function handleResetPassword() {
    if (!resettingUser) return;
    setResetSubmitting(true);
    setResetError(null);

    try {
      await resetAdminUserPassword(resettingUser.id);
      setFeedback({
        type: "success",
        message: `Password for "${resettingUser.name}" has been reset to ChangeMe-2026!. User must change password upon next login.`,
      });
      closeResetModal();
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setResetError(err.message);
      } else {
        setResetError("Could not reset user password. Please try again.");
      }
    } finally {
      setResetSubmitting(false);
    }
  }

  function handleClearFilters() {
    setSearch("");
    setRoleFilter("ALL");
  }

  const hasActiveFilters = Boolean(search.trim() || roleFilter !== "ALL");
  const isEditingSelf = Boolean(editingUser && currentUser && editingUser.id === currentUser.id);

  return (
    <section className="user-management-view" aria-labelledby="user-mgmt-title">
      <div className="workspace-header">
        <div>
          <h1 id="user-mgmt-title">User Management</h1>
          <p className="page-intro">
            Manage system users, roles, account activation, and credential resets.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary create-user-btn"
          onClick={openCreateModal}
        >
          Create User
        </button>
      </div>

      {feedback && (
        <div
          className={`alert ${
            feedback.type === "success" ? "alert-success" : "alert-danger"
          } mb-4`}
          role="status"
        >
          <div className="alert-content">
            <p className="mb-0">{feedback.message}</p>
            <button
              type="button"
              className="btn-close-alert"
              aria-label="Close notification"
              onClick={() => setFeedback(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <section className="queue-controls-card" aria-label="Search and filter users">
        <div className="filter-grid">
          <div className="filter-group search-group">
            <label htmlFor={searchId}>Search users</label>
            <input
              id={searchId}
              ref={searchInputRef}
              type="search"
              className="form-input"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor={roleFilterId}>Role</label>
            <select
              id={roleFilterId}
              className="form-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="REQUESTER">Requester</option>
              <option value="IT_STAFF">IT Staff</option>
              <option value="ADMINISTRATOR">Administrator</option>
            </select>
          </div>

          <div className="filter-actions">
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={handleClearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Live polite status */}
        <div className="filter-status-row" aria-live="polite">
          {!loading && !error && (
            <span className="results-count-text">
              Showing {users.length} {users.length === 1 ? "user" : "users"}
              {hasActiveFilters ? " matching filters" : ""}
            </span>
          )}
        </div>
      </section>

      {/* Main Content Areas */}
      {loading ? (
        <div className="queue-state-box loading-box" role="status">
          <p className="state-message">Loading users…</p>
        </div>
      ) : error ? (
        error.status === 403 ? (
          <div className="queue-state-box forbidden-box" role="alert">
            <h2>Access denied</h2>
            <p className="state-message state-message-error">{error.message}</p>
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={() => onNavigate("/staff/tickets")}
            >
              Go to Support Queue
            </button>
          </div>
        ) : (
          <div className="queue-state-box error-box" role="alert">
            <h2>Failed to load users</h2>
            <p className="state-message state-message-error">{error.message}</p>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => setReloadTrigger((t) => t + 1)}
            >
              Retry
            </button>
          </div>
        )
      ) : users.length === 0 ? (
        hasActiveFilters ? (
          <div className="queue-state-box no-results-box" role="status">
            <h2>No matching users</h2>
            <p className="state-message">
              No users matched your search and filter criteria. Try broadening your query or clear active filters.
            </p>
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="queue-state-box empty-box" role="status">
            <h2>No users found</h2>
            <p className="state-message">There are currently no users in the system.</p>
          </div>
        )
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="admin-users-table-container">
            <table className="staff-queue-table admin-users-table" aria-label="System Users">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Department</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.isActive ? "user-row-inactive" : undefined}>
                    <td className="user-name-cell">
                      <strong>{u.name}</strong>
                      {currentUser && currentUser.id === u.id && (
                        <span className="badge badge-current-user">You</span>
                      )}
                    </td>
                    <td className="user-email-cell">{u.email}</td>
                    <td>{u.department || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge badge-role badge-role-${u.role.toLowerCase()}`}>
                        {formatRole(u.role)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-status ${
                          u.isActive ? "badge-status-active" : "badge-status-inactive"
                        }`}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="action-cell">
                      <div className="user-action-btns">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => openEditModal(u)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          aria-label={`Reset password for ${u.name}`}
                          onClick={() => openResetModal(u)}
                        >
                          Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Small Screen Cards View */}
          <div className="admin-users-cards" aria-label="System Users Cards">
            {users.map((u) => (
              <article
                className={`admin-user-card ${!u.isActive ? "user-card-inactive" : ""}`}
                key={u.id}
              >
                <div className="card-top-row">
                  <div className="user-card-title-group">
                    <h3 className="user-card-name">{u.name}</h3>
                    {currentUser && currentUser.id === u.id && (
                      <span className="badge badge-current-user">You</span>
                    )}
                  </div>
                  <span
                    className={`badge badge-status ${
                      u.isActive ? "badge-status-active" : "badge-status-inactive"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="user-card-meta">
                  <div className="meta-row">
                    <span className="meta-label">Email:</span>
                    <span className="meta-value">{u.email}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Department:</span>
                    <span className="meta-value">{u.department || "—"}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Role:</span>
                    <span className="meta-value">
                      <span className={`badge badge-role badge-role-${u.role.toLowerCase()}`}>
                        {formatRole(u.role)}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="user-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success"
                    aria-label={`Edit ${u.name}`}
                    onClick={() => openEditModal(u)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label={`Reset password for ${u.name}`}
                    onClick={() => openResetModal(u)}
                  >
                    Reset Password
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={createModalRef}
            className="confirm-dialog user-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-dialog-title"
            onKeyDown={(e) => handleModalKeyDown(e, closeCreateModal, createModalRef)}
          >
            <div className="dialog-header">
              <h2 id="create-user-dialog-title">Create User</h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close dialog"
                onClick={closeCreateModal}
              >
                ×
              </button>
            </div>

            {createError && (
              <div className="alert alert-danger mb-3" role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} noValidate>
              <div className="form-group mb-3">
                <label htmlFor="create-name">
                  Full Name <span className="text-danger">*</span>
                </label>
                <input
                  id="create-name"
                  type="text"
                  className={`form-input ${createFieldErrors.name ? "is-invalid" : ""}`}
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
                {createFieldErrors.name && (
                  <p className="field-error" role="alert">
                    {createFieldErrors.name}
                  </p>
                )}
              </div>

              <div className="form-group mb-3">
                <label htmlFor="create-email">
                  Email Address <span className="text-danger">*</span>
                </label>
                <input
                  id="create-email"
                  type="email"
                  className={`form-input ${createFieldErrors.email ? "is-invalid" : ""}`}
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                />
                {createFieldErrors.email && (
                  <p className="field-error" role="alert">
                    {createFieldErrors.email}
                  </p>
                )}
              </div>

              <div className="form-group mb-3">
                <label htmlFor="create-dept">Department</label>
                <input
                  id="create-dept"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Operations, IT, Finance"
                  value={createForm.department}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, department: e.target.value }))
                  }
                />
              </div>

              <div className="form-group mb-3">
                <label htmlFor="create-role">
                  Role <span className="text-danger">*</span>
                </label>
                <select
                  id="create-role"
                  className="form-select"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      role: e.target.value as UserRole,
                    }))
                  }
                >
                  <option value="REQUESTER">Requester</option>
                  <option value="IT_STAFF">IT Staff</option>
                  <option value="ADMINISTRATOR">Administrator</option>
                </select>
              </div>

              <div className="form-check mb-3">
                <input
                  id="create-is-active"
                  type="checkbox"
                  className="form-check-input"
                  checked={createForm.isActive}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                <label htmlFor="create-is-active" className="form-check-label">
                  Active Account
                </label>
              </div>

              <div className="modal-info-box mb-4">
                <p className="mb-0 text-muted">
                  <strong>Initial Password:</strong> A temporary password{" "}
                  <code>ChangeMe-2026!</code> will be generated. The user will be required to change it upon first login.
                </p>
              </div>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeCreateModal}
                  disabled={createSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && editForm && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={editModalRef}
            className="confirm-dialog user-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-dialog-title"
            onKeyDown={(e) => handleModalKeyDown(e, closeEditModal, editModalRef)}
          >
            <div className="dialog-header">
              <h2 id="edit-user-dialog-title">Edit User</h2>
              <button
                type="button"
                className="btn-close-modal"
                aria-label="Close dialog"
                onClick={closeEditModal}
              >
                ×
              </button>
            </div>

            {editError && (
              <div className="alert alert-danger mb-3" role="alert">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} noValidate>
              <div className="form-group mb-3">
                <label htmlFor="edit-name">
                  Full Name <span className="text-danger">*</span>
                </label>
                <input
                  id="edit-name"
                  type="text"
                  className={`form-input ${editFieldErrors.name ? "is-invalid" : ""}`}
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  required
                />
                {editFieldErrors.name && (
                  <p className="field-error" role="alert">
                    {editFieldErrors.name}
                  </p>
                )}
              </div>

              <div className="form-group mb-3">
                <label htmlFor="edit-email">
                  Email Address <span className="text-danger">*</span>
                </label>
                <input
                  id="edit-email"
                  type="email"
                  className={`form-input ${editFieldErrors.email ? "is-invalid" : ""}`}
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => (prev ? { ...prev, email: e.target.value } : null))
                  }
                  required
                />
                {editFieldErrors.email && (
                  <p className="field-error" role="alert">
                    {editFieldErrors.email}
                  </p>
                )}
              </div>

              <div className="form-group mb-3">
                <label htmlFor="edit-dept">Department</label>
                <input
                  id="edit-dept"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Operations, IT, Finance"
                  value={editForm.department}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, department: e.target.value } : null
                    )
                  }
                />
              </div>

              <div className="form-group mb-3">
                <label htmlFor="edit-role">
                  Role <span className="text-danger">*</span>
                </label>
                <select
                  id="edit-role"
                  className="form-select"
                  value={editForm.role}
                  disabled={isEditingSelf}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, role: e.target.value as UserRole } : null
                    )
                  }
                >
                  <option value="REQUESTER">Requester</option>
                  <option value="IT_STAFF">IT Staff</option>
                  <option value="ADMINISTRATOR">Administrator</option>
                </select>
                {isEditingSelf && (
                  <p className="form-field-helper text-muted">
                    You cannot change your own administrator role.
                  </p>
                )}
              </div>

              <div className="form-check mb-3">
                <input
                  id="edit-is-active"
                  type="checkbox"
                  className="form-check-input"
                  checked={editForm.isActive}
                  disabled={isEditingSelf}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, isActive: e.target.checked } : null
                    )
                  }
                />
                <label htmlFor="edit-is-active" className="form-check-label">
                  Active Account
                </label>
                {isEditingSelf && (
                  <p className="form-field-helper text-muted">
                    You cannot deactivate your own account.
                  </p>
                )}
              </div>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeEditModal}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* RESET PASSWORD CONFIRMATION MODAL */}
      {resettingUser && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={resetModalRef}
            className="confirm-dialog reset-password-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-dialog-title"
            aria-describedby="reset-dialog-desc"
            onKeyDown={(e) => handleModalKeyDown(e, closeResetModal, resetModalRef)}
          >
            <h2 id="reset-dialog-title">Reset User Password?</h2>
            <p id="reset-dialog-desc">
              Are you sure you want to reset the password for{" "}
              <strong>{resettingUser.name}</strong> ({resettingUser.email})?
            </p>
            <div className="modal-info-box mb-4">
              <p className="mb-0 text-muted">
                The password will be reset to <code>ChangeMe-2026!</code>. The user will be required to set a new password on their next login, and all of their current active sessions will be terminated immediately.
              </p>
            </div>

            {resetError && (
              <div className="alert alert-danger mb-3" role="alert">
                {resetError}
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={closeResetModal}
                disabled={resetSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetPassword}
                disabled={resetSubmitting}
              >
                {resetSubmitting ? "Resetting…" : "Confirm Reset Password"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
