import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { checkSystem, Category, CurrentUser } from "./api.js";
import ChangePassword from "./ChangePassword.js";
import CreateTicket from "./CreateTicket.js";
import Login from "./Login.js";
import MyTickets from "./MyTickets.js";
import PrimaryNavigation from "./PrimaryNavigation.js";
import { RequesterProvider, useRequester } from "./RequesterContext.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import RequesterDashboard from "./RequesterDashboard.js";
import StaffTicketQueue from "./StaffTicketQueue.js";
import StaffTicketDetail from "./StaffTicketDetail.js";
import StaffDashboard from "./StaffDashboard.js";
import UserManagement from "./UserManagement.js";

type UiState = "idle" | "loading" | "success" | "error";

function roleHome(user: CurrentUser): string {
  if (user.role === "IT_STAFF") return "/staff/tickets";
  if (user.role === "ADMINISTRATOR") return "/admin/users";
  return "/tickets";
}

function replaceRoute(next: string): void {
  window.history.replaceState({}, "", next);
}

function SystemDiagnostics() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  async function handleCheck() {
    setState("loading");
    try { const result = await checkSystem(); setCategories(result.categories); setState("success"); }
    catch (error) { console.error(error); setState("error"); }
  }
  return <section className="diagnostics" aria-labelledby="diagnostics-title"><div><p className="section-kicker">Development diagnostics</p><h2 id="diagnostics-title">API system check</h2></div><button className="btn btn-outline-success" onClick={handleCheck} disabled={state === "loading"}>{state === "loading" ? "Loading…" : "Check System"}</button><div aria-live="polite" className="diagnostic-result">{state === "success" && <div className="alert alert-success mb-0"><h3 className="h5">System Status: Online</h3>{categories.length > 0 && <><p className="mb-2"><strong>Available Categories:</strong></p><ul className="mb-0">{categories.map((category) => <li key={category.id}>{category.name}</li>)}</ul></>}</div>}{state === "error" && <div className="alert alert-danger mb-0" role="alert"><h3 className="h5">System Status: Offline</h3><p className="mb-0">The backend API is currently unavailable. Please check if the server is running.</p></div>}</div></section>;
}

function RoleWorkspace({ user, onLogout }: { user: CurrentUser; onLogout: () => Promise<void> }) {
  const [route, setRoute] = useState<string>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const full = path + search;
    if (path === "/staff/dashboard") return full;
    if (user.role === "ADMINISTRATOR" && path === "/admin/users") return full;
    if (/^\/staff\/tickets(\/\d+)?$/.test(path)) return full;
    return "/staff/tickets";
  });
  const [navKey, setNavKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  async function logout() { try { await onLogout(); } catch { setMessage("We could not sign you out right now. Try again."); } }
  function navigate(next: string) {
    const current = window.location.pathname + window.location.search;
    if (current !== next) {
      window.history.pushState({}, "", next);
      setRoute(next);
      setNavKey((k) => k + 1);
      window.dispatchEvent(new Event("popstate"));
    } else {
      setNavKey((k) => k + 1);
      window.dispatchEvent(new Event("popstate"));
    }
  }
  useEffect(() => {
    const onPop = () => {
      setRoute(window.location.pathname + window.location.search);
      setNavKey((k) => k + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <main className="app-page" id="top">
      <header className="app-shell">
        <a className="shell-brand" href="#top" aria-label="TokTickIT home">TokTickIT</a>
        <PrimaryNavigation
          route={route}
          items={[
            { label: "Dashboard", active: route === "/staff/dashboard" || route.startsWith("/staff/dashboard?"), onNavigate: () => navigate("/staff/dashboard") },
            { label: "Ticket Queue", active: route === "/staff/tickets" || route.startsWith("/staff/tickets?") || /^\/staff\/tickets\/\d+/.test(route), onNavigate: () => navigate("/staff/tickets") },
            ...(user.role === "ADMINISTRATOR" ? [{ label: "User Management", active: route === "/admin/users" || route.startsWith("/admin/users?"), onNavigate: () => navigate("/admin/users") }] : []),
          ]}
        />
        <div className="requester-identity">
          <span>{user.role === "IT_STAFF" ? "IT Staff" : "Administrator"}</span>
          <strong>{user.name}</strong>
          <button className="link-button" type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </header>
      {message && <p className="form-alert" role="alert">{message}</p>}
      {route === "/staff/dashboard" || route.startsWith("/staff/dashboard?") ? (
        <StaffDashboard onNavigate={navigate} />
      ) : route.match(/^\/staff\/tickets\/(\d+)(?:\?.*)?$/) ? (
        <StaffTicketDetail
          ticketId={parseInt(route.match(/^\/staff\/tickets\/(\d+)(?:\?.*)?$/)![1], 10)}
          onNavigate={navigate}
        />
      ) : route === "/staff/tickets" || route.startsWith("/staff/tickets?") ? (
        <StaffTicketQueue key={`${route.split("?")[0]}:${navKey}`} onNavigate={navigate} url={route} />
      ) : route === "/admin/users" && user.role === "ADMINISTRATOR" ? (
        <UserManagement onNavigate={navigate} />
      ) : (
        <section className="workspace-card" aria-labelledby="role-workspace-title">
          <h1 id="role-workspace-title">User Management</h1>
          <p className="page-intro">User Management is only accessible to Administrators.</p>
        </section>
      )}
    </main>
  );
}

function RequesterWorkspace({ user, onLogout }: { user: CurrentUser; onLogout: () => Promise<void> }) {
  const [route, setRoute] = useState<string>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const full = path + search;
    return path === "/dashboard" || path === "/tickets/new" || /^\/tickets\/\d+$/.test(path) || path === "/tickets" ? full : "/tickets";
  });
  const [navKey, setNavKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"cancel" | null>(null);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const search = window.location.search;
      const full = path + search;
      const next = path === "/dashboard" || path === "/tickets/new" || /^\/tickets\/\d+$/.test(path) || path === "/tickets" ? full : "/tickets";
      if (isBusy || (route.startsWith("/tickets/new") && isDirty && next !== route)) {
        window.history.pushState({}, "", route);
        if (!isBusy) openConfirmation();
        return;
      }
      setRoute(next);
      setNavKey((k) => k + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isBusy, isDirty, route]);
  useEffect(() => { const content = contentRef.current; if (content) confirmation ? content.setAttribute("inert", "") : content.removeAttribute("inert"); if (confirmation) keepEditingButton.current?.focus(); if (!confirmation) previousFocus.current?.focus(); }, [confirmation]);
  function openConfirmation() { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setConfirmation("cancel"); }
  function closeConfirmation() { setConfirmation(null); }
  function navigate(next: string) {
    if (isBusy) return;
    if (route.startsWith("/tickets/new") && isDirty) { openConfirmation(); return; }
    const current = window.location.pathname + window.location.search;
    if (current !== next) {
      window.history.pushState({}, "", next);
      setRoute(next);
      setNavKey((k) => k + 1);
      window.dispatchEvent(new Event("popstate"));
    } else {
      setNavKey((k) => k + 1);
      window.dispatchEvent(new Event("popstate"));
    }
  }
  function confirmDiscard() {
    setConfirmation(null);
    setIsDirty(false);
    window.history.pushState({}, "", "/tickets");
    setRoute("/tickets");
    setNavKey((k) => k + 1);
  }
  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) { if (event.key === "Escape") { event.preventDefault(); closeConfirmation(); return; } if (event.key !== "Tab") return; const first = keepEditingButton.current; const last = confirmButton.current; if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  async function logout() { try { await onLogout(); } catch { setLogoutMessage("We could not sign you out right now. Try again."); } }
  const ticketDetailMatch = route.match(/^\/tickets\/(\d+)(?:\?.*)?$/);
  const detailTicketId = ticketDetailMatch ? parseInt(ticketDetailMatch[1], 10) : null;

  return (
    <main className="app-page" id="top">
      <div ref={contentRef}>
        <header className="app-shell">
          <a className="shell-brand" href="#top" aria-label="TokTickIT home">TokTickIT</a>
          <PrimaryNavigation
            route={route}
            disabled={isBusy}
            items={[
              { label: "Dashboard", active: route === "/dashboard" || route.startsWith("/dashboard?"), onNavigate: () => navigate("/dashboard") },
              { label: "My Tickets", active: route === "/tickets" || route.startsWith("/tickets?"), onNavigate: () => navigate("/tickets") },
              { label: "Create Ticket", active: route === "/tickets/new", onNavigate: () => navigate("/tickets/new") },
            ]}
          />
          <div className="requester-identity">
            <span>Requester</span>
            <strong>{user.name}</strong>
            <button className="link-button" type="button" onClick={() => void logout()}>Log out</button>
          </div>
        </header>
        {logoutMessage && <p className="form-alert" role="alert">{logoutMessage}</p>}
        {route === "/dashboard" || route.startsWith("/dashboard?") ? (
          <RequesterDashboard onNavigate={navigate} />
        ) : route === "/tickets/new" || route.startsWith("/tickets/new?") ? (
          <CreateTicket onDirtyChange={setIsDirty} onBusyChange={setIsBusy} onNavigate={navigate} />
        ) : detailTicketId !== null ? (
          <RequesterTicketDetail ticketId={detailTicketId} onNavigate={navigate} />
        ) : (
          <MyTickets key={`${route.split("?")[0]}:${navKey}`} onNavigate={navigate} url={route} />
        )}
        <SystemDiagnostics />
      </div>
      {confirmation && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" onKeyDown={handleDialogKeyDown}>
            <h2 id="discard-title">Discard unsaved Ticket?</h2>
            <p id="discard-description">Changing your destination will discard the values you entered.</p>
            <div className="selector-actions">
              <button ref={keepEditingButton} type="button" className="btn btn-outline-secondary" onClick={closeConfirmation}>Keep editing</button>
              <button ref={confirmButton} type="button" className="btn btn-danger" onClick={confirmDiscard}>Discard changes</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AppContent() {
  const { currentUser, loadState, retry, logout } = useRequester();
  const [, setCurrentPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function completedAuthentication(user: CurrentUser) {
    replaceRoute(user.mustChangePassword ? "/change-password" : roleHome(user));
    setCurrentPath(window.location.pathname);
  }
  async function logoutAndRedirect() {
    await logout();
    window.history.pushState({}, "", "/login");
    setCurrentPath("/login");
  }
  if (loadState === "loading") return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-loading-title"><h1 id="auth-loading-title">Loading TokTickIT…</h1><p className="state-message" role="status" aria-live="polite">Restoring your secure session.</p></section></main>;
  if (loadState === "unauthenticated") { if (window.location.pathname !== "/login") replaceRoute("/login"); return <Login onAuthenticated={completedAuthentication} />; }
  if (!currentUser) return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-error-title"><h1 id="auth-error-title">We could not restore your session</h1><p className="state-message state-message-error" role="alert">Please try again.</p><button className="btn btn-outline-success" type="button" onClick={() => void retry()}>Retry</button></section></main>;
  if (currentUser.mustChangePassword) { if (window.location.pathname !== "/change-password") replaceRoute("/change-password"); return <ChangePassword onComplete={completedAuthentication} onLogout={logoutAndRedirect} />; }
  if (window.location.pathname === "/login" || window.location.pathname === "/change-password") replaceRoute(roleHome(currentUser));
  if (currentUser.role !== "REQUESTER") {
    const isAllowedStaffRoute =
      window.location.pathname === "/staff/dashboard" ||
      /^\/staff\/tickets(\/\d+)?$/.test(window.location.pathname) ||
      (currentUser.role === "ADMINISTRATOR" && window.location.pathname === "/admin/users");
    if (!isAllowedStaffRoute) replaceRoute(roleHome(currentUser));
    return <RoleWorkspace user={currentUser} onLogout={logoutAndRedirect} />;
  }
  if (
    window.location.pathname !== "/dashboard" &&
    window.location.pathname !== "/tickets" &&
    window.location.pathname !== "/tickets/new" &&
    !/^\/tickets\/\d+$/.test(window.location.pathname)
  ) {
    replaceRoute("/tickets");
  }
  return <RequesterWorkspace user={currentUser} onLogout={logoutAndRedirect} />;
}

export default function App() { return <RequesterProvider><AppContent /></RequesterProvider>; }
