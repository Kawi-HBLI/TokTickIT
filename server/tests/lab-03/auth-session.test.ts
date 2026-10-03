import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  isLoginRateLimited,
  isSessionExpired,
  recordLoginFailure,
  resetLoginRateLimiter,
} from "../../src/auth.js";

describe("Lab 3 session and login protection", () => {
  it("treats a session at its expiry instant as expired", () => {
    const now = Date.parse("2026-09-16T10:00:00.000Z");
    expect(isSessionExpired(new Date(now - 1), now)).toBe(true);
    expect(isSessionExpired(new Date(now), now)).toBe(true);
    expect(isSessionExpired(new Date(now + 1), now)).toBe(false);
  });

  it("compares CSRF values without accepting different lengths", () => {
    expect(constantTimeEqual("csrf-token", "csrf-token")).toBe(true);
    expect(constantTimeEqual("csrf-token", "csrf-toke")).toBe(false);
    expect(constantTimeEqual("csrf-token", "csrf-token-other")).toBe(false);
  });

  it("limits the fifth failed login for a normalized key", () => {
    resetLoginRateLimiter();
    const now = Date.parse("2026-09-16T10:00:00.000Z");
    expect(recordLoginFailure("127.0.0.1:alex@example.test", now).limited).toBe(false);
    expect(recordLoginFailure("127.0.0.1:alex@example.test", now + 1).limited).toBe(false);
    expect(recordLoginFailure("127.0.0.1:alex@example.test", now + 2).limited).toBe(false);
    expect(recordLoginFailure("127.0.0.1:alex@example.test", now + 3).limited).toBe(false);
    const fifth = recordLoginFailure("127.0.0.1:alex@example.test", now + 4);
    expect(fifth.limited).toBe(true);
    expect(fifth.retryAfterSeconds).toBeGreaterThan(0);
    expect(isLoginRateLimited("127.0.0.1:alex@example.test", now + 5).limited).toBe(true);
    expect(isLoginRateLimited("127.0.0.1:alex@example.test", now + 15 * 60 * 1000 + 1).limited).toBe(false);
    resetLoginRateLimiter();
  });

  it("starts a fresh failure window after fifteen minutes", () => {
    resetLoginRateLimiter();
    const now = Date.parse("2026-09-16T10:00:00.000Z");
    for (let i = 0; i < 5; i += 1) recordLoginFailure("key", now + i);
    expect(recordLoginFailure("key", now + 15 * 60 * 1000 + 1).limited).toBe(false);
    resetLoginRateLimiter();
  });
});
