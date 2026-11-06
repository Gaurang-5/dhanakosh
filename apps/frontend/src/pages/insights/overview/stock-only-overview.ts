import type { ExposureView } from "@/adapters/shared/fund-exposure";
// NSE Nifty Total Market constituents, captured 2026-11-02.
// https://archives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv
import { stockSectorLookup, normalizeStockSector } from "@/features/fund-exposure/stock-sectors";
import type { Asset } from "@/lib/types";
import {
  aggregateTotalExposure,
  canonicalExposureIdentifier,
} from "@/features/fund-exposure/total-exposure-model";
import type {
  AccountValueSource,
  Holding,
  PortfolioAllocations,
  TaxonomyAllocation,
} from "@/lib/types";
function exposureStockIdentity(identifier: string): { symbol: string; exchangeMic?: string } {
  if (identifier.startsWith("NSE:")) {
    return { symbol: identifier.slice(4), exchangeMic: "XNSE" };
  }
  if (identifier.startsWith("BSE:")) {
    return { symbol: identifier.slice(4), exchangeMic: "XBOM" };
  }
  return { symbol: identifier.replace(/^[^:]+:/, "") };
}

function allocation(name: string, values: Map<string, number>): TaxonomyAllocation {
  const total = [...values.values()].reduce((sum, value) => sum + value, 0);
  return {
    taxonomyId: name.toLowerCase().replaceAll(" ", "_"),
    taxonomyName: name,
    color: "#64748b",
    categories: [...values]
      .sort((a, b) => b[1] - a[1])
      .map(([categoryName, value], index) => ({
        categoryId: categoryName,
        categoryName,
        color: ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e"][index % 5],
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
      })),
  };
}

export function buildStockOnlyOverview(
  view: ExposureView,
  directHoldings: Holding[],
  displayCurrency = view.currency,
  scale = 1,
  assets: Asset[] = [],
) {
  const sectorLookup = stockSectorLookup(assets);
  const direct = new Map(directHoldings.map((holding) => [holding.instrument?.id, holding]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const assetsByIsin = new Map<string, Asset | null>();
  for (const asset of assets) {
    const identifiers = asset.metadata?.identifiers as { isin?: unknown } | undefined;
    const rawIsin = identifiers?.isin ?? asset.metadata?.isin;
    if (typeof rawIsin !== "string" || !/^IN[A-Z0-9]{10}$/i.test(rawIsin.trim())) continue;
    const isin = rawIsin.trim().toUpperCase();
    assetsByIsin.set(isin, assetsByIsin.has(isin) ? null : asset);
  }
  const sectors = new Map<string, string>();
  for (const snapshot of view.snapshots) {
    for (const constituent of snapshot.constituents) {
      if (constituent.sector)
        sectors.set(canonicalExposureIdentifier(constituent.identifier), constituent.sector);
    }
  }
  const rows = aggregateTotalExposure(view.report.contributions).map((row) => ({
    ...row,
    totalValue: row.totalValue * scale,
  }));
  const holdings: Holding[] = rows.map((row) => {
    const original = row.directAssetId ? direct.get(row.directAssetId) : undefined;
    const knownAsset =
      (row.directAssetId ? assetsById.get(row.directAssetId) : undefined) ??
      assetsByIsin.get(row.identifier);
    const identity = exposureStockIdentity(row.identifier);
    return {
      id: original?.id ?? `exposure:${row.identifier}`,
      holdingType: "security",
      accountId: original?.accountId ?? "",
      instrument: {
        id: original?.instrument?.id ?? knownAsset?.id ?? "",
        symbol: original?.instrument?.symbol ?? knownAsset?.instrumentSymbol ?? identity.symbol,
        name: knownAsset?.name ?? row.name,
        exchangeMic:
          original?.instrument?.exchangeMic ||
          knownAsset?.instrumentExchangeMic ||
          identity.exchangeMic,
        currency: displayCurrency,
        quoteMode: "MANUAL",
        instrumentType: "EQUITY",
      },
      quantity: original?.quantity ?? 0,
      localCurrency: displayCurrency,
      baseCurrency: displayCurrency,
      marketValue: { local: row.totalValue, base: row.totalValue },
      weight: 0,
      asOfDate: original?.asOfDate ?? "",
      ...(row.fundValue === 0 && original
        ? { dayChange: original.dayChange, dayChangePct: original.dayChangePct }
        : {}),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.totalValue, 0);
  for (const holding of holdings) holding.weight = total > 0 ? holding.marketValue.base / total : 0;

  const sectorValues = new Map<string, number>();
  const sectorByHoldingId: Record<string, string> = {};
  const regionValues = new Map<string, number>();
  for (const [index, row] of rows.entries()) {
    const directSector = row.directAssetId
      ? direct.get(row.directAssetId)?.instrument?.classifications?.sectors[0]?.topLevelCategory
          .name
      : undefined;
    const sector =
      normalizeStockSector(directSector) ??
      normalizeStockSector(sectors.get(row.identifier)) ??
      sectorLookup[row.directAssetId ?? ""] ??
      sectorLookup[row.identifier] ??
      "Unknown";
    sectorByHoldingId[holdings[index].id] = sector;
    sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + row.totalValue);
    const directRegion = row.directAssetId
      ? direct.get(row.directAssetId)?.instrument?.classifications?.regions[0]?.topLevelCategory
          .name
      : undefined;
    const region =
      row.identifier.startsWith("NSE:") ||
      row.identifier.startsWith("BSE:") ||
      row.identifier.startsWith("INE")
        ? "India"
        : row.identifier.startsWith("US:") || row.identifier.startsWith("US")
          ? "United States"
          : (directRegion ?? "Unknown");
    regionValues.set(region, (regionValues.get(region) ?? 0) + row.totalValue);
  }
  const classes = allocation("Asset classes", new Map([["Stocks", total]]));
  const securityTypes = allocation("Security types", new Map([["Stocks", total]]));
  const allocations: PortfolioAllocations = {
    assetClasses: classes,
    sectors: allocation("Sectors", sectorValues),
    regions: allocation("Regions", regionValues),
    riskCategory: allocation("Risk", new Map([["Unknown", total]])),
    securityTypes,
    customGroups: [],
    totalValue: total,
  };
  const accountValues = new Map<string, number>();
  for (const contribution of view.report.contributions) {
    accountValues.set(
      contribution.accountId,
      (accountValues.get(contribution.accountId) ?? 0) + Number(contribution.value) * scale,
    );
  }
  const accountValuations: AccountValueSource[] = [...accountValues].map(([accountId, value]) => ({
    accountId,
    totalValueBase: value,
  }));
  return {
    holdings,
    sectorByHoldingId,
    allocations,
    accountValuations,
    unexpandedValue: Number(view.report.unexpandedValue) * scale,
  };
}
