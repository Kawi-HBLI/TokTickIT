import { FormEvent, useRef, useState } from "react";
import { ApiError, CurrentUser } from "./api.js";
import { useRequester } from "./RequesterContext.js";

type ChangePasswordProps = {
  onComplete: (user: CurrentUser) => void;
  onLogout: () => Promise<void>;
};

function safePasswordMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "We could not change your password right now. Try again.";
  if (error.code === "CURRENT_PASSWORD_INVALID") return "The current password is incorrect.";
  if (error.code === "PASSWORD_REUSE") return "Choose a password different from the current password.";
  return "We could not change your password right now. Try again.";
}

export default function ChangePassword({ onComplete, onLogout }: ChangePasswordProps) {
  const { changePassword } = useRequester();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
    if (!currentPassword) nextErrors.currentPassword = "Enter your current or initial password.";
    if (!newPassword) nextErrors.newPassword = "Enter a new password.";
    else if (newPassword.length < 12 || newPassword.length > 72) nextErrors.newPassword = "Password must contain 12-72 characters.";
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your new password.";
    else if (confirmPassword !== newPassword) nextErrors.confirmPassword = "The new passwords do not match.";
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.currentPassword) currentRef.current?.focus();
      else if (nextErrors.newPassword) newRef.current?.focus();
      else confirmRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onComplete(result.user);
    } catch (error) {
      const serverFields = error instanceof ApiError ? Object.fromEntries(error.fields.map(({ field, message: fieldMessage }) => [field, fieldMessage])) : {};
      setErrors({ currentPassword: serverFields.currentPassword, newPassword: serverFields.newPassword });
      setMessage(safePasswordMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await onLogout(); }
    catch { setLogoutMessage("We could not sign you out right now. Try again."); }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="change-password-title">
        <div className="auth-heading-row"><div><p className="brand-kicker">TokTickIT</p><h1 id="change-password-title">Change your password</h1></div><button className="link-button" type="button" disabled={busy} onClick={() => void logout()}>Log out</button></div>
        <p className="page-intro">For your security, set a new password before continuing.</p>
        <p className="field-help" id="password-policy">Use 12-72 characters and do not reuse your email address or current password.</p>
        {message && <p className="form-alert" role="alert">{message}</p>}
        {logoutMessage && <p className="form-alert" role="alert">{logoutMessage}</p>}
        <form noValidate onSubmit={submit}>
          <div className="auth-field"><label htmlFor="current-password">Current or initial password</label><input ref={currentRef} id="current-password" type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} disabled={busy} aria-invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? "current-password-error" : undefined} onChange={(event) => setCurrentPassword(event.target.value)} />{errors.currentPassword && <p id="current-password-error" className="field-error">{errors.currentPassword}</p>}</div>
          <div className="auth-field"><label htmlFor="new-password">New password</label><input ref={newRef} id="new-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={newPassword} disabled={busy} aria-invalid={Boolean(errors.newPassword)} aria-describedby="password-policy" onChange={(event) => setNewPassword(event.target.value)} />{errors.newPassword && <p className="field-error">{errors.newPassword}</p>}</div>
          <div className="auth-field"><label htmlFor="confirm-password">Confirm new password</label><input ref={confirmRef} id="confirm-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} disabled={busy} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined} onChange={(event) => setConfirmPassword(event.target.value)} />{errors.confirmPassword && <p id="confirm-password-error" className="field-error">{errors.confirmPassword}</p>}</div>
          <label className="password-toggle"><input type="checkbox" checked={showPasswords} disabled={busy} onChange={(event) => setShowPasswords(event.target.checked)} /> Show passwords</label>
          <button className="btn btn-success auth-submit" type="submit" disabled={busy}>{busy ? "Changing password…" : "Change password"}</button>
        </form>
      </section>
    </main>
  );
}
