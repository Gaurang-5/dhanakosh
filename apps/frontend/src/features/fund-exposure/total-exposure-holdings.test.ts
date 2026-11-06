import type { ExposureContribution } from "@/adapters/shared/fund-exposure";
import { describe, expect, it } from "vitest";
import { aggregateTotalExposure, exposureSecurityIdentity } from "./total-exposure-model";

function contribution(
  value: string,
  viaFund: string | null,
  assetId: string,
): ExposureContribution {
  return {
    identifier: "NSE:TCS",
    name: "Tata Consultancy Services Limited",
    assetId,
    accountId: "account-1",
    viaFund,
    source: viaFund ? "BHARATSTOCK" : null,
    asOf: viaFund ? "2026-09-01" : null,
    value,
  };
}

describe("aggregateTotalExposure", () => {
  it("keeps direct and fund exposure separate while producing one total", () => {
    const rows = aggregateTotalExposure([
      contribution("32955", null, "tcs-asset"),
      contribution("1200", "Fund A", "fund-a"),
      contribution("800", "Fund B", "fund-b"),
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        identifier: "NSE:TCS",
        directValue: 32955,
        fundValue: 2000,
        totalValue: 34955,
        fundCount: 2,
        directAssetId: "tcs-asset",
        funds: [
          { name: "Fund A", value: 1200, assetId: "fund-a" },
          { name: "Fund B", value: 800, assetId: "fund-b" },
        ],
      }),
    ]);
  });
  it("combines repeated contributions from the same fund", () => {
    const rows = aggregateTotalExposure([
      contribution("100", "Fund A", "fund-a"),
      contribution("40", "Fund A", "fund-a-again"),
      contribution("10", "Fund B", "fund-b"),
      contribution("5", null, "tcs-asset"),
    ]);

    expect(rows[0]).toMatchObject({
      directValue: 5,
      fundValue: 150,
      fundCount: 2,
      funds: [
        { name: "Fund A", value: 140, assetId: "fund-a" },
        { name: "Fund B", value: 10, assetId: "fund-b" },
      ],
    });
  });
  it("joins ISIN and NSE ticker disclosures for the same stock", () => {
    const isin = { ...contribution("1200", "Fund A", "fund-a"), identifier: "INE467B01029" };
    const rows = aggregateTotalExposure([contribution("32955", null, "tcs-asset"), isin]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ identifier: "NSE:TCS", totalValue: 34155 });
  });
});

describe("exposureSecurityIdentity", () => {
  it("shows an exchange ticker the same way a holding row shows its symbol", () => {
    expect(exposureSecurityIdentity("NSE:HDFCBANK", "HDFC Bank Limited")).toEqual({
      logoSymbol: "HDFCBANK",
      exchangeMic: "XNSE",
      primary: "HDFCBANK",
      secondary: "HDFC Bank Limited",
    });
    expect(exposureSecurityIdentity("US:GOOGL", "Alphabet Inc.")).toEqual({
      logoSymbol: "GOOGL",
      primary: "GOOGL",
      secondary: "Alphabet Inc.",
    });
  });

  it("keeps an ISIN readable by leading with the company name", () => {
    expect(exposureSecurityIdentity("INE040A01034", "HDFC Bank Limited")).toMatchObject({
      logoSymbol: "INE040A01034",
      primary: "HDFC Bank Limited",
      secondary: "INE040A01034",
    });
  });
});
