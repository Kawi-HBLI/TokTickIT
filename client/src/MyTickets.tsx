import { useEffect, useId, useState } from "react";
import {
  Category,
  getCategories,
  getMyTickets,
  PaginationMeta,
  RequestedPriority,
  TicketListItem,
  TicketQueryState,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";
import { formatTicketStatus } from "./ticket-status.js";

interface MyTicketsProps {
  onNavigate: (path: string) => void;
}

const defaultQuery: Required<TicketQueryState> = {
  search: "",
  categoryId: null,
  requestedPriority: null,
  statusGroup: null,
  status: null,
  sortBy: "updatedAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 10,
};

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

function parseRequesterSearchParams() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  return {
    search: params.get("search") || "",
    categoryId: params.get("categoryId") || "",
    priority: params.get("requestedPriority") || params.get("priority") || "",
    statusGroup: (params.get("statusGroup") as "active" | "resolved_closed" | null) || null,
    status: params.get("status") || "",
    sortBy: (params.get("sortBy") as "createdAt" | "updatedAt" | "requestedPriority") || "updatedAt",
    sortOrder: (params.get("sortOrder") as "asc" | "desc") || "desc",
    page: params.get("page") ? Math.max(1, parseInt(params.get("page")!, 10)) : 1,
    pageSize: (params.get("pageSize") ? parseInt(params.get("pageSize")!, 10) : 10) as 10 | 20 | 50,
  };
}

export default function MyTickets({ onNavigate }: MyTicketsProps) {
  const { currentRequester } = useRequester();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryState, setCategoryState] = useState<"loading" | "ready" | "error">("loading");
  const [categoryReload, setCategoryReload] = useState(0);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const [search, setSearch] = useState(() => parseRequesterSearchParams().search);
  const [categoryId, setCategoryId] = useState<string>(() => parseRequesterSearchParams().categoryId);
  const [priority, setPriority] = useState<string>(() => parseRequesterSearchParams().priority);
  const [statusGroup, setStatusGroup] = useState<"active" | "resolved_closed" | null>(() => parseRequesterSearchParams().statusGroup);
  const [status, setStatus] = useState<string>(() => parseRequesterSearchParams().status);
  const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "requestedPriority">(() => parseRequesterSearchParams().sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => parseRequesterSearchParams().sortOrder);
  const [page, setPage] = useState<number>(() => parseRequesterSearchParams().page);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(() => parseRequesterSearchParams().pageSize);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listReload, setListReload] = useState(0);

  // Listen to popstate
  useEffect(() => {
    const onPop = () => {
      const sp = parseRequesterSearchParams();
      setSearch(sp.search);
      setCategoryId(sp.categoryId);
      setPriority(sp.priority);
      setStatusGroup(sp.statusGroup);
      setStatus(sp.status);
      setSortBy(sp.sortBy);
      setSortOrder(sp.sortOrder);
      setPage(sp.page);
      setPageSize(sp.pageSize);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const searchInputId = useId();
  const categoryFilterId = useId();
  const priorityFilterId = useId();
  const sortSelectId = useId();
  const sortOrderId = useId();
  const pageSizeId = useId();

  useEffect(() => {
    let current = true;
    setCategoryState("loading");
    getCategories().then(data => {
      if (!current) return;
      setCategories(data);
      setCategoryState("ready");
    }).catch(() => {
      if (current) setCategoryState("error");
    });
    return () => { current = false; };
  }, [categoryReload]);

  // Fetch tickets whenever parameters or requester changes
  useEffect(() => {
    if (!currentRequester) return;
    let current = true;
    setLoading(true);
    setError(null);

    const query: TicketQueryState = {
      search: search.trim() || undefined,
      categoryId: categoryId ? Number(categoryId) : null,
      requestedPriority: (priority as RequestedPriority) || null,
      statusGroup: statusGroup || null,
      status: status || null,
      sortBy,
      sortOrder,
      page,
      pageSize,
    };

    // Reflect query parameters into URL
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("search", search.trim());
    if (categoryId) sp.set("categoryId", categoryId);
    if (priority) sp.set("requestedPriority", priority);
    if (statusGroup) sp.set("statusGroup", statusGroup);
    if (status) sp.set("status", status);
    if (sortBy !== "updatedAt") sp.set("sortBy", sortBy);
    if (sortOrder !== "desc") sp.set("sortOrder", sortOrder);
    if (page > 1) sp.set("page", String(page));
    if (pageSize !== 10) sp.set("pageSize", String(pageSize));
    const qs = sp.toString();
    const nextUrl = `/tickets${qs ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({}, "", nextUrl);
    }

    getMyTickets(query)
      .then((res) => {
        if (!current) return;
        setTickets(res.data);
        setPagination(res.pagination);
        setLoading(false);
      })
      .catch((err) => {
        if (!current) return;
        console.error(err);
        setError(err.message || "Failed to load tickets.");
        setLoading(false);
      });
    // Ignore every completion from obsolete queries, including errors/loading changes.
    return () => { current = false; };
  }, [currentRequester?.id, search, categoryId, priority, statusGroup, status, sortBy, sortOrder, page, pageSize, listReload]);

  // Handler to clear all filters
  const handleClearFilters = () => {
    setSearch("");
    setCategoryId("");
    setPriority("");
    setStatusGroup(null);
    setStatus("");
    setSortBy("updatedAt");
    setSortOrder("desc");
    setPage(1);
    window.history.replaceState({}, "", "/tickets");
  };

  const hasActiveFilters = Boolean(search.trim() || categoryId || priority || statusGroup || status);

  // Pagination calculation
  const startItem = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);

  return (
    <div className="workspace-card my-tickets-workspace" id="my-tickets">
      <div className="workspace-header">
        <div>
          <p className="section-kicker">Requester workspace</p>
          <h1 className="page-title">Welcome, {currentRequester?.name}</h1>
          <h2 className="section-title">My Tickets</h2>
          <p className="page-intro">
            View, track, and manage support tickets requested under your persona.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary create-ticket-cta"
          onClick={() => onNavigate("/tickets/new")}
        >
          <span aria-hidden="true" className="btn-icon">+</span> Create Ticket
        </button>
      </div>

      {/* Filter and Control Toolbar */}
      <section className="filter-toolbar" aria-label="Ticket filters and search">
        <div className="filter-grid">
          <div className="filter-field search-field">
            <label htmlFor={searchInputId} className="filter-label">
              Search by Ticket Number or Summary
            </label>
            <input
              id={searchInputId}
              type="search"
              className="form-control"
              placeholder="e.g. TKT-2026-00001 or VPN issue"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="filter-field">
            <label htmlFor={categoryFilterId} className="filter-label">
              Category
            </label>
            <select
              id={categoryFilterId}
              className="form-select"
              value={categoryId}
              disabled={categoryState !== "ready" || categories.length === 0}
              aria-describedby={categoryState !== "ready" || categories.length === 0 ? `${categoryFilterId}-status` : undefined}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categoryState === "loading" && <p id={`${categoryFilterId}-status`} role="status">Loading Categories...</p>}
            {categoryState === "error" && <div id={`${categoryFilterId}-status`} role="alert">
              <p>Categories could not be loaded. Other filters are still available.</p>
              <button type="button" className="btn btn-outline-success" onClick={() => setCategoryReload(value => value + 1)}>Retry Categories</button>
            </div>}
            {categoryState === "ready" && categories.length === 0 && <p id={`${categoryFilterId}-status`} role="status">No active Categories are available.</p>}
          </div>

          <div className="filter-field">
            <label htmlFor={priorityFilterId} className="filter-label">
              Requested Priority
            </label>
            <select
              id={priorityFilterId}
              className="form-select"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor={sortSelectId} className="filter-label">
              Sort by
            </label>
            <select
              id={sortSelectId}
              className="form-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="updatedAt">Last Updated</option>
              <option value="createdAt">Created Date</option>
              <option value="requestedPriority">Requested Priority</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor={sortOrderId} className="filter-label">
              Direction
            </label>
            <select
              id={sortOrderId}
              className="form-select"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as "asc" | "desc");
                setPage(1);
              }}
            >
              <option value="desc">Descending (High to Low / Newest first)</option>
              <option value="asc">Ascending (Low to High / Oldest first)</option>
            </select>
          </div>

          <div className="filter-field page-size-field">
            <label htmlFor={pageSizeId} className="filter-label">
              Page Size
            </label>
            <select
              id={pageSizeId}
              className="form-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as 10 | 20 | 50);
                setPage(1);
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-link clear-filters-btn"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          </div>
        )}
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
            {status === "WAITING_FOR_REQUESTER" && (
              <span className="filter-badge">Awaiting Your Input</span>
            )}
            {status && status !== "WAITING_FOR_REQUESTER" && (
              <span className="filter-badge">Status: {formatTicketStatus(status as any)}</span>
            )}
            {search.trim() && (
              <span className="filter-badge">Search: &ldquo;{search.trim()}&rdquo;</span>
            )}
            {priority && (
              <span className="filter-badge">Priority: {priority}</span>
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

      {/* Main Content Area */}
      {loading ? (
        <div className="ticket-loading-state" aria-live="polite" aria-busy="true">
          <div className="busy-spinner" aria-hidden="true" />
          <span>Loading tickets…</span>
        </div>
      ) : error ? (
        <div className="state-message state-message-error" role="alert">
          <p><strong>Error loading tickets:</strong> {error}</p>
          <button type="button" className="btn btn-outline-danger" onClick={() => setListReload(value => value + 1)}>
            Retry
          </button>
        </div>
      ) : tickets.length === 0 ? (
        hasActiveFilters ? (
          <div className="empty-state no-results-state">
            <div className="empty-icon" aria-hidden="true">🔍</div>
            <h2>No matching tickets found</h2>
            <p>We could not find any tickets matching your search or active filters.</p>
            <button type="button" className="btn btn-secondary" onClick={handleClearFilters}>
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">📋</div>
            <h2>No tickets yet</h2>
            <p>You haven't submitted any support requests yet.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate("/tickets/new")}
            >
              Create Ticket
            </button>
          </div>
        )
      ) : (
        <>
          {/* Desktop Table */}
          <div className="ticket-table-container">
            <table className="ticket-table" aria-label="My tickets list">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Related System</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Updated</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="ticket-row">
                    <td className="ticket-number-cell">
                      <span className="ticket-number">{ticket.ticketNumber}</span>
                    </td>
                    <td className="ticket-summary-cell">
                      <strong className="ticket-summary-text">{ticket.summary}</strong>
                      {ticket.activeAttachmentCount > 0 && (
                        <span className="attachment-pill" title={`${ticket.activeAttachmentCount} attachment(s)`}>
                          📎 {ticket.activeAttachmentCount}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="meta-tag">{ticket.category.name}</span>
                    </td>
                    <td>
                      <span className="meta-tag">{ticket.relatedSystem.name}</span>
                    </td>
                    <td>
                      <span className={`priority-badge priority-${ticket.requestedPriority.toLowerCase()}`}>
                        {ticket.requestedPriority}
                      </span>
                    </td>
                    <td>
                      <span className="status-badge status-new">
                        {formatTicketStatus(ticket.currentStatus)}
                      </span>
                    </td>
                    <td className="ticket-date-cell">
                      <time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary view-details-btn"
                        onClick={() => onNavigate(`/tickets/${ticket.id}`)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile and Tablet Cards */}
          <div className="ticket-card-list" aria-label="My tickets card list">
            {tickets.map((ticket) => (
              <article key={ticket.id} className="mobile-ticket-card">
                <div className="card-header">
                  <span className="ticket-number">{ticket.ticketNumber}</span>
                  <span className="status-badge status-new">{formatTicketStatus(ticket.currentStatus)}</span>
                </div>
                <h3 className="card-summary">{ticket.summary}</h3>
                <div className="card-meta">
                  <div className="meta-row">
                    <span className="meta-label">Category:</span>
                    <span className="meta-val">{ticket.category.name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">System:</span>
                    <span className="meta-val">{ticket.relatedSystem.name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Priority:</span>
                    <span className={`priority-badge priority-${ticket.requestedPriority.toLowerCase()}`}>
                      {ticket.requestedPriority}
                    </span>
                  </div>
                  {ticket.activeAttachmentCount > 0 && (
                    <div className="meta-row">
                      <span className="meta-label">Attachments:</span>
                      <span className="meta-val">📎 {ticket.activeAttachmentCount} file(s)</span>
                    </div>
                  )}
                  <div className="meta-row">
                    <span className="meta-label">Updated:</span>
                    <span className="meta-val">{formatDate(ticket.updatedAt)}</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-block view-details-btn"
                    onClick={() => onNavigate(`/tickets/${ticket.id}`)}
                  >
                    View Details
                  </button>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination Controls */}
          <nav className="pagination-wrapper" aria-label="Tickets pagination">
            <div className="pagination-info">
              Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of <strong>{pagination.totalItems}</strong> tickets
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-outline-secondary pagination-btn"
                disabled={!pagination.hasPreviousPage || pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>

              <span className="current-page-indicator">
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>

              <button
                type="button"
                className="btn btn-outline-secondary pagination-btn"
                disabled={!pagination.hasNextPage || pagination.page >= pagination.totalPages}
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
