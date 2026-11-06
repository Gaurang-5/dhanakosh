import type {
  Account,
  CategoryAllocation,
  CurrentValuationResponse,
  Holding,
  PortfolioAllocations,
  TaxonomyAllocation,
  NetWorthResponse,
  AlternativeAssetHolding,
  BreakdownItem,
} from "@/lib/types";

export interface MemberOverview {
  alternativeHoldings: AlternativeAssetHolding[];
  netWorth: NetWorthResponse;
  memberId: string;
  memberName: string;
  accounts: Account[];
  holdings: Holding[];
  allocations: PortfolioAllocations;
  currentValuation: CurrentValuationResponse;
}

export interface HouseholdOverviewData {
  alternativeHoldings: AlternativeAssetHolding[];
  netWorth: NetWorthResponse | null;
  accounts: Account[];
  holdings: Holding[];
  allocations: PortfolioAllocations;
  currentValuation: CurrentValuationResponse;
}

export function householdRecordId(memberId: string, id: string) {
  return `${memberId}::${id}`;
}

function mergeCategories(groups: CategoryAllocation[][], total: number): CategoryAllocation[] {
  const categories = new Map<string, CategoryAllocation[]>();
  for (const category of groups.flat()) {
    categories.set(category.categoryId, [...(categories.get(category.categoryId) ?? []), category]);
  }
  return [...categories.values()]
    .map((rows) => {
      const value = rows.reduce((sum, row) => sum + row.value, 0);
      return {
        ...rows[0],
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        children: mergeCategories(
          rows.map((row) => row.children ?? []),
          total,
        ),
      };
    })
    .sort((a, b) => b.value - a.value);
}

function mergeTaxonomies(rows: TaxonomyAllocation[], total: number): TaxonomyAllocation {
  return {
    ...rows[0],
    categories: mergeCategories(
      rows.map((row) => row.categories),
      total,
    ),
  };
}

export function combineOverview(reports: MemberOverview[]): HouseholdOverviewData {
  if (!reports.length) throw new Error("No members selected");
  const currency = reports[0].currentValuation.summary.baseCurrency;
  if (reports.some((report) => report.currentValuation.summary.baseCurrency !== currency)) {
    throw new Error("Cannot combine different reporting currencies");
  }
  const accounts = reports.flatMap((report) =>
    report.accounts.map((account) => ({
      ...account,
      id: householdRecordId(report.memberId, account.id),
      group: report.memberName,
      name: `${report.memberName} · ${account.name}`,
    })),
  );
  const holdings = reports.flatMap((report) =>
    report.holdings.map((holding) => ({
      ...holding,
      id: householdRecordId(report.memberId, holding.id),
      accountId: householdRecordId(report.memberId, holding.accountId),
      instrument: holding.instrument
        ? { ...holding.instrument, id: householdRecordId(report.memberId, holding.instrument.id) }
        : holding.instrument,
      sourceAccountIds: [householdRecordId(report.memberId, holding.accountId)],
    })),
  );
  const totalHoldingsValue = holdings.reduce((sum, h) => sum + Math.abs(h.marketValue.base), 0);
  for (const holding of holdings)
    holding.weight = totalHoldingsValue > 0 ? holding.marketValue.base / totalHoldingsValue : 0;
  const total = reports.reduce((sum, report) => sum + report.allocations.totalValue, 0);
  const allocations: PortfolioAllocations = {
    totalValue: total,
    assetClasses: mergeTaxonomies(
      reports.map((r) => r.allocations.assetClasses),
      total,
    ),
    regions: mergeTaxonomies(
      reports.map((r) => r.allocations.regions),
      total,
    ),
    sectors: mergeTaxonomies(
      reports.map((r) => r.allocations.sectors),
      total,
    ),
    riskCategory: mergeTaxonomies(
      reports.map((r) => r.allocations.riskCategory),
      total,
    ),
    securityTypes: mergeTaxonomies(
      reports.map((r) => r.allocations.securityTypes),
      total,
    ),
    // Custom taxonomies belong to a member; identical names do not imply identical categories.
    customGroups: reports.flatMap((r) =>
      r.allocations.customGroups.map((group) => ({
        ...group,
        taxonomyId: householdRecordId(r.memberId, group.taxonomyId),
        taxonomyName: `${r.memberName} · ${group.taxonomyName}`,
      })),
    ),
  };
  const summaries = reports.map((r) => r.currentValuation.summary);
  const totalValue = summaries.reduce((sum, row) => sum + row.totalValueBase, 0);
  const cashValue = summaries.reduce((sum, row) => sum + row.cashBalanceBase, 0);
  const split = (key: "currencySplit" | "cashCurrencySplit", denominator: number) => {
    const currencies = [...new Set(summaries.flatMap((s) => s[key].map((v) => v.currency)))];
    return currencies.map((currency) => {
      const rows = summaries.flatMap((s) => s[key].filter((v) => v.currency === currency));
      const valueBase = rows.reduce((sum, row) => sum + row.valueBase, 0);
      return {
        currency,
        valueBase,
        valueLocal: rows.every((row) => row.valueLocal != null)
          ? rows.reduce((sum, row) => sum + row.valueLocal!, 0)
          : null,
        percentage: denominator > 0 ? (valueBase / denominator) * 100 : 0,
      };
    });
  };
  const netWorthReports = reports.map((r) => r.netWorth);
  const mapBreakdown = (r: MemberOverview, rows: BreakdownItem[]): BreakdownItem[] =>
    rows.map((row) => ({
      ...row,
      assetId: row.assetId ? householdRecordId(r.memberId, row.assetId) : undefined,
      children: row.children ? mapBreakdown(r, row.children) : undefined,
    }));
  const categories = new Map<string, BreakdownItem>();
  for (const r of reports)
    for (const row of mapBreakdown(r, r.netWorth.assets.breakdown)) {
      const existing = categories.get(row.category);
      categories.set(
        row.category,
        existing
          ? {
              ...existing,
              value: String(Number(existing.value) + Number(row.value)),
              children: [...(existing.children ?? []), ...(row.children ?? [])],
            }
          : row,
      );
    }
  const netWorth: NetWorthResponse | null = netWorthReports.every((r) => r.currency === currency)
    ? {
        ...netWorthReports[0],
        netWorth: String(netWorthReports.reduce((sum, r) => sum + Number(r.netWorth), 0)),
        assets: {
          total: String(netWorthReports.reduce((sum, r) => sum + Number(r.assets.total), 0)),
          breakdown: [...categories.values()],
        },
        liabilities: {
          total: String(netWorthReports.reduce((sum, r) => sum + Number(r.liabilities.total), 0)),
          breakdown: reports.flatMap((r) => mapBreakdown(r, r.netWorth.liabilities.breakdown)),
        },
        staleAssets: reports.flatMap((r) =>
          r.netWorth.staleAssets.map((asset) => ({
            ...asset,
            assetId: householdRecordId(r.memberId, asset.assetId),
          })),
        ),
        oldestValuationDate: netWorthReports
          .map((r) => r.oldestValuationDate)
          .filter((date): date is string => !!date)
          .sort()[0],
      }
    : null;
  return {
    netWorth,
    alternativeHoldings: reports.flatMap((r) =>
      r.alternativeHoldings.map((h) => ({
        ...h,
        id: householdRecordId(r.memberId, h.id),
        name: `${r.memberName} · ${h.name}`,
        linkedAssetId: h.linkedAssetId
          ? householdRecordId(r.memberId, h.linkedAssetId)
          : h.linkedAssetId,
      })),
    ),
    accounts,
    holdings,
    allocations,
    currentValuation: {
      accounts: reports.flatMap((r) =>
        r.currentValuation.accounts.map((a) => ({
          ...a,
          accountId: householdRecordId(r.memberId, a.accountId),
        })),
      ),
      summary: {
        ...summaries[0],
        scopeId: "household",
        totalValueBase: totalValue,
        cashBalanceBase: cashValue,
        investmentMarketValueBase: summaries.reduce(
          (sum, row) => sum + row.investmentMarketValueBase,
          0,
        ),
        holdingsCount: holdings.filter((h) => !h.isClosed).length,
        accountCount: accounts.length,
        currencySplit: split("currencySplit", totalValue),
        cashCurrencySplit: split("cashCurrencySplit", cashValue),
        sourceDataAsOf: summaries.some((s) => !s.sourceDataAsOf)
          ? null
          : summaries.map((s) => s.sourceDataAsOf!).sort()[0],
        calculatedAt: summaries.map((s) => s.calculatedAt).sort()[0],
        warnings: [...new Set(summaries.flatMap((s) => s.warnings))],
      },
    },
  };
}
