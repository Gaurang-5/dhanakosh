import { HoldingType } from "@/lib/constants";
import type { Holding } from "@/lib/types";

/** Cash belongs to the ledger, not the investment position list or its weights. */
export function separateCashHoldings(holdings: Holding[]) {
  const cash = holdings.filter((holding) => holding.holdingType === HoldingType.CASH);
  const positions = holdings.filter((holding) => holding.holdingType !== HoldingType.CASH);
  const investmentValue = positions.reduce((sum, holding) => sum + holding.marketValue.base, 0);
  return {
    cash,
    investments: positions.map((holding) => ({
      ...holding,
      weight: investmentValue > 0 ? holding.marketValue.base / investmentValue : 0,
    })),
  };
}
