import { describe, expect, it } from "vitest";
import { priceOnOrBefore, unitsForAmount } from "./record-installment";

describe("SIP installment price", () => {
  it("uses the close on the due date", () => {
    expect(
      priceOnOrBefore(
        [
          { timestamp: "2025-03-28T00:00:00Z", close: 120 },
          { timestamp: "2025-03-31T00:00:00Z", close: 123.45 },
        ],
        "2025-03-31",
      ),
    ).toBe(123.45);
  });

  it("uses the previous session when the due date has no price", () => {
    expect(priceOnOrBefore([{ timestamp: "2025-03-28T18:30:00Z", close: 120 }], "2025-03-31")).toBe(
      120,
    );
  });

  it("refuses a price older than a week", () => {
    expect(
      priceOnOrBefore([{ timestamp: "2025-03-01T00:00:00Z", close: 120 }], "2025-03-31"),
    ).toBeNull();
  });

  it("turns the rupee amount into units at that price", () => {
    expect(unitsForAmount("5000", 123.45)).toBe("40.502228");
    expect(unitsForAmount("0", 123.45)).toBe("");
  });
});
