import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { checkSystem, Category } from "./api.js";
import CreateTicket from "./CreateTicket.js";
import RequesterSelector from "./RequesterSelector.js";
import { RequesterProvider, useRequester } from "./RequesterContext.js";

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
  const { currentRequester } = useRequester();
  const [isChanging, setIsChanging] = useState(false);
  const [route, setRoute] = useState(() => window.location.pathname === "/tickets/new" ? "/tickets/new" : "/tickets");
  const [isDirty, setIsDirty] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"switch" | "cancel" | null>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPopState = () => {
      const next = window.location.pathname === "/tickets/new" ? "/tickets/new" : "/tickets";
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

  function openConfirmation(kind: "switch" | "cancel") {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation(kind);
  }
  function closeConfirmation() { setConfirmation(null); }

  function navigate(next: "/tickets" | "/tickets/new") {
    if (isBusy) return;
    if (next === route) return;
    if (route === "/tickets/new" && isDirty) { openConfirmation("cancel"); return; }
    window.history.pushState({}, "", next);
    setRoute(next);
  }
  function beginChangeRequester() {
    if (isBusy) return;
    if (route === "/tickets/new" && isDirty) { openConfirmation("switch"); return; }
    setIsChanging(true);
  }
  function confirmDiscard() {
    const action = confirmation;
    setConfirmation(null);
    setIsDirty(false);
    if (action === "switch") setIsChanging(true);
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

  return (
    <main className="app-page" id="top">
      <div ref={contentRef}>
      {currentRequester && !isChanging ? (
        <>
          <header className="app-shell">
              <a className="shell-brand" href="#top" aria-label="TokTickIT home">TokTickIT</a>
            <nav aria-label="Primary navigation">
              <button type="button" className={route === "/tickets" ? "nav-link active" : "nav-link"} aria-current={route === "/tickets" ? "page" : undefined} disabled={isBusy} onClick={() => navigate("/tickets")}>My Tickets</button>
              <button type="button" className={route === "/tickets/new" ? "nav-link active" : "nav-link"} aria-current={route === "/tickets/new" ? "page" : undefined} disabled={isBusy} onClick={() => navigate("/tickets/new")}>Create Ticket</button>
            </nav>
            <div className="requester-identity">
              <span>Development Requester</span>
              <strong>{currentRequester.name}</strong>
              <button className="link-button" type="button" onClick={beginChangeRequester} disabled={isBusy}>
                Change Requester
              </button>
            </div>
          </header>
          {route === "/tickets/new" ? <CreateTicket onDirtyChange={setIsDirty} onBusyChange={setIsBusy} onNavigate={navigate} /> : <section className="workspace-card" id="my-tickets"><p className="section-kicker">Requester workspace</p><h1>Welcome, {currentRequester.name}</h1><h2>My Tickets</h2><p>No Ticket list is available yet. Create a Ticket to begin.</p><button className="btn btn-success" type="button" onClick={() => navigate("/tickets/new")}>Create Ticket</button></section>}
        </>
      ) : (
        <RequesterSelector isChanging={isChanging} onCancel={() => setIsChanging(false)}
          onContinue={() => setIsChanging(false)} />
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
