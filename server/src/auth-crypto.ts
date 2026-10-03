import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

export const INITIAL_PASSWORD = "ChangeMe-2026!";
// Temporary migration value used only to make the legacy column non-null. The
// seed replaces it with a per-user salted hash on the first post-migration run.
export const MIGRATED_INITIAL_PASSWORD_HASH =
  "scrypt$16384$8$1$dG9rdGlja2l0LWxhYjMtc2FsdC0yMDI2$HFQWJzg_uHLZMKq_9Ud9p8c_-BdNcQPmGLSVM6lTj_ibvxG4g38IkF96BDjFoegMSS6zjXoB7m_W7QBFMoq-xQ";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: unknown, normalizedEmail?: string): string | null {
  if (typeof password !== "string" || password.trim().length === 0) {
    return "Password is required.";
  }
  if (password.length < 12 || password.length > 72) {
    return "Password must contain 12-72 characters.";
  }
  if (normalizedEmail && password.toLowerCase() === normalizedEmail.toLowerCase()) {
    return "Password must not equal the email address.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nText, rText, pText, saltText, digestText] = parts;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(digestText, "base64url");
    const actual = await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
