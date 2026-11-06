import type { Asset, Holding } from "@/lib/types";
import nseSectors from "@/data/nse-stock-sectors.json";
import { canonicalExposureIdentifier } from "./total-exposure-model";

const aliases: Record<string, string> = {
  Technology: "Information Technology",
  Financials: "Financial Services",
  "Communication Services": "Telecommunication",
  "Health Care": "Healthcare",
};
export function normalizeStockSector(value?: string | null): string | undefined {
  const name = value?.trim();
  return name && !/^(unknown|unclassified|n\/a)$/i.test(name) ? (aliases[name] ?? name) : undefined;
}

// Issuer descriptions: https://www.jio.com/about/ and https://www.sbimf.com/about-us
const issuerSectors: Record<string, string> = {
  "NSE:JPL": "Telecommunication",
  "NSE:SBIFUNDS": "Financial Services",
  INE640G01020: "Financial Services",
  "NSE:NXST": "Realty",
  INE0NDH25011: "Realty",
};

export function stockSectorLookup(assets: Asset[]): Record<string, string> {
  const result: Record<string, string> = { ...nseSectors, ...issuerSectors };
  for (const asset of assets) {
    const profile = asset.metadata?.profile as Record<string, unknown> | undefined;
    let sectors: unknown = profile?.sectors;
    if (typeof sectors === "string") {
      try {
        sectors = JSON.parse(sectors);
      } catch {
        sectors = undefined;
      }
    }
    const entries = (Array.isArray(sectors) ? (sectors as unknown[]) : []).filter(
      (entry): entry is { name: string; weight: number } =>
        typeof entry === "object" &&
        entry !== null &&
        "name" in entry &&
        typeof entry.name === "string" &&
        "weight" in entry &&
        typeof entry.weight === "number",
    );
    const first = entries.sort((a, b) => b.weight - a.weight)[0]?.name ?? profile?.sector;
    const sector = normalizeStockSector(typeof first === "string" ? first : undefined);
    if (!sector) continue;
    result[asset.id] = sector;
    const identifiers = asset.metadata?.identifiers as { isin?: unknown } | undefined;
    const rawIsin = identifiers?.isin ?? asset.metadata?.isin;
    if (typeof rawIsin === "string" && rawIsin.trim()) {
      const isin = rawIsin.trim().toUpperCase();
      result[isin] = sector;
      result[canonicalExposureIdentifier(isin)] = sector;
    }
    const symbol = asset.instrumentSymbol;
    if (symbol) {
      const market =
        asset.instrumentExchangeMic === "XNSE"
          ? "NSE"
          : asset.instrumentExchangeMic === "XBOM"
            ? "BSE"
            : asset.quoteCcy === "USD"
              ? "US"
              : undefined;
      if (market) result[`${market}:${symbol}`] = sector;
    }
  }
  return result;
}

export function holdingSector(holding: Holding, lookup: Record<string, string>): string {
  const instrument = holding.instrument;
  const classified = normalizeStockSector(
    instrument?.classifications?.sectors[0]?.topLevelCategory.name,
  );
  if (classified) return classified;
  if (!instrument) return "Unknown";
  const market =
    instrument.exchangeMic === "XNSE" || instrument.currency === "INR"
      ? "NSE"
      : instrument.currency === "USD"
        ? "US"
        : "";
  return (
    lookup[instrument.id] ??
    lookup[instrument.isin ?? ""] ??
    lookup[`${market}:${instrument.symbol}`] ??
    "Unknown"
  );
}

function nameSaysEtf(name?: string | null): boolean {
  return /\betfs?\b/i.test(name ?? "");
}

export function isFundHolding(holding: Holding): boolean {
  const instrument = holding.instrument;
  return (
    /^(ETF|ETFs|MUTUAL_?FUND|MUTUAL FUND|FUND)$/i.test(instrument?.instrumentType ?? "") ||
    /^0P[A-Z0-9]{8}$/i.test(instrument?.symbol ?? "") ||
    (instrument?.isin ?? "").startsWith("INF") ||
    nameSaysEtf(instrument?.name)
  );
}
