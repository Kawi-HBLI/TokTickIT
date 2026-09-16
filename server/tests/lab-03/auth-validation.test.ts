import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, validatePassword, verifyPassword } from "../../src/auth-crypto.js";

describe("Lab 3 authentication validation", () => {
  it("normalizes email input without changing the stored display email", () => {
    expect(normalizeEmail("  Alex.Thompson@TokTickIT.local ")).toBe("alex.thompson@toktickit.local");
  });

  it("accepts the exact password length bounds", () => {
    expect(validatePassword("a".repeat(12), "alex@example.test")).toBeNull();
    expect(validatePassword("a".repeat(72), "alex@example.test")).toBeNull();
  });

  it.each([
    ["", "Password is required."],
    ["           ", "Password is required."],
    ["a".repeat(11), "Password must contain 12-72 characters."],
    ["a".repeat(73), "Password must contain 12-72 characters."],
  ])("rejects invalid password %j", (password, message) => {
    expect(validatePassword(password, "alex@example.test")).toBe(message);
  });

  it("rejects a password equal to the normalized email", () => {
    expect(validatePassword("Alex@Example.Test", "alex@example.test")).toBe(
      "Password must not equal the email address.",
    );
  });

  it("stores a salted scrypt hash and verifies only the matching password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(hash).not.toContain("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});
