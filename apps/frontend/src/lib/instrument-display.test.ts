import { describe, expect, it } from "vitest";

import {
  getInstrumentAvatarIdentity,
  getInstrumentPrimaryLabel,
  getInstrumentSecondaryLabel,
  isYahooMutualFundInstrument,
} from "./instrument-display";

describe("instrument display identity", () => {
  it("uses an official mutual-fund name instead of the Yahoo quote code", () => {
    const instrument = {
      symbol: "0P0000XW77",
      name: "HDFC Flexi Cap Dir Gr",
      exchangeMic: "XBOM",
    };

    expect(isYahooMutualFundInstrument(instrument)).toBe(true);
    expect(getInstrumentPrimaryLabel(instrument)).toBe("HDFC Flexi Cap Dir Gr");
    expect(getInstrumentSecondaryLabel(instrument)).toBeNull();
  });

  it("resolves a mutual fund to its fund-house logo identity", () => {
    expect(
      getInstrumentAvatarIdentity({
        symbol: "0P00005WZZ",
        name: "ICICI Prudential Value Gr",
        exchangeMic: "XBOM",
      }),
    ).toEqual({ symbol: "ICICIPRULI", exchangeMic: "XNSE" });
  });

  it("falls back to readable fund-house initials instead of a technical code", () => {
    expect(
      getInstrumentAvatarIdentity({
        symbol: "0P00005VCZ",
        name: "Franklin India Large Cap Gr",
        exchangeMic: "XBOM",
      }),
    ).toEqual({ symbol: "FRANKLIN", exchangeMic: undefined });
  });

  it.each([
    { symbol: "INF179K01BE2", name: "HDFC Flexi Cap Direct Growth" },
    { symbol: "123456", name: "HDFC Flexi Cap Direct Growth", instrumentType: "MUTUAL_FUND" },
  ])("uses scheme names for ISIN and typed mutual funds", (instrument) => {
    expect(getInstrumentPrimaryLabel(instrument)).toBe(instrument.name);
    expect(getInstrumentSecondaryLabel(instrument)).toBeNull();
    expect(getInstrumentAvatarIdentity(instrument).symbol).toBe("HDFCAMC");
  });

  it("preserves the ticker and name behavior for ordinary stocks", () => {
    const instrument = { symbol: "HDFCBANK", name: "HDFC Bank Limited", exchangeMic: "XNSE" };

    expect(getInstrumentPrimaryLabel(instrument)).toBe("HDFCBANK");
    expect(getInstrumentSecondaryLabel(instrument)).toBe("HDFC Bank Limited");
    expect(getInstrumentAvatarIdentity(instrument)).toEqual({
      symbol: "HDFCBANK",
      exchangeMic: "XNSE",
    });
  });
});
