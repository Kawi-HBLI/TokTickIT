import { useEffect, useState } from "react";
import { useRequester } from "./RequesterContext.js";

interface RequesterSelectorProps {
  isChanging?: boolean;
  onContinue?: () => void;
  onCancel?: () => void;
}

export default function RequesterSelector({ isChanging = false, onContinue, onCancel }: RequesterSelectorProps) {
  const { requesters, currentRequester, loadState, selectRequester, retry } = useRequester();
  const [selectedId, setSelectedId] = useState<number | null>(currentRequester?.id ?? null);
  const selectedRequester = requesters.find((requester) => requester.id === selectedId) ?? null;

  useEffect(() => { setSelectedId(currentRequester?.id ?? null); }, [currentRequester]);

  function continueWithRequester() {
    if (selectedId !== null && selectRequester(selectedId)) onContinue?.();
  }

  return (
    <section className="requester-card" aria-labelledby="requester-selector-title">
      <p className="brand-kicker">TOKTICKIT · IT SERVICE DESK</p>
      <h1 id="requester-selector-title">Select Development Requester</h1>
      <p className="selector-explanation">
        Select a Development Requester to test requester-specific ticket behavior. This is not a login screen.
        Authentication and role-based access will be introduced in Lab 3.
      </p>

      {loadState === "loading" && <p className="state-message" role="status" aria-live="polite">Loading Requesters...</p>}
      {loadState === "empty" && <p className="state-message" role="status">No active Development Requesters are available.</p>}
      {loadState === "error" && (
        <div className="state-message state-message-error" role="alert">
          <p>Development Requesters could not be loaded. Please try again.</p>
          <button className="btn btn-outline-success" type="button" onClick={() => void retry()}>Retry</button>
        </div>
      )}

      <div className="selector-field">
        <label className="form-label" htmlFor="requester-select">Development Requester</label>
        <select id="requester-select" className="form-select" value={selectedId ?? ""}
          disabled={loadState !== "ready"}
          onChange={(event) => setSelectedId(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Choose a Requester</option>
          {requesters.map((requester) => <option key={requester.id} value={requester.id}>{requester.name}</option>)}
        </select>
      </div>

      {selectedRequester && (
        <dl className="requester-preview" aria-live="polite">
          <div><dt>Name</dt><dd>{selectedRequester.name}</dd></div>
          <div><dt>Email</dt><dd>{selectedRequester.email}</dd></div>
          <div><dt>Department</dt><dd>{selectedRequester.department}</dd></div>
        </dl>
      )}

      <div className="selector-actions">
        {isChanging && <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-success" type="button"
          disabled={loadState !== "ready" || !selectedRequester} onClick={continueWithRequester}>Continue</button>
      </div>
    </section>
  );
}
