import type { ExposureContribution } from "@/adapters/shared/fund-exposure";
// Official NSE equity list (EQUITY_L.csv), captured 2026-11-02.
// Fund disclosures often provide an ISIN without a ticker or exchange.
import nseEquities from "@/data/nse-equities.json";

const nseSymbolByIsin = nseEquities as Record<string, string>;

export function canonicalExposureIdentifier(identifier: string): string {
  const nseSymbol = nseSymbolByIsin[identifier];
  return nseSymbol ? `NSE:${nseSymbol}` : identifier;
}

export interface ExposureFundLine {
  name: string;
  value: number;
  assetId?: string;
}

export interface TotalExposureRow {
  identifier: string;
  name: string;
  directValue: number;
  fundValue: number;
  totalValue: number;
  fundCount: number;
  funds: ExposureFundLine[];
  directAssetId?: string;
}

export function aggregateTotalExposure(
  contributions: readonly ExposureContribution[],
): TotalExposureRow[] {
  const rows = new Map<
    string,
    Omit<TotalExposureRow, "totalValue" | "fundCount" | "funds"> & {
      fundLines: Map<string, { value: number; assetId?: string }>;
    }
  >();

  for (const contribution of contributions) {
    const identifier = canonicalExposureIdentifier(contribution.identifier);
    const row = rows.get(identifier) ?? {
      identifier,
      name: contribution.name,
      directValue: 0,
      fundValue: 0,
      fundLines: new Map<string, { value: number; assetId?: string }>(),
    };
    const value = Number(contribution.value);
    if (contribution.viaFund) {
      row.fundValue += value;
      const line = row.fundLines.get(contribution.viaFund) ?? { value: 0 };
      line.value += value;
      if (!line.assetId && contribution.assetId) line.assetId = contribution.assetId;
      row.fundLines.set(contribution.viaFund, line);
    } else {
      row.directValue += value;
      row.directAssetId = contribution.assetId;
      row.name = contribution.name;
    }
    rows.set(identifier, row);
  }

  return [...rows.values()]
    .map(({ fundLines, ...row }) => ({
      ...row,
      funds: [...fundLines.entries()]
        .map(([name, line]) => ({
          name,
          value: line.value,
          ...(line.assetId ? { assetId: line.assetId } : {}),
        }))
        .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name)),
      totalValue: row.directValue + row.fundValue,
      fundCount: fundLines.size,
    }))
    .sort((left, right) => right.totalValue - left.totalValue);
}

export interface ExposureSecurityIdentity {
  logoSymbol: string;
  exchangeMic?: string;
  primary: string;
  secondary: string | null;
}

const MARKET_EXCHANGE_MIC: Record<string, string> = {
  NSE: "XNSE",
  BSE: "XBOM",
};

function distinctName(name: string, ticker: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.toUpperCase() === ticker.toUpperCase()) return null;
  return trimmed;
}

/** Ticker, logo market, and the two lines shown for one exposure security. */
export function exposureSecurityIdentity(
  identifier: string,
  name: string,
): ExposureSecurityIdentity {
  const id = identifier.trim();
  const upper = id.toUpperCase();
  const prefixed = /^([A-Z][A-Z0-9]{1,5}):(.+)$/.exec(upper);

  if (prefixed && prefixed[1] !== "ASSET") {
    const ticker = prefixed[2];
    const tickerLike = /^[A-Z0-9.&-]{1,20}$/.test(ticker);
    if (tickerLike) {
      const exchangeMic = MARKET_EXCHANGE_MIC[prefixed[1]];
      return {
        logoSymbol: ticker,
        ...(exchangeMic ? { exchangeMic } : {}),
        primary: ticker,
        secondary: distinctName(name, ticker),
      };
    }
  }

  if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(upper)) {
    return {
      logoSymbol: upper,
      primary: name.trim() || upper,
      secondary: name.trim() ? upper : null,
    };
  }

  if (/^[A-Z0-9.&-]{1,15}$/.test(upper)) {
    return {
      logoSymbol: upper,
      primary: upper,
      secondary: distinctName(name, upper),
    };
  }

  const label = name.trim() || id;
  return {
    logoSymbol: label,
    primary: label,
    secondary: name.trim() && name.trim() !== id ? id : null,
  };
}
