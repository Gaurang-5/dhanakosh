import { describe, expect, it } from "vitest";
import { combineOverview, type MemberOverview } from "./household-overview-data";

function member(memberId: string, value: number): MemberOverview {
  const taxonomy = {
    taxonomyId: "asset_classes",
    taxonomyName: "Asset classes",
    color: "",
    categories: [
      { categoryId: memberId, categoryName: memberId, color: "", value, percentage: 100 },
    ],
  };
  return {
    memberId,
    memberName: memberId,
    alternativeHoldings: [],
    accounts: [
      {
        id: "same-account",
        name: "Broker",
        accountType: "SECURITIES",
        balance: 0,
        currency: "INR",
        isDefault: false,
        isActive: true,
        isArchived: false,
        trackingMode: "TRANSACTIONS",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ],
    holdings: [
      {
        id: "same-row",
        accountId: "same-account",
        holdingType: "security",
        quantity: 1,
        localCurrency: "INR",
        baseCurrency: "INR",
        asOfDate: "2026-10-24",
        instrument: { id: "same-asset", symbol: "TEST", currency: "INR", quoteMode: "MARKET" },
        marketValue: { base: value, local: value },
        weight: 1,
      },
    ],
    allocations: {
      assetClasses: taxonomy,
      sectors: taxonomy,
      regions: taxonomy,
      riskCategory: taxonomy,
      securityTypes: taxonomy,
      customGroups: [],
      totalValue: value,
    },
    currentValuation: {
      accounts: [],
      summary: {
        scopeId: "all",
        baseCurrency: "INR",
        cashBalanceBase: 0,
        investmentMarketValueBase: value,
        totalValueBase: value,
        holdingsCount: 1,
        accountCount: 1,
        currencySplit: [{ currency: "INR", valueBase: value, valueLocal: value, percentage: 100 }],
        cashCurrencySplit: [],
        sourceDataAsOf: "2026-10-24",
        calculatedAt: "2026-10-24",
        warnings: [],
      },
    },
    netWorth: {
      date: "2026-10-24",
      currency: "INR",
      netWorth: String(value),
      assets: {
        total: String(value),
        breakdown: [{ category: "investments", name: "Investments", value: String(value) }],
      },
      liabilities: { total: "0", breakdown: [] },
      staleAssets: [],
    },
  };
}

describe("original overview with family data", () => {
  it("uses combined amounts to recompute percentages, rather than adding member percentages", () => {
    const result = combineOverview([member("a", 100), member("b", 300)]);
    expect(result.currentValuation.summary.totalValueBase).toBe(400);
    expect(result.allocations.assetClasses.categories.map((c) => c.percentage)).toEqual([75, 25]);
    expect(result.holdings.map((h) => h.weight)).toEqual([0.25, 0.75]);
    expect(result.netWorth?.assets.breakdown[0].value).toBe("400");
    expect(result.currentValuation.summary.currencySplit[0].percentage).toBe(100);
  });
  it("keeps colliding member record IDs distinct and leaves source records untouched", () => {
    const a = member("a", 100);
    const result = combineOverview([a, member("b", 300)]);
    expect(new Set(result.accounts.map((v) => v.id)).size).toBe(2);
    expect(result.holdings[1].instrument?.id).toBe("b::same-asset");
    expect(a.accounts[0].id).toBe("same-account");
    expect(a.holdings[0].weight).toBe(1);
  });
  it("rejects mixed valuation currencies and preserves missing-price warnings", () => {
    const a = member("a", 100),
      b = member("b", 300);
    b.currentValuation.summary.warnings = ["Missing quote"];
    expect(combineOverview([a, b]).currentValuation.summary.warnings).toEqual(["Missing quote"]);
    b.currentValuation.summary.baseCurrency = "USD";
    expect(() => combineOverview([a, b])).toThrow("different reporting currencies");
  });
});
