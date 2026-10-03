import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, CurrentUser } from "./api.js";
import { useRequester } from "./RequesterContext.js";

type LoginProps = {
  onAuthenticated: (user: CurrentUser) => void;
};

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function safeLoginMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "We could not sign you in right now. Try again.";
  if (error.code === "INVALID_CREDENTIALS") return "We could not sign you in. Check your email and password.";
  if (error.code === "ACCOUNT_INACTIVE") return "This account is inactive. Contact an administrator for access.";
  if (error.code === "LOGIN_RATE_LIMITED") return "Too many sign-in attempts. Please wait and try again.";
  return "We could not sign you in right now. Try again.";
}

export default function Login({ onAuthenticated }: LoginProps) {
  const { login } = useRequester();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setTimeout(() => setRetrySeconds(0), retrySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Enter your email address.";
    else if (!validEmail(email)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    setMessage(null);
    if (retrySeconds > 0) return;
    if (Object.keys(nextErrors).length) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await login(email, password);
      setPassword("");
      onAuthenticated(result.user);
    } catch (error) {
      setPassword("");
      const retryAfter = error instanceof ApiError && error.code === "LOGIN_RATE_LIMITED" ? error.retryAfterSeconds ?? 60 : 0;
      if (retryAfter) setRetrySeconds(Math.ceil(retryAfter));
      setMessage(retryAfter ? `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter)} seconds.` : safeLoginMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="brand-kicker">TokTickIT</p>
        <h1 id="login-title">Sign in</h1>
        <p className="page-intro">Access the TokTickIT service desk with your assigned account.</p>
        {message && <p id="login-message" className="form-alert" role="alert">{message}</p>}
        <form noValidate onSubmit={submit} aria-describedby={message ? "login-message" : undefined}>
          <div className="auth-field">
            <label htmlFor="login-email">Email</label>
            <input ref={emailRef} id="login-email" name="email" type="email" autoComplete="username" value={email} disabled={busy}
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined}
              onChange={(event) => setEmail(event.target.value)} />
            {errors.email && <p id="login-email-error" className="field-error">{errors.email}</p>}
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <input ref={passwordRef} id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} disabled={busy}
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined}
              onChange={(event) => setPassword(event.target.value)} />
            {errors.password && <p id="login-password-error" className="field-error">{errors.password}</p>}
          </div>
          <label className="password-toggle"><input type="checkbox" checked={showPassword} disabled={busy} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
          <button className="btn btn-success auth-submit" type="submit" disabled={busy || retrySeconds > 0}>{busy ? "Signing in…" : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
