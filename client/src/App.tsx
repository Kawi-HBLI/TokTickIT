import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { checkSystem, Category } from "./api.js";
import CreateTicket from "./CreateTicket.js";
import MyTickets from "./MyTickets.js";
import { RequesterProvider, useRequester } from "./RequesterContext.js";

import RequesterTicketDetail from "./RequesterTicketDetail.js";

type UiState = "idle" | "loading" | "success" | "error";

function SystemDiagnostics() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (error) {
      console.error(error);
      setState("error");
    }
  }

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-title">
      <div>
        <p className="section-kicker">Development diagnostics</p>
        <h2 id="diagnostics-title">API system check</h2>
      </div>
      <button className="btn btn-outline-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>
      <div aria-live="polite" className="diagnostic-result">
        {state === "success" && (
          <div className="alert alert-success mb-0">
            <h3 className="h5">System Status: Online</h3>
            {categories.length > 0 && (
              <>
                <p className="mb-2"><strong>Available Categories:</strong></p>
                <ul className="mb-0">
                  {categories.map((category) => <li key={category.id}>{category.name}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        {state === "error" && (
          <div className="alert alert-danger mb-0" role="alert">
            <h3 className="h5">System Status: Offline</h3>
            <p className="mb-0">The backend API is currently unavailable. Please check if the server is running.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AppContent() {
  const { currentRequester, loadState, retry } = useRequester();
  const [route, setRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/tickets/new") return "/tickets/new";
    if (/^\/tickets\/\d+$/.test(path)) return path;
    return "/tickets";
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"cancel" | null>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const next = path === "/tickets/new" || /^\/tickets\/\d+$/.test(path) ? path : "/tickets";
      if (isBusy || (route === "/tickets/new" && isDirty && next !== route)) {
        window.history.pushState({}, "", route);
        if (!isBusy) openConfirmation("cancel");
        return;
      }
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isBusy, isDirty, route]);
  useEffect(() => {
    const content = contentRef.current;
    if (content) confirmation ? content.setAttribute("inert", "") : content.removeAttribute("inert");
    if (confirmation) keepEditingButton.current?.focus();
    if (!confirmation) previousFocus.current?.focus();
  }, [confirmation]);

  function openConfirmation(kind: "cancel") {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation(kind);
  }
  function closeConfirmation() { setConfirmation(null); }

  function navigate(next: string) {
    if (isBusy) return;
    if (next === route) return;
    if (route === "/tickets/new" && isDirty) { openConfirmation("cancel"); return; }
    window.history.pushState({}, "", next);
    setRoute(next);
  }
  function confirmDiscard() {
    const action = confirmation;
    setConfirmation(null);
    setIsDirty(false);
    if (action === "cancel") { window.history.pushState({}, "", "/tickets"); setRoute("/tickets"); }
  }
  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeConfirmation(); return; }
    if (event.key !== "Tab") return;
    const first = keepEditingButton.current;
    const last = confirmButton.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const ticketDetailMatch = route.match(/^\/tickets\/(\d+)$/);
  const detailTicketId = ticketDetailMatch ? parseInt(ticketDetailMatch[1], 10) : null;

  return (
    <main className="app-page" id="top">
      <div ref={contentRef}>
      {currentRequester && currentRequester.role === "REQUESTER" ? (
        <>
          <header className="app-shell">
              <a className="shell-brand" href="#top" aria-label="TokTickIT home">TokTickIT</a>
            <nav aria-label="Primary navigation">
              <button type="button" className={route === "/tickets" ? "nav-link active" : "nav-link"} aria-current={route === "/tickets" ? "page" : undefined} disabled={isBusy} onClick={() => navigate("/tickets")}>My Tickets</button>
              <button type="button" className={route === "/tickets/new" ? "nav-link active" : "nav-link"} aria-current={route === "/tickets/new" ? "page" : undefined} disabled={isBusy} onClick={() => navigate("/tickets/new")}>Create Ticket</button>
            </nav>
            <div className="requester-identity">
              <span>{currentRequester.role === "REQUESTER" ? "Requester" : currentRequester.role}</span>
              <strong>{currentRequester.name}</strong>
            </div>
          </header>
          {route === "/tickets/new" ? (
            <CreateTicket onDirtyChange={setIsDirty} onBusyChange={setIsBusy} onNavigate={navigate} />
          ) : detailTicketId !== null ? (
            <RequesterTicketDetail ticketId={detailTicketId} onNavigate={navigate} />
          ) : (
            <MyTickets onNavigate={navigate} />
          )}
        </>
      ) : currentRequester ? (
        <section className="requester-card" aria-labelledby="auth-forbidden-title"><h1 id="auth-forbidden-title">Requester workspace unavailable</h1><p className="state-message" role="alert">Your account does not have permission to use Requester ticket screens.</p></section>
      ) : loadState === "loading" ? (
        <section className="requester-card" aria-labelledby="auth-loading-title"><h1 id="auth-loading-title">Loading TokTickIT…</h1><p className="state-message" role="status" aria-live="polite">Restoring your secure session.</p></section>
      ) : loadState === "unauthenticated" ? (
        <section className="requester-card" aria-labelledby="auth-required-title"><h1 id="auth-required-title">Sign in required</h1><p className="state-message">Your TokTickIT session is not available.</p><a className="btn btn-success" href="/login">Go to Sign in</a></section>
      ) : (
        <section className="requester-card" aria-labelledby="auth-error-title"><h1 id="auth-error-title">We could not restore your session</h1><p className="state-message state-message-error" role="alert">Please try again.</p><button className="btn btn-outline-success" type="button" onClick={() => void retry()}>Retry</button></section>
      )}
      <SystemDiagnostics />
      </div>
      {confirmation && <div className="dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" onKeyDown={handleDialogKeyDown}><h2 id="discard-title">Discard unsaved Ticket?</h2><p id="discard-description">Changing your destination or Requester will discard the values you entered.</p><div className="selector-actions"><button ref={keepEditingButton} type="button" className="btn btn-outline-secondary" onClick={closeConfirmation}>Keep editing</button><button ref={confirmButton} type="button" className="btn btn-danger" onClick={confirmDiscard}>Discard changes</button></div></section></div>}
    </main>
  );
}

export default function App() {
  return <RequesterProvider><AppContent /></RequesterProvider>;
}
