import { describe, expect, it } from "vitest";

function formatTicketNumber(seq: number, year: number = new Date().getFullYear()): string {
  if (seq <= 0 || !Number.isInteger(seq)) {
    throw new Error("Invalid sequence number");
  }
  const seqStr = String(seq);
  const padded = seqStr.padStart(Math.max(5, seqStr.length), "0");
  return `TKT-${year}-${padded}`;
}

describe("UNIT-01: Ticket Number Formatting and Formatting Abstraction", () => {
  it("formats standard numbers with 5 zero-padded digits", () => {
    expect(formatTicketNumber(1, 2026)).toBe("TKT-2026-00001");
    expect(formatTicketNumber(42, 2026)).toBe("TKT-2026-00042");
    expect(formatTicketNumber(999, 2026)).toBe("TKT-2026-00999");
    expect(formatTicketNumber(99999, 2026)).toBe("TKT-2026-99999");
  });

  it("preserves full digits without truncation when exceeding 5 digits (preventing collision)", () => {
    expect(formatTicketNumber(100000, 2026)).toBe("TKT-2026-100000");
    expect(formatTicketNumber(1234567, 2026)).toBe("TKT-2026-1234567");
  });

  it("rejects non-positive and fractional sequence values", () => {
    expect(() => formatTicketNumber(0)).toThrow("Invalid sequence number");
    expect(() => formatTicketNumber(-5)).toThrow("Invalid sequence number");
    expect(() => formatTicketNumber(3.14)).toThrow("Invalid sequence number");
  });

  it("generates deterministic unique numbers across sequential sequence sources", () => {
    const generated = new Set<string>();
    for (let i = 1; i <= 100; i++) {
      generated.add(formatTicketNumber(i, 2026));
    }
    expect(generated.size).toBe(100);
    expect(generated.has("TKT-2026-00001")).toBe(true);
    expect(generated.has("TKT-2026-00100")).toBe(true);
  });
});
