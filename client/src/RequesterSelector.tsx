import { useRequester } from "./RequesterContext.js";

interface RequesterSelectorProps {
  isChanging?: boolean;
  onContinue?: () => void;
  onCancel?: () => void;
}

export default function RequesterSelector({ isChanging = false, onContinue, onCancel }: RequesterSelectorProps) {
  const { currentRequester, loadState, retry } = useRequester();

  return (
    <section className="requester-card" aria-labelledby="requester-selector-title">
      <p className="brand-kicker">TOKTICKIT · IT SERVICE DESK</p>
      <h1 id="requester-selector-title">Authenticated Requester</h1>
      <p className="selector-explanation">
        Requester identity is taken from the authenticated session. It cannot be selected or changed in the browser.
      </p>

      {loadState === "loading" && <p className="state-message" role="status" aria-live="polite">Loading Requesters...</p>}
      {loadState === "unauthenticated" && <p className="state-message" role="status">Sign in to continue.</p>}
      {loadState === "error" && (
        <div className="state-message state-message-error" role="alert">
          <p>Development Requesters could not be loaded. Please try again.</p>
          <button className="btn btn-outline-success" type="button" onClick={() => void retry()}>Retry</button>
        </div>
      )}

      {currentRequester && (
        <dl className="requester-preview" aria-live="polite">
          <div><dt>Name</dt><dd>{currentRequester.name}</dd></div>
          <div><dt>Email</dt><dd>{currentRequester.email}</dd></div>
          <div><dt>Role</dt><dd>{currentRequester.role}</dd></div>
        </dl>
      )}

      <div className="selector-actions">
        {isChanging && <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Cancel</button>}
        {currentRequester && <button className="btn btn-success" type="button" onClick={onContinue}>Continue</button>}
      </div>
    </section>
  );
}
