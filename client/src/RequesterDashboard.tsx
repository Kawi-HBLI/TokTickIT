import { useEffect, useState } from "react";
import {
  fetchRequesterDashboard,
  RequesterDashboardData,
} from "./api.js";
import { useRequester } from "./RequesterContext.js";

interface RequesterDashboardProps {
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

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RequesterDashboard({ onNavigate }: RequesterDashboardProps) {
  const { currentRequester } = useRequester();
  const [data, setData] = useState<RequesterDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRequesterDashboard();
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

  const userName = currentRequester?.name || "Requester";

  return (
    <div className="workspace-card requester-dashboard-workspace" id="requester-dashboard">
      <div className="workspace-header">
        <div>
          <p className="section-kicker">Requester Overview</p>
          <h1 className="page-title">
            Welcome back, {userName}! Here is the status of your requests.
          </h1>
          <p className="page-intro">
            Overview of your active, pending, and resolved support tickets.
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
          <button
            type="button"
            className="btn btn-primary create-ticket-cta"
            onClick={() => onNavigate("/tickets/new")}
          >
            <span aria-hidden="true" className="btn-icon">+</span> Create New Ticket
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="dashboard-loading state-message" role="status" aria-live="polite">
          <span className="busy-spinner" aria-hidden="true" />
          <span>Loading your requests summary…</span>
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
            Requester dashboard loaded with {data.metrics.activeTicketsCount} active tickets,{" "}
            {data.metrics.awaitingRequesterCount} tickets awaiting your input, and{" "}
            {data.metrics.resolvedClosedCount} resolved and closed tickets.
          </div>

          {/* Metric Cards Grid */}
          <section className="dashboard-metrics-grid" aria-label="Request summary metrics">
            {/* Card 1: Active Tickets */}
            <div className="metric-card" data-testid="metric-active-tickets">
              <div className="metric-card-header">
                <span className="metric-title">ACTIVE TICKETS</span>
              </div>
              <div className="metric-value">{data.metrics.activeTicketsCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/tickets?statusGroup=active")}
                >
                  View Active Tickets &rarr;
                </button>
              </div>
            </div>

            {/* Card 2: Awaiting Your Input */}
            <div className="metric-card" data-testid="metric-awaiting-input">
              <div className="metric-card-header">
                <span className="metric-title">AWAITING YOUR INPUT</span>
              </div>
              <div className="metric-value">{data.metrics.awaitingRequesterCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/tickets?status=WAITING_FOR_REQUESTER")}
                >
                  Provide Details &rarr;
                </button>
              </div>
            </div>

            {/* Card 3: Resolved & Closed */}
            <div className="metric-card" data-testid="metric-resolved-closed">
              <div className="metric-card-header">
                <span className="metric-title">RESOLVED & CLOSED</span>
              </div>
              <div className="metric-value">{data.metrics.resolvedClosedCount}</div>
              <div className="metric-action">
                <button
                  type="button"
                  className="metric-drilldown-link"
                  onClick={() => onNavigate("/tickets?statusGroup=resolved_closed")}
                >
                  View History &rarr;
                </button>
              </div>
            </div>
          </section>

          {/* Recent Ticket Activity */}
          <section className="dashboard-section" aria-labelledby="recent-tickets-heading">
            <div className="section-header-row">
              <h2 id="recent-tickets-heading" className="section-title">
                Recent Ticket Activity
              </h2>
            </div>
            {data.recentTickets.length === 0 ? (
              <p className="state-message">No recent ticket activity.</p>
            ) : (
              <div className="table-responsive">
                <table className="table queue-table" aria-label="Recent Ticket Activity table">
                  <thead>
                    <tr>
                      <th scope="col">Ticket Number</th>
                      <th scope="col">Summary</th>
                      <th scope="col">Status</th>
                      <th scope="col">Latest Update</th>
                      <th scope="col">Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button ticket-number-link"
                            onClick={() => onNavigate(`/tickets/${ticket.id}`)}
                          >
                            {ticket.ticketNumber}
                          </button>
                        </td>
                        <td className="ticket-summary-cell">{ticket.summary}</td>
                        <td>
                          <span
                            className={`badge badge-status-${ticket.currentStatus
                              .toLowerCase()
                              .replace(/_/g, "-")}`}
                          >
                            {formatStatus(ticket.currentStatus)}
                          </span>
                        </td>
                        <td className="ticket-latest-update-cell">{ticket.latestPublicUpdate}</td>
                        <td>{formatDate(ticket.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
