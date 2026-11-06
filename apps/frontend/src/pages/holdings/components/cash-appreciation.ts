import { ActivityType } from "@/lib/constants";
import type { ActivityDetails, Holding } from "@/lib/types";

const CASH_FUNDING_TYPES = new Set<string>([ActivityType.DEPOSIT, ActivityType.TRANSFER_IN]);

export interface CashAppreciation {
  averageFundingFxRate: number;
  currentFxRate: number;
  basisBase: number;
  gainBase: number;
  gainPct: number;
}

/**
 * Values foreign cash against the weighted-average FX rate of recorded funding entries.
 * Spending cash on trades or withdrawing it reduces the remaining units without changing
 * their average funding rate, so those rows do not create artificial currency performance.
 */
export function calculateCashAppreciation(
  holding: Holding,
  activities: ActivityDetails[],
): CashAppreciation | null {
  if (holding.localCurrency.toUpperCase() !== "USD") return null;
  if (holding.localCurrency.toUpperCase() === holding.baseCurrency.toUpperCase()) return null;

  let fundedLocal = 0;
  let fundedBase = 0;
  for (const activity of activities) {
    if (activity.accountId !== holding.accountId) continue;
    if (activity.currency.toUpperCase() !== holding.localCurrency.toUpperCase()) continue;
    if (!CASH_FUNDING_TYPES.has(activity.activityType)) continue;

    const amount = Number(activity.amount);
    const fxRate = Number(activity.fxRate);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(fxRate) || fxRate <= 0) {
      continue;
    }

    fundedLocal += amount;
    fundedBase += amount * fxRate;
  }

  const cashLocal = Number(holding.marketValue.local);
  const cashBase = Number(holding.marketValue.base);
  const currentFxRate =
    Number(holding.fxRate) > 0
      ? Number(holding.fxRate)
      : cashLocal !== 0
        ? cashBase / cashLocal
        : 0;
  if (fundedLocal <= 0 || cashLocal <= 0 || !Number.isFinite(currentFxRate) || currentFxRate <= 0) {
    return null;
  }

  const averageFundingFxRate = fundedBase / fundedLocal;
  const basisBase = cashLocal * averageFundingFxRate;
  if (!Number.isFinite(basisBase) || basisBase <= 0) return null;

  const gainBase = cashBase - basisBase;
  return {
    averageFundingFxRate,
    currentFxRate,
    basisBase,
    gainBase,
    gainPct: gainBase / basisBase,
  };
}
