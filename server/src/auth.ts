import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { User } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { hashPassword, normalizeEmail, validatePassword, verifyPassword } from "./auth-crypto.js";

const SESSION_COOKIE = "toktickit_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type LoginFailure = { count: number; firstFailureAt: number };
const loginFailures = new Map<string, LoginFailure>();

export type AuthContext = {
  user: User;
  sessionId: number;
  csrfToken: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function errorResponse(res: Response, status: number, code: string, message: string, retryable = false, fields?: Record<string, string>) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}), retryable } });
}

function safeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [];
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return [];
    try {
      return [[key, decodeURIComponent(value)] as const];
    } catch {
      return [];
    }
  }));
}

function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
}

function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function currentOriginAllowed(req: Request): boolean {
  return req.get("Origin") === CLIENT_ORIGIN;
}

function rateKey(req: Request, email: string): string {
  return `${req.ip || req.socket.remoteAddress || "unknown"}:${email}`;
}

export function recordLoginFailure(key: string, now = Date.now()): { limited: boolean; retryAfterSeconds: number } {
  const previous = loginFailures.get(key);
  const current = !previous || now - previous.firstFailureAt >= FAILURE_WINDOW_MS
    ? { count: 1, firstFailureAt: now }
    : { count: previous.count + 1, firstFailureAt: previous.firstFailureAt };
  loginFailures.set(key, current);
  const retryAfterSeconds = Math.max(1, Math.ceil((current.firstFailureAt + FAILURE_WINDOW_MS - now) / 1000));
  return { limited: current.count >= MAX_FAILURES, retryAfterSeconds };
}

export function isLoginRateLimited(key: string, now = Date.now()): { limited: boolean; retryAfterSeconds: number } {
  const previous = loginFailures.get(key);
  if (!previous || now - previous.firstFailureAt >= FAILURE_WINDOW_MS) {
    if (previous) loginFailures.delete(key);
    return { limited: false, retryAfterSeconds: 0 };
  }
  return {
    limited: previous.count >= MAX_FAILURES,
    retryAfterSeconds: Math.max(1, Math.ceil((previous.firstFailureAt + FAILURE_WINDOW_MS - now) / 1000)),
  };
}

function clearFailures(key: string): void {
  loginFailures.delete(key);
}

export function resetLoginRateLimiter(): void {
  loginFailures.clear();
}

export function isSessionExpired(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function createSession(userId: number) {
  const rawToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const session = await getPrisma().session.create({
    data: {
      tokenHash: tokenHash(rawToken),
      csrfToken,
      userId,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
    },
  });
  return { session, rawToken, csrfToken };
}

async function loadAuth(req: Request): Promise<AuthContext | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const session = await getPrisma().session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || isSessionExpired(session.expiresAt)) return null;
  await getPrisma().session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { user: session.user, sessionId: session.id, csrfToken: session.csrfToken };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await loadAuth(req);
    if (!auth) {
      errorResponse(res, 401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
      return;
    }
    req.auth = auth;
    if (!auth.user.isActive) {
      errorResponse(res, 403, "ACCOUNT_INACTIVE", "This account cannot access the application.");
      return;
    }
    if (auth.user.mustChangePassword && !req.path.endsWith("/change-password") && !req.path.endsWith("/me") && !req.path.endsWith("/logout")) {
      errorResponse(res, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password before using the application.");
      return;
    }
    next();
  } catch (error) {
    console.error(error);
    const code = req.path.endsWith("/me") ? "CURRENT_USER_FAILED" : "AUTHENTICATION_UNAVAILABLE";
    errorResponse(res, 500, code, "Authentication is temporarily unavailable.", true);
  }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const expected = req.auth?.csrfToken;
  const supplied = req.get("X-CSRF-Token");
  if (!expected || !supplied) {
    errorResponse(res, 403, "CSRF_INVALID", "The security token is missing or invalid.");
    return;
  }
  if (!constantTimeEqual(expected, supplied)) {
    errorResponse(res, 403, "CSRF_INVALID", "The security token is missing or invalid.");
    return;
  }
  next();
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  if (!currentOriginAllowed(req)) {
    errorResponse(res, 403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!hasOnlyKeys(body, ["email", "password"]) || typeof body.email !== "string" || typeof body.password !== "string") {
    errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", false, { email: "Enter a valid email address.", password: "Password is required." });
    return;
  }
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!email || email.length > 254 || password.length === 0 || password.length > 72) {
    errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", false, { email: "Enter a valid email address.", password: "Enter a valid password." });
    return;
  }
  const key = rateKey(req, email);
  try {
    const limit = isLoginRateLimited(key);
    if (limit.limited) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      errorResponse(res, 429, "LOGIN_RATE_LIMITED", "Too many unsuccessful attempts. Try again later.", true);
      return;
    }
    const user = await getPrisma().user.findUnique({ where: { normalizedEmail: email } });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!valid || !user) {
      const result = recordLoginFailure(key);
      if (result.limited) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
        errorResponse(res, 429, "LOGIN_RATE_LIMITED", "Too many unsuccessful attempts. Try again later.", true);
        return;
      }
      errorResponse(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      return;
    }
    if (!user.isActive) {
      errorResponse(res, 403, "ACCOUNT_INACTIVE", "This account cannot sign in.");
      return;
    }
    clearFailures(key);
    const created = await createSession(user.id);
    setSessionCookie(res, created.rawToken);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { user: safeUser(user), csrfToken: created.csrfToken } });
  } catch (error) {
    console.error(error);
    errorResponse(res, 500, "LOGIN_FAILED", "Sign in is temporarily unavailable.", true);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ data: { user: safeUser(req.auth!.user), csrfToken: req.auth!.csrfToken } });
});

authRouter.post("/change-password", requireAuth, requireCsrf, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!hasOnlyKeys(body, ["currentPassword", "newPassword"]) || typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.");
    return;
  }
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;
  const passwordError = validatePassword(newPassword, req.auth!.user.normalizedEmail);
  if (passwordError) {
    errorResponse(res, 400, "VALIDATION_ERROR", passwordError, false, { newPassword: passwordError });
    return;
  }
  try {
    if (!await verifyPassword(currentPassword, req.auth!.user.passwordHash)) {
      errorResponse(res, 401, "CURRENT_PASSWORD_INVALID", "The current password is incorrect.");
      return;
    }
    if (await verifyPassword(newPassword, req.auth!.user.passwordHash)) {
      errorResponse(res, 409, "PASSWORD_REUSE", "Choose a password different from the current password.");
      return;
    }
    const replacement = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.auth!.user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: updated.id } });
      const rawToken = randomBytes(32).toString("base64url");
      const csrfToken = randomBytes(32).toString("base64url");
      await tx.session.create({ data: { tokenHash: tokenHash(rawToken), csrfToken, userId: updated.id, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) } });
      return { updated, rawToken, csrfToken };
    });
    setSessionCookie(res, replacement.rawToken);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { user: safeUser(replacement.updated), csrfToken: replacement.csrfToken } });
  } catch (error) {
    console.error(error);
    errorResponse(res, 500, "PASSWORD_CHANGE_FAILED", "Password change is temporarily unavailable.", true);
  }
});

authRouter.post("/logout", async (req, res) => {
  try {
    const auth = await loadAuth(req);
    if (!auth) {
      clearSessionCookie(res);
      res.status(204).end();
      return;
    }
    req.auth = auth;
    const csrf = req.get("X-CSRF-Token");
    if (!csrf || !constantTimeEqual(csrf, auth.csrfToken)) {
      errorResponse(res, 403, "CSRF_INVALID", "The security token is missing or invalid.");
      return;
    }
    await getPrisma().session.delete({ where: { id: auth.sessionId } });
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    errorResponse(res, 500, "LOGOUT_FAILED", "Logout is temporarily unavailable.", true);
  }
});
