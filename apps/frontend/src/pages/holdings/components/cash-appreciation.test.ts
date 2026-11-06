import { ActivityType, HoldingType } from "@/lib/constants";
import type { ActivityDetails, Holding } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { calculateCashAppreciation } from "./cash-appreciation";

const accountId = "us-account";

function funding(amount: number, fxRate: number): ActivityDetails {
  return {
    accountId,
    activityType: ActivityType.DEPOSIT,
    amount: String(amount),
    fxRate: String(fxRate),
    currency: "USD",
  } as ActivityDetails;
}

const cashHolding = {
  accountId,
  holdingType: HoldingType.CASH,
  localCurrency: "USD",
  baseCurrency: "INR",
  fxRate: 95.22000262825446,
  marketValue: { local: 2453.4116105, base: 233613.86 },
} as Holding;

describe("cash appreciation", () => {
  it("matches the weighted funding-rate return for the current US cash balance", () => {
    const result = calculateCashAppreciation(cashHolding, [
      funding(851, 97.11),
      funding(1002.91, 96.2),
      funding(1551, 96.7),
    ]);

    expect(result?.averageFundingFxRate).toBeCloseTo(96.6551985);
    expect(result?.gainBase).toBeCloseTo(-3521.13, 1);
    expect(result?.gainPct).toBeCloseTo(-0.0148486);
  });

  it("does not report currency performance without valid funding FX rates", () => {
    expect(calculateCashAppreciation(cashHolding, [funding(1000, 0)])).toBeNull();
  });
});
