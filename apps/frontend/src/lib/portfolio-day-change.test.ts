import { describe, expect, it } from "vitest";
import {
  investmentValueChange,
  portfolioDayChange,
  type DayChangeHolding,
} from "./portfolio-day-change";

function holding(overrides: DayChangeHolding): DayChangeHolding {
  return {
    holdingType: "security",
    dayChange: { base: 10 },
    prevCloseValue: { base: 1000 },
    ...overrides,
  };
}

describe("portfolioDayChange", () => {
  it("sums day P&L and weights the percent by previous close", () => {
    expect(
      portfolioDayChange([
        holding({ dayChange: { base: 10 }, prevCloseValue: { base: 1000 } }),
        holding({ dayChange: { base: -4 }, prevCloseValue: { base: 500 } }),
      ]),
    ).toEqual({ amount: 6, percent: 6 / 1500 });
  });

  it("ignores cash, closed positions, alternatives, and holdings without a quote move", () => {
    expect(
      portfolioDayChange([
        holding({ dayChange: { base: 10 }, prevCloseValue: { base: 1000 } }),
        holding({ holdingType: "cash", dayChange: { base: 0 }, prevCloseValue: { base: 5000 } }),
        holding({ isClosed: true, dayChange: { base: 50 }, prevCloseValue: { base: 100 } }),
        holding({ assetKind: "PROPERTY", dayChange: { base: 20 }, prevCloseValue: { base: 200 } }),
        holding({ dayChange: null, prevCloseValue: { base: 100 } }),
      ]),
    ).toEqual({ amount: 10, percent: 0.01 });
  });

  it("reconstructs the previous close from the day-change percent", () => {
    expect(
      portfolioDayChange([
        holding({ dayChange: { base: 10 }, dayChangePct: 0.01, prevCloseValue: null }),
      ]),
    ).toEqual({ amount: 10, percent: 0.01 });
  });

  it("measures a chart range from the first plotted value to the last", () => {
    expect(investmentValueChange([1000, 1100])).toEqual({ amount: 100, percent: 0.1 });
    expect(investmentValueChange([1000])).toEqual({ amount: null, percent: null });
    expect(investmentValueChange([0, 50])).toEqual({ amount: null, percent: null });
  });

  it("returns null when no holding has a usable previous close", () => {
    expect(portfolioDayChange([])).toEqual({ amount: null, percent: null });
    expect(
      portfolioDayChange([holding({ dayChange: { base: 10 }, prevCloseValue: null })]),
    ).toEqual({ amount: null, percent: null });
  });
});
