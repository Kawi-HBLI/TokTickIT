import { describe, expect, it } from "vitest";
import { isValidEmail, safeAdminUser } from "../../src/admin-users.js";
import { normalizeEmail, validatePassword } from "../../src/auth-crypto.js";

describe("UNIT-USER-01: User Validation & Safe Representation Invariants", () => {
  it("validates email addresses according to RFC and project invariants", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("first.last@toktickit.local")).toBe(true);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("a".repeat(250) + "@domain.com")).toBe(false); // exceeds 254 chars
  });

  it("normalizes emails to trimmed lowercase for database-authoritative uniqueness", () => {
    expect(normalizeEmail("  Alex.Smith@TokTickIT.Local  ")).toBe("alex.smith@toktickit.local");
    expect(normalizeEmail("USER@DOMAIN.COM")).toBe("user@domain.com");
  });

  it("validates initial passwords with 12-72 character boundary and email inequality", () => {
    expect(validatePassword("valid-password-1234")).toBeNull();
    expect(validatePassword("")).toBe("Password is required.");
    expect(validatePassword("short-123")).toBe("Password must contain 12-72 characters.");
    expect(validatePassword("a".repeat(73))).toBe("Password must contain 12-72 characters.");
    expect(validatePassword("alex@toktickit.local", "alex@toktickit.local")).toBe(
      "Password must not equal the email address."
    );
  });

  it("produces Safe User representation without exposing secrets, hashes, or department", () => {
    const user = {
      id: 42,
      name: "Harper Morgan",
      email: "harper@toktickit.local",
      role: "ADMINISTRATOR" as const,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date("2026-09-01T12:00:00.000Z"),
      updatedAt: new Date("2026-09-02T15:30:00.000Z"),
    };

    const safe = safeAdminUser(user);
    expect(safe).toEqual({
      id: 42,
      name: "Harper Morgan",
      email: "harper@toktickit.local",
      role: "ADMINISTRATOR",
      isActive: true,
      mustChangePassword: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-02T15:30:00.000Z",
    });

    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe).not.toHaveProperty("password");
    expect(safe).not.toHaveProperty("department");
  });
});
