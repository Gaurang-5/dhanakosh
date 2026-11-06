import { isAlternativeAssetKind } from "@/lib/constants";
import type { AssetKind } from "@/lib/types";

export interface DayChangeHolding {
  holdingType?: string | null;
  assetKind?: string | null;
  isClosed?: boolean;
  dayChange?: { base?: number | null } | null;
  dayChangePct?: number | null;
  prevCloseValue?: { base?: number | null } | null;
}

export interface PortfolioDayChange {
  amount: number | null;
  percent: number | null;
}

const EMPTY_DAY_CHANGE: PortfolioDayChange = { amount: null, percent: null };

function isAlternative(kind: string | null | undefined): boolean {
  return kind != null && isAlternativeAssetKind(kind as AssetKind);
}

/**
 * Sum of holding day P&L, with the percent taken against the previous close.
 * Cash, closed positions, and unquoted alternative assets are left out so the
 * percent matches the priced investment book.
 */
export function portfolioDayChange(holdings: DayChangeHolding[]): PortfolioDayChange {
  let amount = 0;
  let previous = 0;
  let counted = 0;

  for (const holding of holdings) {
    if (holding.isClosed) continue;
    if ((holding.holdingType ?? "").toLowerCase() === "cash") continue;
    if (isAlternative(holding.assetKind)) continue;

    const change = holding.dayChange?.base;
    if (change == null || !Number.isFinite(change)) continue;

    const prevClose = holding.prevCloseValue?.base;
    let prev: number | null = null;
    if (prevClose != null && Number.isFinite(prevClose) && Math.abs(prevClose) > 0) {
      prev = Math.abs(prevClose);
    } else if (
      holding.dayChangePct != null &&
      Number.isFinite(holding.dayChangePct) &&
      holding.dayChangePct !== 0
    ) {
      prev = Math.abs(change / holding.dayChangePct);
    }
    if (prev == null || !Number.isFinite(prev) || prev <= 0) continue;

    amount += change;
    previous += prev;
    counted += 1;
  }

  if (counted === 0 || previous <= 0) return EMPTY_DAY_CHANGE;
  return { amount, percent: amount / previous };
}

/** Change between the first and last plotted investment values in a chart range. */
export function investmentValueChange(values: number[]): PortfolioDayChange {
  const plotted = values.filter((value) => Number.isFinite(value));
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  if (plotted.length < 2 || first == null || last == null || first === 0) return EMPTY_DAY_CHANGE;
  const amount = last - first;
  return { amount, percent: amount / first };
}
