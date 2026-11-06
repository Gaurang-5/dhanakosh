import type {
  Account,
  AccountValueSource,
  CategoryAllocation,
  CurrentAccountValuation,
  Holding,
  MonetaryValue,
  PortfolioAllocations,
  TaxonomyAllocation,
} from "@/lib/types";
import type { ValueStripData } from "./allocation-derivations";

export function singleNativeCurrency(
  accounts: Account[],
  accountIds: string[] | undefined,
): string | null {
  const scoped = accountIds
    ? accounts.filter((account) => accountIds.includes(account.id))
    : accounts;
  if (!scoped.length) return null;
  const currencies = new Set(scoped.map((account) => account.currency.trim().toUpperCase()));
  return currencies.size === 1 ? ([...currencies][0] ?? null) : null;
}

export function accountCurrencyScale(
  valuations: CurrentAccountValuation[] | undefined,
  currency: string,
): number | null {
  const matching = (valuations ?? []).filter(
    (valuation) => valuation.accountCurrency.trim().toUpperCase() === currency,
  );
  if (!matching.length) return null;

  const totalLocal = matching.reduce(
    (sum, valuation) => sum + Number(valuation.totalValue || 0),
    0,
  );
  const totalBase = matching.reduce(
    (sum, valuation) => sum + Number(valuation.totalValueBase || 0),
    0,
  );
  if (Number.isFinite(totalLocal) && Number.isFinite(totalBase) && Math.abs(totalBase) > 1e-9) {
    return totalLocal / totalBase;
  }

  const fxRate = matching.find((valuation) => Number(valuation.fxRateToBase) > 0)?.fxRateToBase;
  return fxRate && Number.isFinite(fxRate) ? 1 / fxRate : null;
}

function scaleMoney(
  value: MonetaryValue | null | undefined,
  scale: number,
  useLocal: boolean,
): MonetaryValue | null | undefined {
  if (value == null) return value;
  return { ...value, base: useLocal ? value.local : value.base * scale };
}

export function holdingsInDisplayCurrency(
  holdings: Holding[],
  displayCurrency: string,
  scale: number,
): Holding[] {
  return holdings.map((holding) => {
    const useLocal = holding.localCurrency.trim().toUpperCase() === displayCurrency;
    return {
      ...holding,
      baseCurrency: displayCurrency,
      fxRate: useLocal ? 1 : holding.fxRate,
      marketValue: scaleMoney(holding.marketValue, scale, useLocal)!,
      costBasis: scaleMoney(holding.costBasis, scale, useLocal),
      unrealizedGain: scaleMoney(holding.unrealizedGain, scale, useLocal),
      realizedGain: scaleMoney(holding.realizedGain, scale, useLocal),
      totalGain: scaleMoney(holding.totalGain, scale, useLocal),
      income: scaleMoney(holding.income, scale, useLocal),
      totalReturn: scaleMoney(holding.totalReturn, scale, useLocal),
      returnBasis: scaleMoney(holding.returnBasis, scale, useLocal),
      dayChange: scaleMoney(holding.dayChange, scale, useLocal),
      prevCloseValue: scaleMoney(holding.prevCloseValue, scale, useLocal),
    };
  });
}

function scaleCategory(category: CategoryAllocation, scale: number): CategoryAllocation {
  return {
    ...category,
    value: category.value * scale,
    children: category.children?.map((child) => scaleCategory(child, scale)),
  };
}

function scaleTaxonomy(allocation: TaxonomyAllocation, scale: number): TaxonomyAllocation {
  return {
    ...allocation,
    categories: allocation.categories.map((category) => scaleCategory(category, scale)),
  };
}

export function allocationsInDisplayCurrency(
  allocations: PortfolioAllocations | undefined,
  scale: number,
): PortfolioAllocations | undefined {
  if (!allocations || scale === 1) return allocations;
  return {
    ...allocations,
    totalValue: allocations.totalValue * scale,
    assetClasses: scaleTaxonomy(allocations.assetClasses, scale),
    sectors: scaleTaxonomy(allocations.sectors, scale),
    regions: scaleTaxonomy(allocations.regions, scale),
    riskCategory: scaleTaxonomy(allocations.riskCategory, scale),
    securityTypes: scaleTaxonomy(allocations.securityTypes, scale),
    customGroups: allocations.customGroups.map((allocation) => scaleTaxonomy(allocation, scale)),
  };
}

export function accountValuesInDisplayCurrency(
  valuations: CurrentAccountValuation[] | undefined,
  displayCurrency: string,
  scale: number,
): AccountValueSource[] | undefined {
  return valuations?.map((valuation) => {
    const useLocal = valuation.accountCurrency.trim().toUpperCase() === displayCurrency;
    return {
      accountId: valuation.accountId,
      totalValue: valuation.totalValue,
      totalValueBase: useLocal ? valuation.totalValue : valuation.totalValueBase * scale,
      fxRateToBase: useLocal ? 1 : valuation.fxRateToBase,
    };
  });
}

export function valueStripInDisplayCurrency(data: ValueStripData, scale: number): ValueStripData {
  if (scale === 1) return data;
  return {
    ...data,
    total: data.total * scale,
    cash: data.cash * scale,
    invested: data.invested * scale,
    bookCost: data.bookCost * scale,
    unrealizedPnl: data.unrealizedPnl == null ? null : data.unrealizedPnl * scale,
  };
}
