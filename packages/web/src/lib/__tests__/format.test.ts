import { describe, it, expect } from "vitest";
import { formatBalance, formatNumber, formatDate } from "../format.js";

// ---------------------------------------------------------------------------
// formatBalance
// ---------------------------------------------------------------------------

describe("formatBalance", () => {
  it("formats zero as '0 DOT' by default", () => {
    expect(formatBalance("0")).toBe("0 DOT");
  });

  it("formats null as '0 DOT'", () => {
    expect(formatBalance(null)).toBe("0 DOT");
  });

  it("formats a value with the correct number of decimals", () => {
    // 1_500_000_000_000 with 12 decimals = 1.5 AJUN
    expect(formatBalance("1500000000000", 12, "AJUN")).toBe("1.5 AJUN");
  });

  it("formats a whole number without trailing decimals", () => {
    // Exactly 1 DOT = 10^10 planck (10 decimals)
    expect(formatBalance("10000000000", 10, "DOT")).toBe("1 DOT");
  });

  it("truncates decimals to 4 digits", () => {
    // 1.123456789 DOT → 1.1234 DOT (4 decimals shown)
    expect(formatBalance("11234567890", 10, "DOT")).toBe("1.1234 DOT");
  });

  it("strips trailing zeros in decimal part", () => {
    // 1.1000 → 1.1
    expect(formatBalance("11000000000", 10, "DOT")).toBe("1.1 DOT");
  });

  it("handles very large values", () => {
    // 1'000'000 DOT
    const result = formatBalance("10000000000000000", 10, "DOT");
    expect(result).toBe("1'000'000 DOT");
  });

  it("falls back to raw planck on invalid BigInt input", () => {
    expect(formatBalance("not-a-number", 10, "DOT")).toBe("not-a-number planck");
  });

  it("uses default decimals=10 and symbol=DOT", () => {
    // 5 DOT = 5 * 10^10 = 50000000000
    expect(formatBalance("50000000000")).toBe("5 DOT");
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe("formatNumber", () => {
  it("formats a number with apostrophe separators", () => {
    expect(formatNumber(1234567)).toBe("1'234'567");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats small numbers without commas", () => {
    expect(formatNumber(42)).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it('returns "—" for null', () => {
    expect(formatDate(null)).toBe("\u2014");
  });

  it('returns "—" for 0', () => {
    expect(formatDate(0)).toBe("\u2014");
  });

  it("formats a Unix timestamp (seconds)", () => {
    // 2024-01-15T12:00:00Z = 1705320000
    const result = formatDate(1705320000);
    expect(result).toContain("2024");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
  });

  it("formats a Unix timestamp (milliseconds)", () => {
    const result = formatDate(1705320000000);
    expect(result).toContain("2024");
    expect(result).toContain("Jan");
  });
});
