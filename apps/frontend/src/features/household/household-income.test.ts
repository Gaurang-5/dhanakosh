import { describe, expect, it } from "vitest";
import { combineIncome, type MemberIncome } from "./household-income";

function member(id: string, current: number, previous: number): MemberIncome {
  return {
    memberId: id,
    memberName: id,
    firstActivity: "2025-01-01",
    today: "2026-10-24",
    income: [
      ["YTD", current],
      ["LAST_YEAR", previous],
    ].map(([period, amount]) => ({
      period: String(period),
      totalIncome: Number(amount),
      currency: "INR",
      monthlyAverage: 999,
      yoyGrowth: 999,
      byMonth: { "2026-01": Number(amount) },
      byType: { DIVIDEND: Number(amount) },
      byAsset: {},
      byAccount: {
        same: { accountId: "same", accountName: "Broker", byMonth: {}, total: Number(amount) },
      },
      byCurrency: { INR: Number(amount) },
      byCurrencyBase: { INR: Number(amount) },
      unconvertedCurrencies: [],
    })),
  };
}

describe("combined family income", () => {
  it("recalculates growth and averages from combined amounts, preserving account ownership", () => {
    const a = member("a", 100, 50);
    const b = member("b", 300, 350);
    b.income[0].unconvertedCurrencies = ["USD"];
    const result = combineIncome([a, b], "INR")[0];
    expect(result.totalIncome).toBe(400);
    expect(result.yoyGrowth).toBe(0);
    expect(result.monthlyAverage).toBe(40);
    expect(result.byMonth["2026-01"]).toBe(400);
    expect(Object.keys(result.byAccount)).toEqual(["a::same", "b::same"]);
    expect(result.unconvertedCurrencies).toEqual(["USD"]);
    expect(a.income[0].yoyGrowth).toBe(999);
  });
  it("rejects mixing base currencies", () => {
    const b = member("b", 300, 350);
    b.income[0].currency = "USD";
    expect(() => combineIncome([member("a", 100, 50), b], "INR")).toThrow(/currency/);
  });
  it("does not divide by zero when no previous income exists", () => {
    expect(combineIncome([member("a", 100, 0)], "INR")[0].yoyGrowth).toBeNull();
    expect(combineIncome([], "INR")).toEqual([]);
  });
});
