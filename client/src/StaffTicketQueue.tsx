import { useEffect, useId, useState } from "react";
import {
  Category,
  fetchStaffAssignees,
  fetchStaffTickets,
  getCategories,
  PaginationMeta,
  StaffAssignee,
  StaffQueueItem,
  StaffQueueQuery,
  StaffSortBy,
  StaffSortDirection,
} from "./api.js";

interface StaffTicketQueueProps {
  onNavigate: (path: string) => void;
  url?: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseStaffSearchParams() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  return {
    q: params.get("q") || "",
    status: params.get("status") || "",
    requestedPriority: params.get("requestedPriority") || "",
    itPriority: params.get("itPriority") || "",
    categoryId: params.get("categoryId") || "",
    owner: params.get("owner") || "",
    statusGroup: (params.get("statusGroup") as "active" | "resolved_closed" | null) || null,
    actionAssignee: params.get("actionAssignee") || null,
    actionStatus: params.get("actionStatus") || null,
    completedBy: params.get("completedBy") || null,
    completedDate: params.get("completedDate") || null,
    sortBy: (params.get("sortBy") as StaffSortBy) || "updatedAt",
    sortDirection: (params.get("sortDirection") as StaffSortDirection) || "desc",
    page: params.get("page") ? Math.max(1, parseInt(params.get("page")!, 10)) : 1,
    pageSize: (params.get("pageSize") ? parseInt(params.get("pageSize")!, 10) : 20) as 10 | 20 | 50,
  };
}

export default function StaffTicketQueue({ onNavigate, url }: StaffTicketQueueProps) {
  const [tickets, setTickets] = useState<StaffQueueItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignees, setAssignees] = useState<StaffAssignee[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const [search, setSearch] = useState(() => parseStaffSearchParams().q);
  const [status, setStatus] = useState(() => parseStaffSearchParams().status);
  const [requestedPriority, setRequestedPriority] = useState(() => parseStaffSearchParams().requestedPriority);
  const [itPriority, setItPriority] = useState(() => parseStaffSearchParams().itPriority);
  const [categoryId, setCategoryId] = useState(() => parseStaffSearchParams().categoryId);
  const [owner, setOwner] = useState(() => parseStaffSearchParams().owner);
  const [statusGroup, setStatusGroup] = useState<"active" | "resolved_closed" | null>(() => parseStaffSearchParams().statusGroup);
  const [actionAssignee, setActionAssignee] = useState<string | null>(() => parseStaffSearchParams().actionAssignee);
  const [actionStatus, setActionStatus] = useState<string | null>(() => parseStaffSearchParams().actionStatus);
  const [completedBy, setCompletedBy] = useState<string | null>(() => parseStaffSearchParams().completedBy);
  const [completedDate, setCompletedDate] = useState<string | null>(() => parseStaffSearchParams().completedDate);
  const [sortBy, setSortBy] = useState<StaffSortBy>(() => parseStaffSearchParams().sortBy);
  const [sortDirection, setSortDirection] = useState<StaffSortDirection>(() => parseStaffSearchParams().sortDirection);
  const [page, setPage] = useState<number>(() => parseStaffSearchParams().page);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(() => parseStaffSearchParams().pageSize);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status?: number; code?: string; message: string } | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const onPop = () => {
      const sp = parseStaffSearchParams();
      setSearch(sp.q);
      setStatus(sp.status);
      setRequestedPriority(sp.requestedPriority);
      setItPriority(sp.itPriority);
      setCategoryId(sp.categoryId);
      setOwner(sp.owner);
      setStatusGroup(sp.statusGroup);
      setActionAssignee(sp.actionAssignee);
      setActionStatus(sp.actionStatus);
      setCompletedBy(sp.completedBy);
      setCompletedDate(sp.completedDate);
      setSortBy(sp.sortBy);
      setSortDirection(sp.sortDirection);
      setPage(sp.page);
      setPageSize(sp.pageSize);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Re-sync query state when navigation changes route / url
  useEffect(() => {
    if (url !== undefined) {
      const sp = parseStaffSearchParams();
      setSearch(sp.q);
      setStatus(sp.status);
      setRequestedPriority(sp.requestedPriority);
      setItPriority(sp.itPriority);
      setCategoryId(sp.categoryId);
      setOwner(sp.owner);
      setStatusGroup(sp.statusGroup);
      setActionAssignee(sp.actionAssignee);
      setActionStatus(sp.actionStatus);
      setCompletedBy(sp.completedBy);
      setCompletedDate(sp.completedDate);
      setSortBy(sp.sortBy);
      setSortDirection(sp.sortDirection);
      setPage(sp.page);
      setPageSize(sp.pageSize);
    }
  }, [url]);

  const searchId = useId();
  const statusId = useId();
  const reqPriorityId = useId();
  const itPriorityId = useId();
  const categoryFilterId = useId();
  const ownerFilterId = useId();
  const sortById = useId();
  const sortDirectionId = useId();
  const pageSizeId = useId();

  // Load reference categories and assignees once
  useEffect(() => {
    let active = true;
    Promise.all([
      getCategories().catch(() => []),
      fetchStaffAssignees().then((res) => res.data).catch(() => []),
    ]).then(([cats, users]) => {
      if (!active) return;
      setCategories(cats);
      setAssignees(users);
    });
    return () => {
      active = false;
    };
  }, []);

  // Fetch tickets
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const query: StaffQueueQuery = {
      q: search.trim() || undefined,
      status: status || null,
      requestedPriority: requestedPriority || null,
      itPriority: itPriority || null,
      categoryId: categoryId ? Number(categoryId) : null,
      owner: owner || null,
      statusGroup: statusGroup || null,
      actionAssignee: actionAssignee || null,
      actionStatus: actionStatus || null,
      completedBy: completedBy || null,
      completedDate: completedDate || null,
      sortBy,
      sortDirection,
      page,
      pageSize,
    };

    // Reflect query parameters into URL
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    if (status) sp.set("status", status);
    if (requestedPriority) sp.set("requestedPriority", requestedPriority);
    if (itPriority) sp.set("itPriority", itPriority);
    if (categoryId) sp.set("categoryId", categoryId);
    if (owner) sp.set("owner", owner);
    if (statusGroup) sp.set("statusGroup", statusGroup);
    if (actionAssignee) sp.set("actionAssignee", actionAssignee);
    if (actionStatus) sp.set("actionStatus", actionStatus);
    if (completedBy) sp.set("completedBy", completedBy);
    if (completedDate) sp.set("completedDate", completedDate);
    if (sortBy !== "updatedAt") sp.set("sortBy", sortBy);
    if (sortDirection !== "desc") sp.set("sortDirection", sortDirection);
    if (page > 1) sp.set("page", String(page));
    if (pageSize !== 20) sp.set("pageSize", String(pageSize));
    const qs = sp.toString();
    const nextUrl = `/staff/tickets${qs ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({}, "", nextUrl);
    }

    fetchStaffTickets(query)
      .then((res) => {
        if (!active) return;
        setTickets(res.data);
        setPagination(res.pagination);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        const status = err?.status;
        const code = err?.code;
        const message =
          status === 403
            ? "You do not have permission to view the staff ticket queue. Only IT Staff and Administrators may access this queue."
            : err?.message || "Failed to load ticket queue.";
        setError({ status, code, message });
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    search,
    status,
    requestedPriority,
    itPriority,
    categoryId,
    owner,
    statusGroup,
    actionAssignee,
    actionStatus,
    completedBy,
    completedDate,
    sortBy,
    sortDirection,
    page,
    pageSize,
    reloadTrigger,
  ]);

  const hasActiveFilters = Boolean(
    search.trim() ||
    status ||
    requestedPriority ||
    itPriority ||
    categoryId ||
    owner ||
    statusGroup ||
    actionAssignee ||
    actionStatus ||
    completedBy ||
    completedDate
  );

  const handleClearFilters = () => {
    setSearch("");
    setStatus("");
    setRequestedPriority("");
    setItPriority("");
    setCategoryId("");
    setOwner("");
    setStatusGroup(null);
    setActionAssignee(null);
    setActionStatus(null);
    setCompletedBy(null);
    setCompletedDate(null);
    setSortBy("updatedAt");
    setSortDirection("desc");
    setPage(1);
    window.history.replaceState({}, "", "/staff/tickets");
  };

  const startItem = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);

  return (
    <div className="workspace-card staff-queue-workspace" id="staff-queue">
      <div className="workspace-header">
        <div>
          <p className="section-kicker">IT Operations</p>
          <h1 className="page-title">Ticket Queue</h1>
          <p className="page-intro">
            Centralized operational ticket queue for triage, assignment, and status updates.
          </p>
        </div>
      </div>

      {/* Accessible Live Region */}
      <div aria-live="polite" className="visually-hidden">
        {loading
          ? "Loading ticket queue…"
          : error
          ? `Error loading tickets: ${error}`
          : pagination.totalItems === 0
          ? hasActiveFilters
            ? "No tickets matched your filter criteria."
            : "The ticket queue is currently empty."
          : `Showing ${startItem} to ${endItem} of ${pagination.totalItems} tickets.`}
      </div>

      {/* Filter Toolbar */}
      <section className="queue-filter-toolbar" aria-label="Ticket Queue Filters">
        <div className="filter-group filter-search">
          <label htmlFor={searchId}>Search tickets</label>
          <input
            id={searchId}
            type="search"
            className="form-control"
            placeholder="Search by ticket #, summary, requester, category"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label htmlFor={statusId}>Status</label>
            <select
              id={statusId}
              className="form-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="NEW">New</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_FOR_REQUESTER">Waiting for Requester</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
              <option value="REOPENED">Reopened</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={reqPriorityId}>Req. Priority</label>
            <select
              id={reqPriorityId}
              className="form-select"
              value={requestedPriority}
              onChange={(e) => {
                setRequestedPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All requested priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={itPriorityId}>IT Priority</label>
            <select
              id={itPriorityId}
              className="form-select"
              value={itPriority}
              onChange={(e) => {
                setItPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All IT priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={categoryFilterId}>Category</label>
            <select
              id={categoryFilterId}
              className="form-select"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={ownerFilterId}>Owner</label>
            <select
              id={ownerFilterId}
              className="form-select"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              <option value="me">Assigned to me</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role === "ADMINISTRATOR" ? "Admin" : "Staff"})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-row filter-controls-row">
          <div className="filter-group">
            <label htmlFor={sortById}>Sort by</label>
            <select
              id={sortById}
              className="form-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as StaffSortBy);
                setPage(1);
              }}
            >
              <option value="updatedAt">Updated date</option>
              <option value="createdAt">Created date</option>
              <option value="requestedPriority">Requested priority</option>
              <option value="itPriority">IT priority</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={sortDirectionId}>Direction</label>
            <select
              id={sortDirectionId}
              className="form-select"
              value={sortDirection}
              onChange={(e) => {
                setSortDirection(e.target.value as StaffSortDirection);
                setPage(1);
              }}
            >
              <option value="desc">Descending (Newest / Highest)</option>
              <option value="asc">Ascending (Oldest / Lowest)</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor={pageSizeId}>Page size</label>
            <select
              id={pageSizeId}
              className="form-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as 10 | 20 | 50);
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
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
      </section>

      {hasActiveFilters && (
        <div className="active-filters-container" aria-label="Active filters">
          <span className="active-filters-label">Filtered by:</span>
          <div className="active-filter-badges">
            {statusGroup === "active" && (
              <span className="filter-badge">Active Tickets</span>
            )}
            {statusGroup === "resolved_closed" && (
              <span className="filter-badge">Resolved &amp; Closed</span>
            )}
            {owner === "unassigned" && (
              <span className="filter-badge">Unassigned</span>
            )}
            {owner === "me" && (
              <span className="filter-badge">Assigned to Me</span>
            )}
            {actionAssignee === "me" && actionStatus === "PENDING" && (
              <span className="filter-badge">Pending Actions Assigned to Me</span>
            )}
            {completedBy === "me" && completedDate === "today" && (
              <span className="filter-badge">Completed Today (UTC)</span>
            )}
            {search.trim() && (
              <span className="filter-badge">Search: &ldquo;{search.trim()}&rdquo;</span>
            )}
            {status && (
              <span className="filter-badge">Status: {formatStatus(status)}</span>
            )}
            {requestedPriority && (
              <span className="filter-badge">Req. Priority: {requestedPriority}</span>
            )}
            {itPriority && (
              <span className="filter-badge">IT Priority: {itPriority}</span>
            )}
            {categoryId && (
              <span className="filter-badge">
                Category: {categories.find((c) => String(c.id) === String(categoryId))?.name || categoryId}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm clear-filters-btn"
            onClick={handleClearFilters}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Main Content Areas */}
      {loading ? (
        <div className="queue-state-box loading-box" role="status">
          <p className="state-message">Loading ticket queue…</p>
        </div>
      ) : error ? (
        error.status === 403 ? (
          <div className="queue-state-box forbidden-box" role="alert">
            <h2>Access denied</h2>
            <p className="state-message state-message-error">{error.message}</p>
            <button
              type="button"
              className="btn btn-outline-success"
              onClick={() => onNavigate("/tickets")}
            >
              Go to My Tickets
            </button>
          </div>
        ) : (
          <div className="queue-state-box error-box" role="alert">
            <h2>Failed to load ticket queue</h2>
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
      ) : tickets.length === 0 ? (
        hasActiveFilters ? (
          <div className="queue-state-box no-results-box" role="status">
            <h2>No matching tickets</h2>
            <p className="state-message">
              No tickets matched your search and filter criteria. Try broadening your query or clear active filters.
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
            <h2>Queue is empty</h2>
            <p className="state-message">
              The ticket queue is currently empty. There are no tickets requiring action at this time.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Desktop Table View (>= 992px) */}
          <div className="staff-queue-table-container">
            <table className="staff-queue-table" aria-label="Support Tickets">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Requester</th>
                  <th scope="col">Req. Priority</th>
                  <th scope="col">IT Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Last Updated</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="ticket-number-cell">
                      <strong>{t.ticketNumber}</strong>
                    </td>
                    <td className="summary-cell">
                      <span className="ticket-summary-text">{t.summary}</span>
                      <span className="category-pill">{t.category.name}</span>
                    </td>
                    <td className="requester-cell">
                      <span>{t.requester.name}</span>
                    </td>
                    <td>
                      <span className={`badge badge-priority badge-priority-${t.requestedPriority.toLowerCase()}`}>
                        {t.requestedPriority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-priority badge-priority-${t.itPriority.toLowerCase()}`}>
                        {t.itPriority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-status badge-status-${t.currentStatus.toLowerCase().replace(/_/g, "-")}`}>
                        {formatStatus(t.currentStatus)}
                      </span>
                      {t.requesterResolutionIndicatedAt && (
                        <span className="resolution-indicated-tag" title="Requester indicated problem appears resolved">
                          ✓ Resolved?
                        </span>
                      )}
                    </td>
                    <td className="owner-cell">
                      {t.owner ? (
                        <span>{t.owner.name}</span>
                      ) : (
                        <span className="badge badge-unassigned">Unassigned</span>
                      )}
                    </td>
                    <td className="date-cell">
                      <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
                    </td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success"
                        aria-label={`View details for ${t.ticketNumber}`}
                        onClick={() => onNavigate(`/staff/tickets/${t.id}`)}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Small Screen Cards View (< 992px) */}
          <div className="staff-queue-cards" aria-label="Support Tickets Cards">
            {tickets.map((t) => (
              <article className="staff-ticket-card" key={t.id}>
                <div className="card-top-row">
                  <span className="ticket-card-number">{t.ticketNumber}</span>
                  <span className={`badge badge-status badge-status-${t.currentStatus.toLowerCase().replace(/_/g, "-")}`}>
                    {formatStatus(t.currentStatus)}
                  </span>
                </div>
                <h3 className="ticket-card-summary">{t.summary}</h3>
                <div className="ticket-card-meta">
                  <div className="meta-row">
                    <span className="meta-label">Requester:</span>
                    <span className="meta-value">{t.requester.name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Category:</span>
                    <span className="meta-value">{t.category.name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Req / IT Priority:</span>
                    <span className="meta-value">
                      <span className={`badge badge-priority badge-priority-${t.requestedPriority.toLowerCase()}`}>
                        {t.requestedPriority}
                      </span>{" "}
                      /{" "}
                      <span className={`badge badge-priority badge-priority-${t.itPriority.toLowerCase()}`}>
                        {t.itPriority}
                      </span>
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Owner:</span>
                    <span className="meta-value">
                      {t.owner ? t.owner.name : <span className="badge badge-unassigned">Unassigned</span>}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Updated:</span>
                    <span className="meta-value">{formatDate(t.updatedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-success btn-full-width"
                  aria-label={`View details for ${t.ticketNumber}`}
                  onClick={() => onNavigate(`/staff/tickets/${t.id}`)}
                >
                  View details
                </button>
              </article>
            ))}
          </div>

          {/* Pagination Navigation */}
          <nav className="queue-pagination" aria-label="Ticket Queue Pagination">
            <span className="pagination-summary">
              Showing {startItem}–{endItem} of {pagination.totalItems} tickets (Page {pagination.page} of {pagination.totalPages || 1})
            </span>
            <div className="pagination-buttons">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={!pagination.hasPreviousPage || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={!pagination.hasNextPage || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
