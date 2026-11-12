import { ACTIVITY_SUBTYPES, ActivityType } from "@/lib/constants";
import type { DraftActivity } from "../context";
import {
  applyAssetResolution,
  buildImportAssetCandidateFromDraft,
  buildImportAssetCandidateKey,
  buildNewAssetFromDraft,
  buildNewAssetFromSearchResult,
} from "./asset-review-utils";
import { validateDraft } from "./draft-utils";

function createDraft(overrides: Partial<DraftActivity> = {}): DraftActivity {
  return {
    rowIndex: 0,
    rawRow: [],
    activityDate: "2024-01-15",
    activityType: ActivityType.BUY,
    symbol: "AAPL",
    quantity: "1",
    unitPrice: "100",
    amount: "100",
    currency: "USD",
    accountId: "acc-1",
    status: "valid",
    errors: {},
    warnings: {},
    isEdited: false,
    ...overrides,
  };
}

describe("import asset rules", () => {
  it("builds asset candidates for staking rewards", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        activityType: ActivityType.INTEREST,
        subtype: ACTIVITY_SUBTYPES.STAKING_REWARD,
        symbol: "SOL",
        instrumentType: "CRYPTO",
        quoteCcy: "USD",
      }),
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.symbol).toBe("SOL");
  });

  it("builds asset candidates for symbol-backed adjustments", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        activityType: ActivityType.ADJUSTMENT,
        subtype: "CORPORATE_ACTION",
        symbol: "AAPL",
        instrumentType: "EQUITY",
      }),
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.symbol).toBe("AAPL");
  });

  it.each(["----", "$FOO"])(
    "does not build an asset candidate for adjustment placeholder %s",
    (symbol) => {
      const candidate = buildImportAssetCandidateFromDraft(
        createDraft({
          activityType: ActivityType.ADJUSTMENT,
          subtype: "CASH_SWEEP",
          symbol,
        }),
      );

      expect(candidate).toBeNull();
    },
  );

  it("keeps otherwise identical candidates distinct when their ISIN differs", () => {
    const first = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "SHOP",
        instrumentType: "EQUITY",
        quoteCcy: "CAD",
        isin: "ca82509l1076",
      }),
    );
    const second = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "SHOP",
        instrumentType: "EQUITY",
        quoteCcy: "CAD",
        isin: "CA82509L1077",
      }),
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.key).not.toBe(second?.key);
  });

  it("preserves the existing candidate key shape when provider identity is absent", () => {
    const key = buildImportAssetCandidateKey({
      accountId: "acc-1",
      symbol: "SHOP",
      instrumentType: "EQUITY",
      quoteCcy: "CAD",
      exchangeMic: "XTSE",
    });

    expect(key).toBe("SHOP::EQUITY::::XTSE::CAD::");
  });

  it("omits default-sourced currency from asset preview candidates", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "VOD.L",
        instrumentType: "EQUITY",
        currency: "CAD",
        currencySource: "default",
      }),
    );

    expect(candidate?.currency).toBeUndefined();
    expect(candidate?.key).toBe(
      buildImportAssetCandidateKey({
        accountId: "acc-1",
        symbol: "VOD.L",
        instrumentType: "EQUITY",
      }),
    );
  });

  it("keeps explicit CSV currency in asset preview candidates", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "VOD.L",
        instrumentType: "EQUITY",
        currency: "USD",
        currencySource: "csv",
      }),
    );

    expect(candidate?.currency).toBe("USD");
    expect(candidate?.key).toBe(
      buildImportAssetCandidateKey({
        accountId: "acc-1",
        symbol: "VOD.L",
        instrumentType: "EQUITY",
        quoteCcy: "USD",
      }),
    );
  });

  it("keeps same-symbol provider variants distinct for asset preview", () => {
    const staleKey = buildImportAssetCandidateKey({
      accountId: "acc-1",
      symbol: "XAU",
      instrumentType: "METAL",
      quoteCcy: "USD",
    });
    const first = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "XAU",
        instrumentType: "METAL",
        quoteCcy: "USD",
        providerId: "METAL_PRICE_API",
        providerSymbol: "XAU-1KG",
        assetCandidateKey: staleKey,
      }),
    );
    const second = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "XAU",
        instrumentType: "METAL",
        quoteCcy: "USD",
        providerId: "METAL_PRICE_API",
        providerSymbol: "XAU-OZ",
        assetCandidateKey: staleKey,
      }),
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.key).not.toBe(staleKey);
    expect(first?.key).not.toBe(second?.key);
  });

  it("applies provider-specific preview resolutions to stale provider-less draft keys", () => {
    const staleKey = buildImportAssetCandidateKey({
      accountId: "acc-1",
      symbol: "XAU",
      instrumentType: "METAL",
      quoteCcy: "USD",
    });
    const first = createDraft({
      rowIndex: 1,
      symbol: "XAU",
      instrumentType: "METAL",
      quoteCcy: "USD",
      providerId: "METAL_PRICE_API",
      providerSymbol: "XAU-1KG",
      assetCandidateKey: staleKey,
    });
    const second = createDraft({
      rowIndex: 2,
      symbol: "XAU",
      instrumentType: "METAL",
      quoteCcy: "USD",
      providerId: "METAL_PRICE_API",
      providerSymbol: "XAU-OZ",
      assetCandidateKey: staleKey,
    });
    const firstKey = buildImportAssetCandidateFromDraft(first)?.key;

    if (!firstKey) throw new Error("expected provider-specific candidate key");

    const resolved = applyAssetResolution(
      [first, second],
      firstKey,
      {
        kind: "INVESTMENT",
        name: "Gold 1kg",
        displayCode: "XAU",
        isActive: true,
        quoteMode: "MARKET",
        quoteCcy: "USD",
        instrumentType: "METAL",
        instrumentSymbol: "XAU",
        providerId: "METAL_PRICE_API",
        providerSymbol: "XAU-1KG",
      },
      { importAssetKey: firstKey },
    );

    expect(resolved[0].assetCandidateKey).toBe(firstKey);
    expect(resolved[0].importAssetKey).toBe(firstKey);
    expect(resolved[1].assetCandidateKey).toBe(staleKey);
    expect(resolved[1].importAssetKey).toBeUndefined();
  });

  it("keeps resolved no-provider previews on their original key after provider enrichment", () => {
    const previewKey = buildImportAssetCandidateKey({
      accountId: "acc-1",
      symbol: "SHOP",
      instrumentType: "EQUITY",
      quoteCcy: "CAD",
      exchangeMic: "XTSE",
    });
    const [resolved] = applyAssetResolution(
      [
        createDraft({
          symbol: "SHOP",
          instrumentType: "EQUITY",
          quoteCcy: "CAD",
          exchangeMic: "XTSE",
          assetCandidateKey: previewKey,
        }),
      ],
      previewKey,
      {
        kind: "INVESTMENT",
        name: "Shopify Inc.",
        displayCode: "SHOP",
        isActive: true,
        quoteMode: "MARKET",
        quoteCcy: "CAD",
        instrumentType: "EQUITY",
        instrumentSymbol: "SHOP",
        instrumentExchangeMic: "XTSE",
        providerId: "YAHOO",
        providerSymbol: "SHOP.TO",
      },
      { importAssetKey: previewKey },
    );

    expect(buildImportAssetCandidateFromDraft(resolved)?.key).toBe(previewKey);
  });

  it("builds new assets from canonical search identity, not review symbol", () => {
    const draft = buildNewAssetFromSearchResult(
      {
        symbol: "SHOP.TO",
        canonicalSymbol: "SHOP",
        canonicalExchangeMic: "XTSE",
        providerId: "YAHOO",
        providerSymbol: "SHOP.TO",
        exchange: "TSX",
        exchangeMic: "XTSE",
        shortName: "Shopify Inc.",
        longName: "Shopify Inc.",
        quoteType: "EQUITY",
        index: "",
        score: 1,
        typeDisplay: "Equity",
        currency: "CAD",
      },
      "USD",
    );

    expect(draft.displayCode).toBe("SHOP");
    expect(draft.instrumentSymbol).toBe("SHOP");
    expect(draft.instrumentExchangeMic).toBe("XTSE");
    expect(draft.providerId).toBe("YAHOO");
    expect(draft.providerSymbol).toBe("SHOP.TO");
  });

  it("infers Indian exchange from a selected Yahoo listing when exchange metadata is absent", () => {
    const draft = buildNewAssetFromSearchResult(
      {
        symbol: "MONIFTY500.NS",
        canonicalSymbol: "MONIFTY500",
        providerId: "YAHOO",
        providerSymbol: "MONIFTY500.NS",
        exchange: "",
        shortName: "Motilal Oswal Nifty 500 ETF",
        longName: "Motilal Oswal Nifty 500 ETF",
        quoteType: "ETF",
        index: "",
        score: 1,
        typeDisplay: "Equity",
        currency: "INR",
      },
      "INR",
    );

    expect(draft.instrumentExchangeMic).toBe("XNSE");
  });

  it("clears stale provider refs when applying a manual asset resolution", () => {
    const [resolved] = applyAssetResolution(
      [
        createDraft({
          symbol: "MSF.DE",
          assetCandidateKey: "MSF.DE::EQUITY::::XETR::EUR::",
          providerId: "YAHOO",
          providerSymbol: "MSF.DE",
        }),
      ],
      "MSF.DE::EQUITY::::XETR::EUR::",
      {
        kind: "INVESTMENT",
        name: "Manual Microsoft Xetra",
        displayCode: "MSF",
        isActive: true,
        quoteMode: "MANUAL",
        quoteCcy: "EUR",
        instrumentType: "EQUITY",
        instrumentSymbol: "MSF",
        instrumentExchangeMic: "XETR",
      },
      { importAssetKey: "MSF.DE::EQUITY::::XETR::EUR::" },
    );

    expect(resolved.symbol).toBe("MSF");
    expect(resolved.providerId).toBeUndefined();
    expect(resolved.providerSymbol).toBeUndefined();
  });

  it("keeps provider refs when building a new asset from a reviewed draft", () => {
    const draft = buildNewAssetFromDraft(
      createDraft({
        symbol: "XAU",
        symbolName: "Gold",
        exchangeMic: undefined,
        quoteCcy: "USD",
        instrumentType: "METAL",
        providerId: "METAL_PRICE_API",
        providerSymbol: "XAU-1KG",
      }),
    );

    expect(draft?.providerId).toBe("METAL_PRICE_API");
    expect(draft?.providerSymbol).toBe("XAU-1KG");
  });

  it("keeps provider refs when building an import asset candidate", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "XAU",
        quoteCcy: "USD",
        instrumentType: "METAL",
        providerId: "METAL_PRICE_API",
        providerSymbol: "XAU-1KG",
      }),
    );

    expect(candidate?.providerId).toBe("METAL_PRICE_API");
    expect(candidate?.providerSymbol).toBe("XAU-1KG");
  });

  it("does not ask which Indian exchange a stock was bought on", () => {
    const validation = validateDraft(
      createDraft({
        currency: "INR",
        symbol: "RELIANCE",
        isin: "INE002A01018",
      }),
    );

    expect(validation.errors.symbol).toBeUndefined();
  });

  it("accepts an Indian stock once the listing is known", () => {
    const validation = validateDraft(
      createDraft({
        currency: "INR",
        symbol: "RELIANCE",
        isin: "INE002A01018",
        exchangeMic: "XNSE",
      }),
    );

    expect(validation.errors.symbol).toBeUndefined();
  });

  it("accepts a listed Indian ETF without an AMFI scheme code", () => {
    const validation = validateDraft(
      createDraft({
        currency: "INR",
        symbol: "MONIFTY500",
        isin: "INF247L01BU1",
        exchangeMic: "NSE",
      }),
    );

    expect(validation.errors.symbol).toBeUndefined();
  });

  it("keeps a Zerodha ETF's exchange when its selected search result has none", () => {
    const key = buildImportAssetCandidateKey({
      accountId: "acc-1",
      symbol: "MONIFTY500",
      instrumentType: "EQUITY",
      quoteCcy: "INR",
      exchangeMic: "XNSE",
      isin: "INF247L01BU1",
    });
    const [resolved] = applyAssetResolution(
      [
        createDraft({
          currency: "INR",
          symbol: "MONIFTY500",
          isin: "INF247L01BU1",
          instrumentType: "EQUITY",
          quoteCcy: "INR",
          exchangeMic: "XNSE",
          assetCandidateKey: key,
        }),
      ],
      key,
      {
        kind: "INVESTMENT",
        name: "Motilal Oswal Nifty 500 ETF",
        displayCode: "MONIFTY500",
        isActive: true,
        quoteMode: "MARKET",
        quoteCcy: "INR",
        instrumentType: "EQUITY",
        instrumentSymbol: "MONIFTY500",
        providerId: "YAHOO",
        providerSymbol: "MONIFTY500.NS",
      },
      { importAssetKey: key },
    );

    expect(resolved.exchangeMic).toBe("XNSE");
    expect(validateDraft(resolved).errors.symbol).toBeUndefined();
  });

  it("requires an AMFI scheme code for an Indian fund ISIN", () => {
    const validation = validateDraft(
      createDraft({
        currency: "INR",
        symbol: "HDFC Flexi Cap Direct Growth",
        isin: "INF179K01UT0",
      }),
    );

    expect(validation.errors.symbol?.[0]).toMatch(/AMFI/);
  });

  it("allows a bonus issue with no purchase price", () => {
    const validation = validateDraft(
      createDraft({
        currency: "INR",
        symbol: "RELIANCE",
        isin: "INE002A01018",
        exchangeMic: "XNSE",
        subtype: ACTIVITY_SUBTYPES.BONUS_ISSUE,
        unitPrice: "0",
        amount: "0",
      }),
    );

    expect(validation.errors.unitPrice).toBeUndefined();
  });

  it("requires a symbol for DRIP dividends", () => {
    const validation = validateDraft(
      createDraft({
        activityType: ActivityType.DIVIDEND,
        subtype: ACTIVITY_SUBTYPES.DRIP,
        symbol: undefined,
        quantity: "1",
        unitPrice: "100",
        amount: "100",
      }),
    );

    expect(validation.status).toBe("error");
    expect(validation.errors.symbol).toEqual(["Symbol is required for DRIP dividends"]);
  });

  it("requires a symbol for dividend in kind", () => {
    const validation = validateDraft(
      createDraft({
        activityType: ActivityType.DIVIDEND,
        subtype: ACTIVITY_SUBTYPES.DIVIDEND_IN_KIND,
        symbol: undefined,
        quantity: "1",
        unitPrice: "100",
        amount: "100",
      }),
    );

    expect(validation.status).toBe("error");
    expect(validation.errors.symbol).toEqual([
      "Symbol is required for dividend in kind activities",
    ]);
  });
});
