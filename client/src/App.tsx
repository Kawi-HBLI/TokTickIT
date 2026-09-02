import { useState } from "react";
import { checkSystem, Category } from "./api.js";
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

  return (
    <main className="app-page" id="top">
      {currentRequester && !isChanging ? (
        <>
          <header className="app-shell">
            <a className="shell-brand" href="#top" aria-label="TokTickIT home">TokTickIT</a>
            <nav aria-label="Primary navigation">
              <a href="#my-tickets" aria-current="page">My Tickets</a>
              <a href="#create-ticket">Create Ticket</a>
            </nav>
            <div className="requester-identity">
              <span>Development Requester</span>
              <strong>{currentRequester.name}</strong>
              <button className="link-button" type="button" onClick={() => setIsChanging(true)}>
                Change Requester
              </button>
            </div>
          </header>
          <section className="workspace-card" id="my-tickets">
            <p className="section-kicker">Requester workspace</p>
            <h1>Welcome, {currentRequester.name}</h1>
            <p>Your requester context is ready. Ticket workflows will be added in the next features.</p>
          </section>
        </>
      ) : (
        <RequesterSelector isChanging={isChanging} onCancel={() => setIsChanging(false)}
          onContinue={() => setIsChanging(false)} />
      )}
      <SystemDiagnostics />
    </main>
  );
}

export default function App() {
  return <RequesterProvider><AppContent /></RequesterProvider>;
}
