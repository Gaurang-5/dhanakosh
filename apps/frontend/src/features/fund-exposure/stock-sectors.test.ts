import { describe, expect, it } from "vitest";
import type { Asset, Holding } from "@/lib/types";
import { holdingSector, isFundHolding, stockSectorLookup } from "./stock-sectors";

describe("shared stock sector resolution", () => {
  it("uses saved provider profiles and matches both asset ID and ISIN", () => {
    const lookup = stockSectorLookup([
      {
        id: "apple",
        kind: "INVESTMENT",
        quoteMode: "MARKET",
        quoteCcy: "USD",
        instrumentSymbol: "AAPL",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        metadata: {
          identifiers: { isin: "US0378331005" },
          profile: { sectors: '[{"name":"Technology","weight":1}]' },
        },
      } as Asset,
    ]);
    expect(lookup.apple).toBe("Information Technology");
    expect(lookup.US0378331005).toBe("Information Technology");
    expect(lookup["US:AAPL"]).toBe("Information Technology");
  });
  it("preserves explicit classification ahead of provider data", () => {
    const holding = {
      instrument: {
        id: "a",
        classifications: { sectors: [{ topLevelCategory: { name: "Custom sector" } }] },
      },
    } as Holding;
    expect(holdingSector(holding, { a: "Technology" })).toBe("Custom sector");
  });
  it("recognizes ETFs and Yahoo mutual fund codes without treating equity as a fund", () => {
    expect(isFundHolding({ instrument: { instrumentType: "ETF" } } as Holding)).toBe(true);
    expect(isFundHolding({ instrument: { symbol: "0P0000XW77" } } as Holding)).toBe(true);
    expect(
      isFundHolding({ instrument: { instrumentType: "EQUITY", symbol: "AAPL" } } as Holding),
    ).toBe(false);
    expect(
      isFundHolding({
        instrument: {
          instrumentType: "EQUITY",
          symbol: "NIFTYBEES",
          name: "Nippon India ETF Nifty 50 BeES",
        },
      } as Holding),
    ).toBe(true);
    expect(
      isFundHolding({
        instrument: { instrumentType: "EQUITY", symbol: "RELIANCE", name: "Reliance Industries" },
      } as Holding),
    ).toBe(false);
  });
  it("ignores malformed provider sector JSON", () => {
    expect(
      stockSectorLookup([
        {
          id: "bad",
          kind: "INVESTMENT",
          quoteMode: "MARKET",
          quoteCcy: "USD",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          metadata: { profile: { sectors: "{" } },
        } as Asset,
      ]).bad,
    ).toBeUndefined();
  });
});
