import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err) {
      console.error(err);
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "success" && (
        <div className="alert alert-success mt-4">
          <h4>System Status: Online</h4>
          {categories.length > 0 && (
            <>
              <hr />
              <p className="mb-2"><strong>Available Categories:</strong></p>
              <ul className="mb-0">
                {categories.map((cat) => (
                  <li key={cat.id}>{cat.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="alert alert-danger mt-4">
          <h4>System Status: Offline</h4>
          <p>The backend API is currently unavailable. Please check if the server is running.</p>
        </div>
      )}
    </div>
  );
}
