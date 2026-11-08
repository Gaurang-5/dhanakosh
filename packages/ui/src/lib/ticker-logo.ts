const CASH_AVATAR_LABELS: Record<string, string> = {
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
};

const CASH_SYMBOL_PATTERN = /^\$?CASH[-_:]([A-Z]{3})$/;

export const getCashAvatarLabel = (symbol: string): string | null => {
  const normalized = symbol.trim().toUpperCase();
  if (normalized === "$CASH" || normalized === "CASH") return "$";

  const currency = CASH_SYMBOL_PATTERN.exec(normalized)?.[1];
  if (!currency) return null;

  return CASH_AVATAR_LABELS[currency] ?? currency;
};

const CANONICAL_MARKET_SUFFIX = /^(.*)-([A-Z0-9]{4})$/;
const PROVIDER_SUFFIX_TO_PACK_MIC: Record<string, string> = {
  AS: "XAMS",
  AX: "XASX",
  DE: "XETR",
  L: "XLON",
  NZ: "XNZE",
  NS: "XNSE",
  BO: "XBOM",
  PA: "XPAR",
  T: "XTKS",
  TO: "XTSE",
};

export function normalizeTickerLogoSymbol(symbol: unknown): string | undefined {
  if (typeof symbol !== "string") return undefined;

  const normalized = symbol.trim().toUpperCase();
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    !/^[A-Z0-9$^._:&-]+$/.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeExchangeMic(exchangeMic: unknown): string | undefined {
  if (typeof exchangeMic !== "string") return undefined;
  const normalized = exchangeMic.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : undefined;
}

function normalizeFilenameSymbol(symbol: string): string {
  return symbol.replace(/[.^_:]+/g, "-").replace(/-+/g, "-");
}

function getProviderSuffixCompatibilityFilenames(symbol: string): string[] {
  const separatorIndex = symbol.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === symbol.length - 1) return [];

  const baseSymbol = normalizeFilenameSymbol(symbol.slice(0, separatorIndex));
  const providerSuffix = symbol.slice(separatorIndex + 1);
  const marketMic = PROVIDER_SUFFIX_TO_PACK_MIC[providerSuffix];
  return baseSymbol && marketMic ? [`${baseSymbol}-${marketMic}`, baseSymbol] : [];
}

// BSE scrip codes identify the same issuer, but are not NSE trading symbols.
const BSE_TO_NSE_LOGO: Record<string, string> = {
  "500325": "RELIANCE",
  "532540": "TCS",
  "500180": "HDFCBANK",
  "500209": "INFY",
  "532174": "ICICIBANK",
  "507685": "WIPRO",
};
function getIndianCompatibilityFilenames(symbol: string, exchangeMic: unknown): string[] {
  const prefix = /^(NSE|BSE):(.+)$/.exec(symbol);
  const suffix = /^(.+)\.(NS|BO)$/.exec(symbol);
  const canonical = /^(.+)-(XNSE|XBOM)$/.exec(symbol);
  const market = prefix
    ? prefix[1] === "NSE"
      ? "XNSE"
      : "XBOM"
    : (canonical?.[2] ??
      normalizeExchangeMic(exchangeMic) ??
      (suffix ? PROVIDER_SUFFIX_TO_PACK_MIC[suffix[2]] : undefined));
  if (market !== "XNSE" && market !== "XBOM") return [];
  const base = prefix?.[2] ?? suffix?.[1] ?? canonical?.[1] ?? symbol;
  const mapped = market === "XBOM" ? (BSE_TO_NSE_LOGO[base] ?? base) : base;
  return [`${mapped}-XNSE`];
}

function getCryptoProviderCompatibilityFilenames(symbol: string): string[] {
  const pairMatch = /^(.+)-([A-Z]{3,5})$/.exec(symbol);
  if (!pairMatch) return [];

  const baseSymbol = normalizeFilenameSymbol(pairMatch[1]);
  return baseSymbol ? [`crypto/${baseSymbol}`] : [];
}

function isCryptoInstrument(instrumentType: unknown): boolean {
  if (typeof instrumentType !== "string") return false;
  const normalized = instrumentType.trim().toUpperCase();
  return normalized === "CRYPTO" || normalized === "CRYPTOCURRENCY";
}

function encodeLogoFilename(filename: string): string {
  return filename.split("/").map(encodeURIComponent).join("/");
}

/** Resolve an asset identity to the exact market-specific filename stem. */
export function resolveTickerLogoFilename(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string | undefined {
  const normalized = normalizeTickerLogoSymbol(symbol);
  if (!normalized) return undefined;

  if (isCryptoInstrument(instrumentType)) {
    return `crypto/${normalizeFilenameSymbol(normalized)}`;
  }

  if (CANONICAL_MARKET_SUFFIX.test(normalized)) return normalized;

  const filenameSymbol = normalizeFilenameSymbol(normalized);
  const marketMic = normalizeExchangeMic(exchangeMic);
  return marketMic ? `${filenameSymbol}-${marketMic}` : filenameSymbol;
}

/** Exact market logo first, then the unsuffixed logo used by US and shared listings. */
export function resolveTickerLogoFilenames(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string[] {
  const exactFilename = resolveTickerLogoFilename(symbol, exchangeMic, instrumentType);
  if (!exactFilename) return [];

  const normalizedSymbol = normalizeTickerLogoSymbol(symbol) ?? "";
  if (isCryptoInstrument(instrumentType)) {
    return [exactFilename, ...getCryptoProviderCompatibilityFilenames(normalizedSymbol)].filter(
      (filename, index, filenames) => filenames.indexOf(filename) === index,
    );
  }

  const providerCompatibilityFilenames = getProviderSuffixCompatibilityFilenames(normalizedSymbol);

  const canonicalMatch = CANONICAL_MARKET_SUFFIX.exec(exactFilename);
  const bareFilename = canonicalMatch
    ? canonicalMatch[1]
    : normalizeFilenameSymbol(normalizedSymbol);

  return [
    exactFilename,
    ...getIndianCompatibilityFilenames(normalizedSymbol, exchangeMic),
    ...providerCompatibilityFilenames,
    bareFilename,
  ].filter((filename, index, filenames) => !!filename && filenames.indexOf(filename) === index);
}

export function getTickerLogoPath(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string {
  const filename = resolveTickerLogoFilename(symbol, exchangeMic, instrumentType);
  return filename ? `/ticker-logos/${encodeLogoFilename(filename)}.png` : "";
}

export function getTickerLogoPaths(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string[] {
  const filenames = resolveTickerLogoFilenames(symbol, exchangeMic, instrumentType);
  const normalized = normalizeTickerLogoSymbol(symbol);
  if (normalized && /^INE[A-Z0-9]{9}$/.test(normalized) && !isCryptoInstrument(instrumentType)) {
    return [`https://api.dharun.dev/v1/logos/${normalized}?format=png&size=128`];
  }
  // Fund look-through names a US or other foreign stock by ISIN. Bundled logos
  // are ticker files, so the mark is loaded from the ISIN instead.
  if (
    normalized &&
    /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(normalized) &&
    !isCryptoInstrument(instrumentType)
  ) {
    return [`https://assets.parqet.com/logos/isin/${normalized}?format=png`];
  }
  // Only an explicit Indian exchange identifies this provider's universe.
  // Never send an ambiguous bare ticker (e.g. NXST) to an Indian provider.
  const indian =
    normalized && !isCryptoInstrument(instrumentType)
      ? getIndianCompatibilityFilenames(normalized, exchangeMic)[0]
      : undefined;
  if (indian && normalized) {
    const prefix = /^(NSE|BSE):(.+)$/.exec(normalized);
    const suffix = /^(.+)\.(NS|BO)$/.exec(normalized);
    const canonical = /^(.+)-(XNSE|XBOM)$/.exec(normalized);
    const base = prefix?.[2] ?? suffix?.[1] ?? canonical?.[1] ?? normalized;
    const mic = prefix
      ? prefix[1] === "NSE"
        ? "XNSE"
        : "XBOM"
      : (canonical?.[2] ??
        normalizeExchangeMic(exchangeMic) ??
        (suffix?.[2] === "BO" ? "XBOM" : "XNSE"));
    if (base === "NXST" && mic === "XNSE") {
      return ["/ticker-logos/NXST-XNSE.ico"];
    }
    // The logo service keys NSE trading symbols. A BSE trade still uses that
    // symbol (HAL on XBOM), and BSE:HAL 404s, so the NSE mark has to be first.
    const nseSymbol =
      mic === "XBOM" ? (BSE_TO_NSE_LOGO[base] ?? (/^\d+$/.test(base) ? undefined : base)) : base;
    const remote = [
      nseSymbol
        ? `https://api.dharun.dev/v1/logos/${encodeURIComponent(`NSE:${nseSymbol}`)}?format=png&size=128`
        : "",
      mic === "XBOM"
        ? `https://api.dharun.dev/v1/logos/${encodeURIComponent(`BSE:${base}`)}?format=png&size=128`
        : "",
    ].filter((url, index, urls) => !!url && urls.indexOf(url) === index);
    return [
      ...remote,
      // Unsuffixed US logos can belong to a completely different company.
      ...filenames
        .filter((filename) => /-(XNSE|XBOM)$/.test(filename))
        .map((filename) => `/ticker-logos/${encodeLogoFilename(filename)}.png`),
    ];
  }
  return filenames.map((filename) => `/ticker-logos/${encodeLogoFilename(filename)}.png`);
}
