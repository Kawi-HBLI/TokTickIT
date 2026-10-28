import { useEffect, useState } from "react";
import {
  claimStaffTicket,
  fetchStaffDashboard,
  StaffDashboardData,
} from "./api.js";

interface StaffDashboardProps {
  onNavigate: (path: string) => void;
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

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 0) return "just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StaffDashboard({ onNavigate }: StaffDashboardProps) {
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null);
  const [claimMessage, setClaimMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStaffDashboard();
      setData(res.data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleClaim = async (ticketId: number) => {
    setClaimBusyId(ticketId);
    setClaimMessage(null);
    try {
      await claimStaffTicket(ticketId);
      setClaimMessage({ type: "success", text: `Successfully claimed ticket.` });
      await loadData();
    } catch (err: any) {
      console.error(err);
      setClaimMessage({ type: "error", text: err?.message || "Could not claim ticket. It may have already been claimed." });
    } finally {
      setClaimBusyId(null);
    }
  };

  return (
    <div className="workspace-card staff-dashboard-workspace" id="staff-dashboard">
      <div className="workspace-header">
        <div>
          <p className="section-kicker">IT Operations</p>
          <h1 className="page-title">Operational Overview</h1>
          <p className="page-intro">
            Real-time operational metrics and prioritized queues.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh Data"}
          </button>
        </div>
      </div>

      {claimMessage && (
        <div
          className={claimMessage.type === "success" ? "alert alert-success" : "alert alert-danger"}
          role={claimMessage.type === "error" ? "alert" : "status"}
        >
          {claimMessage.text}
        </div>
      )}

      {loading && !data ? (
        <div className="dashboard-loading state-message" role="status" aria-live="polite">
          <span className="busy-spinner" aria-hidden="true" />
          <span>Loading operational overview…</span>
        </div>
      ) : error ? (
        <div className="state-message state-message-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-outline-danger" onClick={loadData}>
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {/* Accessible Live Region */}
          <div aria-live="polite" className="visually-hidden">
            Operational dashboard loaded with {data.metrics.openTicketsCount} open tickets,{" "}
            {data.metrics.pendingActionsCount} pending actions,{" "}
            {data.metrics.completedActionsTodayCount} completed actions today, and{" "}
            {data.metrics.unassignedTicketsCount} unassigned tickets.
          </div>

          {/* Metric Cards Grid */}
          <section className="dashboard-metrics-grid" aria-label="Key operational metrics">
            {/* Card 1: Open Tickets */}
            <div className="metric-card" data-testid="metric-open-tickets">
              <div className="metric-card-header">
                <span className="metric-title">OPEN TICKETS</span>
                <span className="metric-scope-badge">(Team)</span>
              </div>
              <div className="metric-value">{data.metrics.openTicketsCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/staff/tickets?statusGroup=active")}
                >
                  View All Open &rarr;
                </button>
              </div>
            </div>

            {/* Card 2: Pending Actions */}
            <div className="metric-card" data-testid="metric-pending-actions">
              <div className="metric-card-header">
                <span className="metric-title">PENDING ACTIONS</span>
                <span className="metric-scope-badge">(My Actions)</span>
              </div>
              <div className="metric-value">{data.metrics.pendingActionsCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() =>
                    onNavigate("/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active")
                  }
                >
                  View tickets containing these actions
                </button>
              </div>
            </div>

            {/* Card 3: Completed Today */}
            <div className="metric-card" data-testid="metric-completed-today">
              <div className="metric-card-header">
                <span className="metric-title">COMPLETED TODAY</span>
                <span className="metric-scope-badge">(UTC)</span>
              </div>
              <div className="metric-value">{data.metrics.completedActionsTodayCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/staff/tickets?completedBy=me&completedDate=today")}
                >
                  View tickets containing these actions
                </button>
              </div>
            </div>

            {/* Card 4: Unassigned Queue */}
            <div className="metric-card" data-testid="metric-unassigned-queue">
              <div className="metric-card-header">
                <span className="metric-title">UNASSIGNED QUEUE</span>
                <span className="metric-scope-badge">(Team)</span>
              </div>
              <div className="metric-value">{data.metrics.unassignedTicketsCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/staff/tickets?owner=unassigned&statusGroup=active")}
                >
                  Claim Work &rarr;
                </button>
              </div>
            </div>
          </section>

          {/* My Assigned Work */}
          <section className="dashboard-section" aria-labelledby="my-work-heading">
            <div className="section-header-row">
              <h2 id="my-work-heading" className="section-title">
                My Assigned Work ({data.myWork.assignedTicketsCount} Tickets)
              </h2>
              <button
                type="button"
                className="link-button"
                onClick={() => onNavigate("/staff/tickets?owner=me")}
              >
                View Full Queue &rarr;
              </button>
            </div>
            {data.myWork.items.length === 0 ? (
              <p className="state-message">No assigned tickets in your queue.</p>
            ) : (
              <div className="table-responsive">
                <table className="table queue-table" aria-label="My Assigned Work table">
                  <thead>
                    <tr>
                      <th scope="col">Ticket Number</th>
                      <th scope="col">Summary</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                      <th scope="col">Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.myWork.items.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button ticket-number-link"
                            onClick={() => onNavigate(`/staff/tickets/${ticket.id}`)}
                          >
                            {ticket.ticketNumber}
                          </button>
                        </td>
                        <td className="ticket-summary-cell">{ticket.summary}</td>
                        <td>
                          <span
                            className={`badge badge-priority-${(
                              ticket.itPriority || ticket.requestedPriority
                            ).toLowerCase()}`}
                          >
                            {ticket.itPriority || ticket.requestedPriority}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-status-${ticket.currentStatus
                              .toLowerCase()
                              .replace(/_/g, "-")}`}
                          >
                            {formatStatus(ticket.currentStatus)}
                          </span>
                        </td>
                        <td>
                          {ticket.pendingActionsCount > 0 ? (
                            <span className="action-count-pending">
                              {ticket.pendingActionsCount} Pending
                            </span>
                          ) : (
                            <span className="action-count-none">0 Actions</span>
                          )}
                        </td>
                        <td>{formatDate(ticket.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Unassigned Team Work */}
          <section className="dashboard-section" aria-labelledby="unassigned-work-heading">
            <div className="section-header-row">
              <h2 id="unassigned-work-heading" className="section-title">
                Unassigned Team Work ({data.unassignedQueue.total} Tickets)
              </h2>
            </div>
            {data.unassignedQueue.items.length === 0 ? (
              <p className="state-message">No unassigned tickets in the queue.</p>
            ) : (
              <div className="table-responsive">
                <table className="table queue-table" aria-label="Unassigned Team Work table">
                  <thead>
                    <tr>
                      <th scope="col">Ticket Number</th>
                      <th scope="col">Summary</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created At</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unassignedQueue.items.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button ticket-number-link"
                            onClick={() => onNavigate(`/staff/tickets/${ticket.id}`)}
                          >
                            {ticket.ticketNumber}
                          </button>
                        </td>
                        <td className="ticket-summary-cell">{ticket.summary}</td>
                        <td>
                          <span
                            className={`badge badge-priority-${(
                              ticket.itPriority || ticket.requestedPriority
                            ).toLowerCase()}`}
                          >
                            {ticket.itPriority || ticket.requestedPriority}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-status-${ticket.currentStatus
                              .toLowerCase()
                              .replace(/_/g, "-")}`}
                          >
                            {formatStatus(ticket.currentStatus)}
                          </span>
                        </td>
                        <td>{formatDate(ticket.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-success btn-sm claim-ticket-btn"
                            disabled={claimBusyId === ticket.id}
                            onClick={() => void handleClaim(ticket.id)}
                          >
                            {claimBusyId === ticket.id ? "Claiming…" : "Claim Ticket"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent Action Activity */}
          <section className="dashboard-section" aria-labelledby="recent-actions-heading">
            <div className="section-header-row">
              <h2 id="recent-actions-heading" className="section-title">
                Recent Action Activity (Preview - Latest 10)
              </h2>
            </div>
            {data.recentActions.length === 0 ? (
              <p className="state-message">No recent action activity.</p>
            ) : (
              <ul className="recent-activity-list" aria-label="Recent Action Activity list">
                {data.recentActions.map((action) => (
                  <li key={action.id} className="recent-activity-item">
                    <span className="activity-performer">{action.performerName}</span>{" "}
                    <span className="activity-action-type">
                      {action.status === "COMPLETED"
                        ? "completed action"
                        : action.status === "CANCELLED"
                        ? "cancelled action"
                        : "worked on action"}{" "}
                      on{" "}
                    </span>
                    <button
                      type="button"
                      className="link-button activity-ticket-link"
                      onClick={() => onNavigate(`/staff/tickets/${action.ticketId}`)}
                    >
                      {action.ticketNumber}
                    </button>
                    : &ldquo;{action.result || action.description}&rdquo;
                    <span className="activity-time">
                      {" "}
                      ({formatRelativeTime(action.completedAt || action.updatedAt)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
