import { describe, expect, it } from "vitest";
import {
  accountCurrencyScale,
  singleNativeCurrency,
  valueStripInDisplayCurrency,
} from "./overview-display-currency";

describe("overview display currency", () => {
  it("offers a native currency only when every scoped account matches", () => {
    const accounts = [
      { id: "us-1", currency: "USD" },
      { id: "us-2", currency: "USD" },
      { id: "in", currency: "INR" },
    ] as never[];
    expect(singleNativeCurrency(accounts, ["us-1", "us-2"])).toBe("USD");
    expect(singleNativeCurrency(accounts, ["us-1", "in"])).toBeNull();
  });

  it("derives the exact account-to-base conversion from the scoped valuation", () => {
    const scale = accountCurrencyScale(
      [
        {
          accountCurrency: "USD",
          totalValue: 1_000,
          totalValueBase: 85_000,
        },
      ] as never[],
      "USD",
    );
    expect(scale).toBeCloseTo(1 / 85);
  });

  it("converts monetary totals without changing portfolio percentages", () => {
    const converted = valueStripInDisplayCurrency(
      {
        total: 85_000,
        cash: 42_500,
        invested: 42_500,
        investedPercent: 50,
        bookCost: 34_000,
        unrealizedPnl: 8_500,
        holdingsCount: 2,
        accountsCount: 1,
        currencySplit: [],
        cashCurrencySplit: [],
        bookCostCurrencySplit: [],
      },
      1 / 85,
    );
    expect(converted).toMatchObject({
      total: 1_000,
      cash: 500,
      invested: 500,
      bookCost: 400,
      unrealizedPnl: 100,
      investedPercent: 50,
    });
  });
});
