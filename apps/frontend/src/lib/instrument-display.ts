import type { Instrument } from "@/lib/types";

interface InstrumentIdentity {
  symbol?: string | null;
  name?: string | null;
  exchangeMic?: string | null;
  instrumentType?: string | null;
}

export interface InstrumentAvatarIdentity {
  symbol: string;
  exchangeMic?: string | null;
}

const YAHOO_MUTUAL_FUND_CODE = /^0P[A-Z0-9]{8}$/i;

const FUND_HOUSE_LOGO_IDENTITIES: readonly {
  prefixes: readonly string[];
  symbol: string;
  exchangeMic?: string;
}[] = [
  { prefixes: ["ADITYA BIRLA", "ADITYA BSL", "ABSL"], symbol: "ABSLAMC", exchangeMic: "XNSE" },
  { prefixes: ["HDFC"], symbol: "HDFCAMC", exchangeMic: "XNSE" },
  { prefixes: ["ICICI PRUDENTIAL", "ICICI PRU"], symbol: "ICICIPRULI", exchangeMic: "XNSE" },
  { prefixes: ["SBI"], symbol: "SBIN", exchangeMic: "XNSE" },
  { prefixes: ["AXIS"], symbol: "AXISBANK", exchangeMic: "XNSE" },
  { prefixes: ["KOTAK"], symbol: "KOTAKBANK", exchangeMic: "XNSE" },
  { prefixes: ["NIPPON INDIA", "NIPPON"], symbol: "NAM-INDIA", exchangeMic: "XNSE" },
  { prefixes: ["UTI"], symbol: "UTIAMC", exchangeMic: "XNSE" },
  { prefixes: ["MOTILAL OSWAL"], symbol: "MOTILALOFS", exchangeMic: "XNSE" },
  { prefixes: ["FRANKLIN TEMPLETON", "FRANKLIN INDIA", "FRANKLIN"], symbol: "FRANKLIN" },
  { prefixes: ["MIRAE ASSET", "MIRAE"], symbol: "MIRAE" },
  { prefixes: ["DSP"], symbol: "DSP" },
  { prefixes: ["QUANT"], symbol: "QUANT" },
];

function normalizedName(instrument: InstrumentIdentity): string {
  return instrument.name?.trim() ?? "";
}

/** Yahoo mutual-fund quote codes are useful for pricing, but should never be the UI identity. */
export function isYahooMutualFundInstrument(instrument?: InstrumentIdentity | null): boolean {
  return !!instrument?.symbol && YAHOO_MUTUAL_FUND_CODE.test(instrument.symbol.trim());
}

/** Fund identifiers are search keys; scheme names are their display identity. */
export function isMutualFundInstrument(instrument?: InstrumentIdentity | null): boolean {
  if (!instrument) return false;
  return (
    isYahooMutualFundInstrument(instrument) ||
    /^INF[A-Z0-9]{9}$/i.test(instrument.symbol?.trim() ?? "") ||
    /^(MUTUAL_?FUND|MUTUAL FUND|FUND)$/i.test(instrument.instrumentType ?? "")
  );
}

/** Primary user-facing identity. Technical mutual-fund quote codes remain internal. */
export function getInstrumentPrimaryLabel(instrument?: InstrumentIdentity | null): string {
  if (!instrument) return "";
  const name = normalizedName(instrument);
  if (isMutualFundInstrument(instrument) && name) return name;
  return instrument.symbol?.trim() || name;
}

/** Avoid repeating the mutual-fund name below itself in compact holding rows. */
export function getInstrumentSecondaryLabel(instrument?: InstrumentIdentity | null): string | null {
  if (!instrument || isMutualFundInstrument(instrument)) return null;
  return normalizedName(instrument) || null;
}

/**
 * Resolve a mutual fund to its AMC identity while preserving the actual asset id for custom-logo
 * overrides. Known Indian AMCs reuse the existing Indian-market logo provider; other AMCs fall
 * back to readable house initials instead of a Yahoo code.
 */
export function getInstrumentAvatarIdentity(
  instrument?: Pick<Instrument, "symbol" | "name" | "exchangeMic" | "instrumentType"> | null,
): InstrumentAvatarIdentity {
  const symbol = instrument?.symbol?.trim() ?? "";
  if (!instrument || !isMutualFundInstrument(instrument)) {
    return { symbol, exchangeMic: instrument?.exchangeMic };
  }

  const name = normalizedName(instrument).toUpperCase();
  const match = FUND_HOUSE_LOGO_IDENTITIES.find(({ prefixes }) =>
    prefixes.some((prefix) => name.startsWith(prefix)),
  );

  if (match) return { symbol: match.symbol, exchangeMic: match.exchangeMic };

  const fallback = name.split(/\s+/).find(Boolean);
  return { symbol: fallback || "MF" };
}
